"""Quarterback ratings and the Elo adjustment they imply. Pure Python, no web code.

Elo rates a whole team, so it only learns slowly that a team got a new quarterback (or lost
its usual one for a week). This module rates each QB on his own, from EPA per dropback, and
adds `elo_per_epa x rating` to a team's Elo for any game he starts. Team Elo is then updated
using those adjusted ratings, so it learns the strength of everything *except* the quarterback.
Everything is walk-forward: a game only uses data from earlier games.
"""
from dataclasses import dataclass


@dataclass(frozen=True)
class QbConfig:
    prior: float = -0.05          # EPA/dropback we assume for a QB with no history (a bit below an average starter)
    shrink: float = 150.0         # dropbacks of "prior" mixed into every rating (~4-5 games), so small samples don't swing
    season_decay: float = 0.7     # each new season, older dropbacks count this much as much
    elo_per_epa: float = 600.0    # Elo points per 1.0 EPA/dropback (tuned by backtest)


class QbTracker:
    """Keeps every QB's running EPA/dropback.

    `stats` maps game_id -> [(passer_id, dropbacks, epa), ...] for everyone who threw in that game.
    """

    def __init__(self, stats: dict[str, list[tuple[str, int, float]]], cfg: QbConfig = QbConfig()):
        self.cfg = cfg
        self.stats = stats
        self.dropbacks: dict[str, float] = {}
        self.epa: dict[str, float] = {}
        self.season: int | None = None

    def rating(self, qb_id: str | None) -> float:
        """Shrunk EPA per dropback: a QB with few snaps is pulled toward the prior."""
        if qb_id is None:
            return self.cfg.prior
        n = self.dropbacks.get(qb_id, 0.0)
        return (self.epa.get(qb_id, 0.0) + self.cfg.prior * self.cfg.shrink) / (n + self.cfg.shrink)

    def adjustment(self, team: str, qb_id: str | None) -> float:
        """Elo points a starting QB adds to (or takes from) his team's rating. `team` is unused for now
        but keeps the door open for team-specific effects (offensive line, receivers)."""
        if qb_id is None:
            return 0.0
        return self.cfg.elo_per_epa * self.rating(qb_id)

    # ---- hooks used by elo.walk_games ----
    def pre(self, game) -> tuple[float, float]:
        """(home, away) Elo adjustments for a game, from data before kickoff."""
        return (self.adjustment(game["home_team"], game.get("home_qb_id")),
                self.adjustment(game["away_team"], game.get("away_qb_id")))

    def update(self, game) -> None:
        """Fold a finished game into the QB ratings."""
        if game["season"] != self.season:
            if self.season is not None:
                for q in self.dropbacks:
                    self.dropbacks[q] *= self.cfg.season_decay
                    self.epa[q] *= self.cfg.season_decay
            self.season = game["season"]
        for qb_id, n, epa in self.stats.get(game["game_id"], ()):
            self.dropbacks[qb_id] = self.dropbacks.get(qb_id, 0.0) + n
            self.epa[qb_id] = self.epa.get(qb_id, 0.0) + epa


def stats_by_game(rows) -> dict[str, list[tuple[str, int, float]]]:
    """Group per-game passer rows (dicts with game_id, passer_id, dropbacks, epa) by game."""
    out: dict[str, list[tuple[str, int, float]]] = {}
    for r in rows:
        out.setdefault(r["game_id"], []).append((r["passer_id"], r["dropbacks"], r["epa"]))
    return out


def projected_starters(schedule) -> dict[str, tuple[str, str]]:
    """Each team's expected starting QB as (id, name): the starter listed for its next unplayed
    game, else its most recent starter. (nflverse lists the coming week's starters.)"""
    out: dict[str, tuple[str, str]] = {}
    games = sorted(schedule, key=lambda g: g["week"])

    def sides(g):
        yield g["home_team"], g.get("home_qb_id"), g.get("home_qb_name")
        yield g["away_team"], g.get("away_qb_id"), g.get("away_qb_name")

    for g in games:                         # most recent starter from games already played
        if g["result"] is not None:
            for team, qb_id, name in sides(g):
                if qb_id:
                    out[team] = (qb_id, name)
    seen: set[str] = set()
    for g in games:                         # a listed starter for an upcoming game wins
        if g["result"] is None:
            for team, qb_id, name in sides(g):
                if team not in seen and qb_id:
                    out[team] = (qb_id, name)
                    seen.add(team)
    return out
