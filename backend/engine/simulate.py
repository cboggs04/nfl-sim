"""Monte Carlo simulation of a season. Pure Python + numpy, no web code."""
import random

import numpy as np

from .elo import EloConfig, expected_home_win
from .playoffs import simulate_playoffs
from .tiebreakers import Results, conference_seeds


def _simulate_games(schedule, ratings, n_sims, cfg, seed):
    """Play every game n_sims times.

    schedule: list of dicts with home_team, away_team, neutral, and optionally
    `result` (home margin) for games already played. Played games are locked in:
    their win probability is forced to 1 or 0 so every simulation replays the real
    outcome. (A played tie, result == 0, is rare and is just re-simulated.)

    Returns (teams, home_won) with home_won an (n_sims, n_games) boolean array.
    """
    teams = sorted({g["home_team"] for g in schedule} | {g["away_team"] for g in schedule})
    p_home = np.empty(len(schedule))
    for i, g in enumerate(schedule):
        result = g.get("result")
        if result is not None and result != 0:
            p_home[i] = 1.0 if result > 0 else 0.0
        else:
            p_home[i] = expected_home_win(ratings[g["home_team"]], ratings[g["away_team"]],
                                          0.0 if g["neutral"] else cfg.home_field)
    rng = np.random.default_rng(seed)
    return teams, rng.random((n_sims, len(schedule))) < p_home  # the whole Monte Carlo in one line


def _win_totals(schedule, teams, home_won):
    """Turn "who won each game" into per-team win totals with one matrix multiply each."""
    idx = {t: i for i, t in enumerate(teams)}
    home_m = np.zeros((len(schedule), len(teams)))
    away_m = np.zeros((len(schedule), len(teams)))
    for i, g in enumerate(schedule):
        home_m[i, idx[g["home_team"]]] = 1
        away_m[i, idx[g["away_team"]]] = 1
    return (home_won @ home_m + (~home_won) @ away_m).astype(int)


def simulate_season(schedule, ratings, n_sims=10_000, cfg: EloConfig = EloConfig(), seed=None):
    """Simulate the regular season. Returns (teams, wins), wins shaped (n_sims, n_teams).

    Ties are ignored (~0.2% of NFL games) and ratings stay fixed during the season.
    """
    teams, home_won = _simulate_games(schedule, ratings, n_sims, cfg, seed)
    return teams, _win_totals(schedule, teams, home_won)


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
    teams, home_won = _simulate_games(schedule, ratings, n_sims, cfg, seed)
    wins = _win_totals(schedule, teams, home_won)
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
