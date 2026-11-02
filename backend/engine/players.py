"""Player rates, season projections and simulated player stats. Pure Python + numpy, no web code.

Method, in three steps:
  1. Rate: each player's per-game production = this season's total blended with last season's per-game
     rate (a few games' worth, so a hot or cold start doesn't dominate).
  2. Project: current total + rate x availability x remaining team games.
  3. Simulate: for each remaining game, decide whether the player plays, then draw his stats around his
     rate. Winning teams produce more touchdowns, rushing and takeaways, and losing teams throw more, by
     amounts measured from 2020-2025 (game_flow.json, built by scripts/fit_game_flow.py). So the same
     simulated team results drive both the record and the player numbers.
"""
import json
from pathlib import Path

import numpy as np

_FLOW_FILE = Path(__file__).with_name("game_flow.json")
GAME_FLOW: dict[str, dict[str, float]] = json.loads(_FLOW_FILE.read_text()) if _FLOW_FILE.exists() else {}

# Stats shown for each position, in column order.
POSITION_STATS: dict[str, list[str]] = {
    "QB": ["completions", "attempts", "passing_yards", "passing_tds", "passing_interceptions", "rushing_yards", "rushing_tds"],
    "RB": ["carries", "rushing_yards", "rushing_tds", "receptions", "receiving_yards", "receiving_tds"],
    "WR": ["targets", "receptions", "receiving_yards", "receiving_tds"],
    "TE": ["targets", "receptions", "receiving_yards", "receiving_tds"],
    "OL": [],
    "DL": ["tackles", "def_tackles_for_loss", "def_sacks", "def_interceptions", "def_pass_defended"],
    "LB": ["tackles", "def_tackles_for_loss", "def_sacks", "def_interceptions", "def_pass_defended"],
    "DB": ["tackles", "def_tackles_for_loss", "def_sacks", "def_interceptions", "def_pass_defended"],
    "K": ["fg_made", "fg_att", "pat_made", "pat_att"],
    "P": ["pt_att", "pt_yards", "pt_inside_20"],
    "LS": [],
}

# Touchdowns are mostly luck: a player's yardage predicts his future TDs better than his TD count does. So each TD rate
# is blended with the rate his yardage implies. (stat -> (yardage stat, league TDs per yard, weight on the yardage-implied
# rate). Per-yard values are 2019-2025 league averages; weights are the ones that minimized the error of weeks 8+ forecasts
# made from weeks 1-7 in 2019-2025: see scripts/check_td_regression.py.)
TD_FROM_YARDS: dict[tuple[str, str], tuple[str, float, float]] = {
    ("QB", "passing_tds"): ("passing_yards", 0.0065, 0.75),
    ("QB", "rushing_tds"): ("rushing_yards", 0.0110, 0.40),
    ("RB", "rushing_tds"): ("rushing_yards", 0.0074, 0.75),
    ("RB", "receiving_tds"): ("receiving_yards", 0.0053, 0.75),
    ("WR", "receiving_tds"): ("receiving_yards", 0.0061, 0.75),
    ("TE", "receiving_tds"): ("receiving_yards", 0.0073, 0.75),
}

# How uncertain a player's true TD rate is after the regression above, as a fraction of the rate. Measured by the same
# backtest (scripts/check_td_regression.py): forecast error beyond what pure chance (Poisson) explains was 19% of the
# forecast for QB passing TDs, 33% for RB rushing TDs and 29% for receiving TDs. For QB rushing TDs it was 47%, but that
# is dominated by low-volume QBs, so 35% is used.
TD_TALENT_CV = {("QB", "passing_tds"): 0.20, ("QB", "rushing_tds"): 0.35, ("RB", "rushing_tds"): 0.33,
                ("RB", "receiving_tds"): 0.33, ("WR", "receiving_tds"): 0.29, ("TE", "receiving_tds"): 0.29}

