"""Elo ratings built from historical game results. Pure Python, no web code."""
from dataclasses import dataclass
from math import log

START_RATING = 1500.0


@dataclass(frozen=True)
class EloConfig:
    k: float = 20.0                # how fast ratings move after each game
    home_field: float = 65.0       # Elo points added to the home team (~2.5 pts)
    season_regression: float = 1 / 3  # pull toward 1500 each offseason


def expected_home_win(home_elo: float, away_elo: float, hfa: float) -> float:
    """Win probability from rating gap + home field (logistic curve, base 10, scale 400)."""
    return 1.0 / (1.0 + 10 ** (-(home_elo - away_elo + hfa) / 400.0))


def mov_multiplier(margin: float, winner_elo_diff: float) -> float:
    """Bigger wins move ratings more, with diminishing returns (FiveThirtyEight's formula).
    The second term damps updates when a favourite beats a weak team by a lot."""
    return log(abs(margin) + 1) * 2.2 / (winner_elo_diff * 0.001 + 2.2)


def update(home_elo, away_elo, home_pts, away_pts, neutral, cfg: EloConfig):
    """Return new (home_elo, away_elo) after one game."""
    hfa = 0.0 if neutral else cfg.home_field
    p_home = expected_home_win(home_elo, away_elo, hfa)
    if home_pts > away_pts:
        actual = 1.0
    elif home_pts < away_pts:
        actual = 0.0
    else:
        actual = 0.5
    margin = home_pts - away_pts
    winner_diff = (home_elo + hfa - away_elo) * (1 if margin >= 0 else -1)
    mult = mov_multiplier(margin, winner_diff) if margin != 0 else 1.0
    delta = cfg.k * mult * (actual - p_home)
    return home_elo + delta, away_elo - delta


def walk_games(games, cfg: EloConfig = EloConfig(), ratings: dict | None = None):
    """Generator: step through completed games in order, yielding
    (game, home_elo, away_elo) as they were BEFORE the game, then updating.
    Pass a dict as `ratings` to get the final ratings filled in as it runs.

    `games` is an iterable of dicts with: season, home_team, away_team,
    home_score, away_score, neutral. Must be chronological. Between seasons,
    every rating is pulled 1/3 of the way back to 1500 (rosters turn over).
    """
    ratings = {} if ratings is None else ratings
    current_season = None
    for g in games:
        if g["season"] != current_season:
            if current_season is not None:
                for t in ratings:
                    ratings[t] += (START_RATING - ratings[t]) * cfg.season_regression
            current_season = g["season"]
        h, a = g["home_team"], g["away_team"]
        yield g, ratings.get(h, START_RATING), ratings.get(a, START_RATING)
        ratings[h], ratings[a] = update(
            ratings.get(h, START_RATING), ratings.get(a, START_RATING),
            g["home_score"], g["away_score"], g["neutral"], cfg,
        )


def compute_ratings(games, cfg: EloConfig = EloConfig()) -> dict[str, float]:
    """Return each team's final Elo rating after all `games`."""
    ratings: dict[str, float] = {}
    for _ in walk_games(games, cfg, ratings):
        pass
    return ratings


def regress_to_mean(ratings: dict[str, float], cfg: EloConfig = EloConfig()) -> dict[str, float]:
    """Apply the offseason regression once (used to get ratings for a new season)."""
    return {t: r + (START_RATING - r) * cfg.season_regression for t, r in ratings.items()}
