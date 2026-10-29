"""Monte Carlo simulation of a season. Pure Python + numpy, no web code."""
import random

import numpy as np

from .elo import EloConfig, game_probability
from .playoffs import simulate_playoffs_detailed
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
            p_home[i] = game_probability(g, ratings, cfg)
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

    Returns {team: {exp_wins, win_dist, seed_dist (P of each seed 1-7),
                    p_division, p_playoffs, p_top_seed, p_divisional_round,
                    p_conference_round, p_conference, p_super_bowl}}.
    """
    teams, home_won = _simulate_games(schedule, ratings, n_sims, cfg, seed)
    wins = _win_totals(schedule, teams, home_won)
    matchups = [(g["home_team"], g["away_team"]) for g in schedule]

    rng = random.Random(seed)  # coin flips and playoff games
    keys = ("division", "divisional_round", "conference_round", "conference", "super_bowl")
    tally = {t: dict.fromkeys(keys, 0) for t in teams}
    seed_counts = {t: [0] * 7 for t in teams}
    for i in range(n_sims):
        res = Results([(h, a, int(w)) for (h, a), w in zip(matchups, home_won[i])])
        seeds = {}
        for conf in ("AFC", "NFC"):
            seeds[conf], winners = conference_seeds(res, conf, rng)
            for n, t in enumerate(seeds[conf]):
                seed_counts[t][n] += 1
            for t in winners:
                tally[t]["division"] += 1
        r = simulate_playoffs_detailed(seeds["AFC"], seeds["NFC"], ratings, rng, cfg)
        for conf in ("AFC", "NFC"):
            for t in r[conf]["divisional"]:
                tally[t]["divisional_round"] += 1
            for t in r[conf]["conference"]:
                tally[t]["conference_round"] += 1
            tally[r[conf]["champion"]]["conference"] += 1
        tally[r["champion"]]["super_bowl"] += 1

    out = {}
    for row in summarize(teams, wins):
        t = row["team"]
        sd = [c / n_sims for c in seed_counts[t]]
        out[t] = {"exp_wins": row["exp_wins"], "win_dist": row["dist"], "seed_dist": sd,
                  "p_playoffs": sum(sd), "p_top_seed": sd[0],
                  **{f"p_{k}": tally[t][k] / n_sims for k in keys}}
    return out


def simulate_one_season(schedule, ratings, cfg: EloConfig = EloConfig(), rng: random.Random | None = None):
    """Play out ONE season (for the interactive demo) and return everything a UI needs.

    Same rules as the big Monte Carlo: played games stay fixed, unplayed games are
    decided by win probability, then real tiebreakers produce the 7 seeds per conference.
    Returns {"games": [...], "standings": {team: (w, l, t)}, "seeds": {conf: [7 teams]},
             "division_winners": [teams]}.
    """
    rng = rng or random.Random()
    games, results = [], []
    record = {}
    for g in schedule:
        played = g.get("result") is not None
        if played and g["result"] != 0:
            home_win = g["result"] > 0
        else:
            home_win = rng.random() < game_probability(g, ratings, cfg)
        h, a = g["home_team"], g["away_team"]
        tie = played and g["result"] == 0
        results.append((h, a, 0.5 if tie else int(home_win)))
        games.append({"game_id": g["game_id"], "week": g["week"], "home": h, "away": a,
                      "home_win": home_win, "played": played})
        for t, won in ((h, home_win), (a, not home_win)):
            w, l, ties = record.get(t, (0, 0, 0))
            record[t] = (w, l, ties + 1) if tie else (w + won, l + (not won), ties)
    res = Results(results)
    seeds, winners = {}, []
    for conf in ("AFC", "NFC"):
        seeds[conf], conf_winners = conference_seeds(res, conf, rng)
        winners += sorted(conf_winners)
    return {"games": games, "standings": record, "seeds": seeds, "division_winners": winners}