# Guard against absurd draws: a player's true rate is never more than this multiple of the estimate (touchdowns / other
# stats). Touchdown rates are the most tightly bounded by how often a team can score.
TD_STATS = {"passing_tds", "rushing_tds", "receiving_tds"}
MAX_TALENT_MULTIPLIER = {True: 1.7, False: 2.0}

PRIOR_GAMES = 3.0        # last season's rate counts as this many games of evidence
AVAIL_PRIOR = 0.9        # assumed chance a player suits up, blended in with his record this season
AVAIL_GAMES = 2.0        # ...worth this many games
STATUS_AVAIL = {"ACT": 1.0, "INA": 0.5, "RES": 0.0}   # roster status -> multiplier on availability


def total_tackles(totals: dict) -> float:
    return totals.get("def_tackles_solo", 0.0) + totals.get("def_tackle_assists", 0.0)


def _stat_totals(raw: dict | None, position: str) -> dict[str, float]:
    """The position's stats from a player-season row of PLAYER_STAT_COLUMNS sums (missing row = zeros)."""
    raw = raw or {}
    out = {}
    for s in POSITION_STATS.get(position, []):
        out[s] = total_tackles(raw) if s == "tackles" else float(raw.get(s, 0.0) or 0.0)
    return out


def build_player(roster: dict, cur: dict | None, prev: dict | None, cur_games: int, prev_games: int,
                 team_games_played: int, remaining_games: int) -> dict:
    """One player's current totals, per-game rates and projection.

    `roster`: id, name, position, status. `cur`/`prev`: that player's season totals (PLAYER_STAT_COLUMNS
    sums) this and last season, or None. `*_games`: games he was on the field.
    """
    pos = roster["position"]
    stats_cur = _stat_totals(cur, pos)
    stats_prev = _stat_totals(prev, pos)
    rates = {}
    for s, tot in stats_cur.items():
        if prev_games > 0:
            rates[s] = (tot + stats_prev[s] / prev_games * PRIOR_GAMES) / (cur_games + PRIOR_GAMES)
        else:                                          # rookie or newcomer: nothing to blend with
            rates[s] = tot / cur_games if cur_games > 0 else 0.0
    for s_, (yard_stat, td_per_yard, weight) in ((k[1], v) for k, v in TD_FROM_YARDS.items() if k[0] == pos):
        if s_ in rates and yard_stat in rates:
            rates[s_] = weight * rates[yard_stat] * td_per_yard + (1 - weight) * rates[s_]
    rates = {k: max(0.0, v) for k, v in rates.items()}     # a QB's kneel-downs can make his rushing yards negative; rates can't be
    base = (cur_games + AVAIL_PRIOR * AVAIL_GAMES) / (team_games_played + AVAIL_GAMES) if team_games_played else AVAIL_PRIOR
    base = min(1.0, base)
    if cur_games == 0 and prev_games == 0:
        base *= 0.3     # no track record: likely a reserve who rarely plays
    availability = base * STATUS_AVAIL.get(roster["status"], 0.0)
    player = {
        **roster,
        "gp": cur_games,
        "stats": stats_cur,
        "rates": rates,
        "avail": availability,
        "avail_full": base,       # availability ignoring current injury status: used to replay a whole season
    }
    return project(player, remaining_games)


def project(player: dict, remaining_games: int) -> dict:
    """Fill in a player's projected games and final totals from his availability and per-game rates."""
    exp_games = player["avail"] * remaining_games
    player["proj_gp"] = player["gp"] + exp_games
    player["proj"] = {s: player["stats"][s] + player["rates"][s] * exp_games for s in player["stats"]}
    return player


# Positions where only one player is on the field at a time. For these the players' chances of playing must add up to
# one game's worth, not one each: a backup quarterback plays only when the starter doesn't. Value = the chance a healthy
# player is available for any given game (quarterbacks get hurt; kickers rarely do).
ONE_AT_A_TIME = {"QB": 0.93, "K": 0.97, "P": 0.97, "LS": 0.97}


