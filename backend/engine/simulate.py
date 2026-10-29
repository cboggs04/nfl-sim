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


def simulate_league(schedule, ratings, n_sims=10_000, cfg: EloConfig = EloConfig(), seed=None):
    """Full-season Monte Carlo: regular season -> tiebreakers/seeding -> playoffs.

    Returns {team: {exp_wins, win_dist, p_division, p_playoffs, p_top_seed,
                    p_conference, p_super_bowl}}.
    """
    import random

    from .playoffs import simulate_playoffs
    from .tiebreakers import Results, conference_seeds

    teams, wins = simulate_season(schedule, ratings, n_sims, cfg, seed)
    # Re-draw the same game outcomes (same seed => same random numbers) so we know
    # not just each team's win total but who beat whom, which tiebreakers need.
    p_home = np.array([
        expected_home_win(ratings[g["home_team"]], ratings[g["away_team"]],
                          0.0 if g["neutral"] else cfg.home_field)
        for g in schedule
    ])
    home_won = np.random.default_rng(seed).random((n_sims, len(schedule))) < p_home
    matchups = [(g["home_team"], g["away_team"]) for g in schedule]

    rng = random.Random(seed)  # coin flips and playoff games
    keys = ("division", "playoffs", "top_seed", "conference", "super_bowl")
    tally = {t: dict.fromkeys(keys, 0) for t in teams}
    for i in range(n_sims):
        res = Results([(h, a, int(w)) for (h, a), w in zip(matchups, home_won[i])])
        seeds = {}
        for conf in ("AFC", "NFC"):
            seeds[conf], winners = conference_seeds(res, conf, rng)
            for t in seeds[conf]:
                tally[t]["playoffs"] += 1
            for t in winners:
                tally[t]["division"] += 1
            tally[seeds[conf][0]]["top_seed"] += 1
        afc, nfc, champ = simulate_playoffs(seeds["AFC"], seeds["NFC"], ratings, rng, cfg)
        tally[afc]["conference"] += 1
        tally[nfc]["conference"] += 1
        tally[champ]["super_bowl"] += 1

    out = {}
    for row in summarize(teams, wins):
        t = row["team"]
        out[t] = {"exp_wins": row["exp_wins"], "win_dist": row["dist"],
                  **{f"p_{k}": tally[t][k] / n_sims for k in keys}}
    return out
