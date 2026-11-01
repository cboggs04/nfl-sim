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
    "QB": ["completions", "attempts", "passing_yards", "passing_tds", "passing_interceptions", "rushing_yards"],
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
    availability = (cur_games + AVAIL_PRIOR * AVAIL_GAMES) / (team_games_played + AVAIL_GAMES) if team_games_played else AVAIL_PRIOR
    availability = min(1.0, availability) * STATUS_AVAIL.get(roster["status"], 0.0)
    if cur_games == 0 and prev_games == 0:
        availability *= 0.3     # no track record: likely a reserve who rarely plays
    exp_games = availability * remaining_games
    return {
        **roster,
        "gp": cur_games,
        "stats": stats_cur,
        "rates": rates,
        "avail": availability,
        "proj_gp": cur_games + exp_games,
        "proj": {s: stats_cur[s] + rates[s] * exp_games for s in stats_cur},
    }


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


def simulate_player(player: dict, wins: list[bool], rng) -> dict:
    """Simulate a player's rest of the season given his team's results in its remaining games.

    Returns {"gp": games played in total, "stats": final totals}; current totals plus simulated games."""
    win = np.asarray(wins, dtype=bool)
    plays = rng.random(len(win)) < player["avail"]
    drawn = simulate_game_stats(player["position"], player["rates"], win[plays], rng) if plays.any() else {}
    stats = {s: player["stats"][s] + float(drawn[s].sum()) if s in drawn else player["stats"][s] for s in player["stats"]}
    return {"gp": player["gp"] + int(plays.sum()), "stats": stats}