def apply_depth_chart(players: list[dict], remaining_games: int, starter_ids: dict[str, str] | None = None) -> None:
    """Split games among a team's players at one-at-a-time positions (updates `players` in place).

    Players are ranked: the projected starter (`starter_ids`, e.g. the quarterback listed for the next game) first,
    then whoever has played the most. The first plays unless he's out, the second only if the first is out, and so on,
    so a backup who filled in earlier this season gets only the games the starter is likely to miss.
    """
    starter_ids = starter_ids or {}
    for pos, healthy in ONE_AT_A_TIME.items():
        group = [p for p in players if p["position"] == pos]
        if not group:
            continue
        group.sort(key=lambda p: (p["id"] == starter_ids.get(pos), p["stats"].get("attempts", p["gp"]), p["gp"]), reverse=True)
        for field, chance in (("avail", lambda p: healthy * STATUS_AVAIL.get(p["status"], 0.0)), ("avail_full", lambda p: healthy)):
            nobody_ahead_plays = 1.0
            for p in group:
                h = chance(p)
                p[field] = nobody_ahead_plays * h
                nobody_ahead_plays *= 1 - h
        for p in group:
            project(p, remaining_games)


def _flow(stat: str, win: np.ndarray) -> np.ndarray:
    """Per-game multiplier for a stat: its measured level in wins / losses relative to average."""
    f = GAME_FLOW.get(stat)
    if not f:
        return np.ones(len(win))
    return np.where(win, f["win"], f["loss"])


def _gamma(rng, mean: np.ndarray, shape: np.ndarray) -> np.ndarray:
    """Gamma draws with the given mean (0 where mean is 0); shape controls spread (bigger = tighter)."""
    mean = np.asarray(mean, dtype=float)
    shape = np.maximum(np.asarray(shape, dtype=float), 1e-6)
    return np.where(mean > 0, rng.gamma(shape, np.where(mean > 0, mean, 1.0) / shape), 0.0)


def _ratio(num: np.ndarray, den: np.ndarray, cap: float | None = None) -> np.ndarray:
    r = np.divide(num, den, out=np.zeros_like(num, dtype=float), where=den > 0)
    return np.minimum(r, cap) if cap is not None else r


def simulate_game_stats(position: str, rates: dict[str, float], win: np.ndarray, rng) -> dict[str, np.ndarray]:
    """Stats for one player over len(win) games he plays in; `win[i]` is whether his team won game i."""
    n = len(win)
    m = {s: np.full(n, r) * _flow(s, win) for s, r in rates.items()}   # mean per game, with game flow
    out: dict[str, np.ndarray] = {}
    if position == "QB":
        att = rng.poisson(m["attempts"])
        comp = rng.binomial(att, _ratio(m["completions"], m["attempts"], 0.95))
        out["attempts"], out["completions"] = att, comp
        out["passing_yards"] = _gamma(rng, comp * _ratio(m["passing_yards"], m["completions"]), comp / 0.5)
        out["passing_tds"] = rng.poisson(att * _ratio(m["passing_tds"], m["attempts"]))
        out["passing_interceptions"] = rng.poisson(att * _ratio(m["passing_interceptions"], m["attempts"]))
        out["rushing_yards"] = _gamma(rng, m["rushing_yards"], np.full(n, 0.8))
        out["rushing_tds"] = rng.poisson(m["rushing_tds"])
    elif position == "RB":
        car = rng.poisson(m["carries"])
        out["carries"] = car
        out["rushing_yards"] = _gamma(rng, car * _ratio(m["rushing_yards"], m["carries"]), car / 1.4)
        out["rushing_tds"] = rng.poisson(car * _ratio(m["rushing_tds"], m["carries"]))
        rec = rng.poisson(m["receptions"])
        out["receptions"] = rec
        out["receiving_yards"] = _gamma(rng, rec * _ratio(m["receiving_yards"], m["receptions"]), rec / 0.7)
        out["receiving_tds"] = rng.poisson(rec * _ratio(m["receiving_tds"], m["receptions"]))
    elif position in ("WR", "TE"):
        tgt = rng.poisson(m["targets"])
        rec = rng.binomial(tgt, _ratio(m["receptions"], m["targets"], 0.95))
        out["targets"], out["receptions"] = tgt, rec
        out["receiving_yards"] = _gamma(rng, rec * _ratio(m["receiving_yards"], m["receptions"]), rec / 0.7)
        out["receiving_tds"] = rng.poisson(rec * _ratio(m["receiving_tds"], m["receptions"]))
    elif position in ("DL", "LB", "DB"):
        for s in POSITION_STATS[position]:
            out[s] = rng.poisson(m[s])
    elif position == "K":
        fga = rng.poisson(m["fg_att"])
        out["fg_att"], out["fg_made"] = fga, rng.binomial(fga, _ratio(m["fg_made"], m["fg_att"], 1.0))
        pat = rng.poisson(m["pat_att"])
        out["pat_att"], out["pat_made"] = pat, rng.binomial(pat, _ratio(m["pat_made"], m["pat_att"], 1.0))
    elif position == "P":
        pts = rng.poisson(m["pt_att"])
        out["pt_att"] = pts
        out["pt_yards"] = _gamma(rng, pts * _ratio(m["pt_yards"], m["pt_att"]), pts / 0.06)
        out["pt_inside_20"] = rng.binomial(pts, _ratio(m["pt_inside_20"], m["pt_att"], 1.0))
    return out


