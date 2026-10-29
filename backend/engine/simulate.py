"""Monte Carlo simulation of a regular season. Pure Python + numpy, no web code."""
import numpy as np

from .elo import EloConfig, expected_home_win


def simulate_season(schedule, ratings, n_sims=10_000, cfg: EloConfig = EloConfig(), seed=None):
    """Simulate every game in `schedule` n_sims times.

    schedule: list of dicts with home_team, away_team, neutral.
    Returns (teams, wins) where wins is an (n_sims, n_teams) int array.
    Ties are ignored: each game has exactly one winner (ties are ~0.2% of NFL games).
    Ratings stay fixed during the season (no in-sim Elo updates).
    """
    teams = sorted({g["home_team"] for g in schedule} | {g["away_team"] for g in schedule})
    idx = {t: i for i, t in enumerate(teams)}
    n_games = len(schedule)

    # One win probability per game, computed once.
    p_home = np.array([
        expected_home_win(ratings[g["home_team"]], ratings[g["away_team"]],
                          0.0 if g["neutral"] else cfg.home_field)
        for g in schedule
    ])
    # Indicator matrices let us turn "who won each game" into per-team win totals in one multiply.
    home_m = np.zeros((n_games, len(teams)))
    away_m = np.zeros((n_games, len(teams)))
    for i, g in enumerate(schedule):
        home_m[i, idx[g["home_team"]]] = 1
        away_m[i, idx[g["away_team"]]] = 1

    rng = np.random.default_rng(seed)
    home_won = rng.random((n_sims, n_games)) < p_home   # the whole Monte Carlo in one line
    wins = home_won @ home_m + (~home_won) @ away_m
    return teams, wins.astype(int)


def summarize(teams, wins, max_wins=17):
    """Per-team expected wins and win-total distribution (P(0 wins)..P(17 wins))."""
    n_sims = wins.shape[0]
    rows = []
    for j, t in enumerate(teams):
        counts = np.bincount(wins[:, j], minlength=max_wins + 1)
        rows.append({"team": t, "exp_wins": wins[:, j].mean(), "dist": counts / n_sims})
    return sorted(rows, key=lambda r: -r["exp_wins"])
