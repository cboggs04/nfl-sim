"""What a trade does to two teams' ratings, in Elo points. Pure Python, no web code.

Only quarterbacks have a real, measured rating in this model (EPA per dropback, engine/qb.py). Everyone else gets an
estimate: their per-game production (the same points formulas the awards use) is ranked against every other player at
the same position, and the rank is turned into Elo points. Those are stated assumptions, not measured effects:
  - a league-average player is worth about nothing, an elite one is worth the position's `MAX_VALUE`;
  - the maximums are rough, round numbers (100 Elo is about 3.5 points of point spread): a great edge rusher or receiver
    moves a team a bit under a point of spread, a great running back or tight end less;
  - the team that gets him gains less when it is already strong at that position (`fit`), and the team that loses him
    loses all of his value;
  - offensive linemen, kickers, punters and long snappers can't be traded (no production stats to rate them).
A traded quarterback is handled separately: the new team gets whichever QB is better, and the old team falls to a backup.
"""
from .awards import defense_points, offense_points

MAX_VALUE = {"RB": 12.0, "WR": 25.0, "TE": 15.0, "DL": 25.0, "LB": 15.0, "DB": 18.0}
TRADABLE = ("QB",) + tuple(MAX_VALUE)
BACKUP_QB_ADJ = -30.0   # a replacement-level backup (QbConfig.prior x elo_per_epa)
MIN_GAMES = 3           # a player needs this many games played to be ranked


def production(position: str, rates: dict[str, float]) -> float:
    """Points per game, from the player's per-game rates."""
    return offense_points(rates) if position in ("RB", "WR", "TE") else defense_points(rates)


def player_values(players_by_team: dict[str, list[dict]]) -> dict[str, float]:
    """player id -> Elo value for every non-QB tradable player in the league."""
    by_pos: dict[str, list[tuple[str, float]]] = {}
    for players in players_by_team.values():
        for p in players:
            if p["position"] in MAX_VALUE and p["gp"] >= MIN_GAMES:
                by_pos.setdefault(p["position"], []).append((p["id"], production(p["position"], p["rates"])))
    values: dict[str, float] = {}
    for pos, rows in by_pos.items():
        order = sorted(rows, key=lambda r: r[1])
        n = len(order)
        for rank, (pid, _) in enumerate(order):
            pct = rank / (n - 1) if n > 1 else 0.5
            above = min(max((pct - 0.4) / 0.6, 0.0), 1.0)   # the bottom 40% are replacement level
            values[pid] = MAX_VALUE[pos] * above ** 1.5
    return values


def player_effect(position: str, value: float, avail: float, to_best: float) -> tuple[float, float]:
    """(Elo change for the team giving up a non-quarterback, Elo change for the team getting him).

    `to_best`: the best Elo value among the new team's players at his position (the less it needs him, the less he adds)."""
    avail = max(0.3, avail)
    fit = min(1.0, max(0.5, 1.0 - 0.5 * to_best / MAX_VALUE[position]))
    return -value * avail, value * fit * avail


def qb_team_delta(before: list[float], leaving: list[float], arriving: list[float]) -> float:
    """Change in a team's quarterback adjustment (Elo points). Each list holds QB adjustments: the team's quarterbacks
    before, the ones traded away, and the ones coming in. The team plays its best one, or a replacement-level backup."""
    after = list(before)
    for a in leaving:
        after.remove(a)
    after += arriving
    return max(after + [BACKUP_QB_ADJ]) - max(before + [BACKUP_QB_ADJ])