# Stats that come in big piles (yards, attempts, carries, ...): after g games a rate is known to about 25%/sqrt(g).
VOLUME_STATS = {"completions", "attempts", "passing_yards", "carries", "rushing_yards", "targets", "receptions",
                "receiving_yards", "fg_att", "pat_att", "pt_att", "pt_yards"}


def talent_multipliers(player: dict, rng) -> dict[str, float]:
    """A player's true per-game rate is only estimated from the games so far, so each simulated season draws
    a multiplier (mean 1) for every stat. How wide: event stats (sacks, TDs, interceptions, tackles...) are
    known to about 1/sqrt(count so far); volume stats to about 25%/sqrt(games played). Without this a hot start
    looks like certain talent and the favorites win far too often."""
    gp = max(player["gp"], 0)
    out = {}
    for s in player["rates"]:
        if (player["position"], s) in TD_TALENT_CV:
            k = 1.0 / TD_TALENT_CV[(player["position"], s)] ** 2
        elif s in VOLUME_STATS:
            k = max(4.0, gp * 16.0)
        else:
            k = max(1.5, player["stats"].get(s, 0.0) + 1.0)
        out[s] = min(rng.gamma(k, 1.0 / k), MAX_TALENT_MULTIPLIER[s in TD_STATS])
    return out


def simulate_player(player: dict, wins: list[bool], rng, talent_noise: bool = True, full_season: bool = False) -> dict:
    """Simulate a player's games given his team's results (`wins`, one per game simulated).

    Rest-of-season (default): `wins` are the team's remaining games; the result is current totals plus the
    simulated games. Full season: `wins` is every game; results so far are ignored, stats start at zero and
    availability ignores today's injury status (a replay of the whole year).
    Returns {"gp": games played, "stats": totals}."""
    win = np.asarray(wins, dtype=bool)
    plays = rng.random(len(win)) < player["avail_full" if full_season else "avail"]
    rates = player["rates"]
    if talent_noise:
        mult = talent_multipliers(player, rng)
        rates = {s: r * mult[s] for s, r in rates.items()}
    drawn = simulate_game_stats(player["position"], rates, win[plays], rng) if plays.any() else {}
    start = dict.fromkeys(player["stats"], 0.0) if full_season else player["stats"]
    stats = {s: start[s] + float(drawn[s].sum()) if s in drawn else start[s] for s in start}
    return {"gp": (0 if full_season else player["gp"]) + int(plays.sum()), "stats": stats}
