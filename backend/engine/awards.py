"""Projected league leaders and award winners from many simulated seasons. Pure Python + numpy.

Each simulated season: every unplayed game is decided from its win probability, then every candidate's
stats are simulated from those results (engine.players), and each award goes to the best score. Counting
winners over many seasons gives each player's chance. The award formulas are simple, stated assumptions,
not a model of how voters think: voters are unpredictable, so treat the odds as 'who the numbers favor'.
"""
import random
from collections import Counter

import numpy as np

from .elo import game_probability
from .players import simulate_player

OFFENSE = ("QB", "RB", "WR", "TE")
DEFENSE = ("DL", "LB", "DB")

# category -> (stat key, positions that can lead it)
LEADER_CATEGORIES = {
    "passing_yards": "passing_yards",
    "passing_tds": "passing_tds",
    "receiving_yards": "receiving_yards",
    "receiving_tds": "receiving_tds",
    "rushing_yards": "rushing_yards",
    "rushing_tds": "rushing_tds",
}

AWARDS = ["mvp", "opoty", "dpoty", "oroy", "droy"]

# Voters aren't a formula: each player's score is nudged by a random factor (a few percent, typical size shown)
# per simulated season. MVP is the most narrative-driven award, so it gets the most.
VOTER_NOISE = {"mvp": 0.12, "opoty": 0.06, "dpoty": 0.08, "oroy": 0.08, "droy": 0.08}


def offense_points(s: dict) -> float:
    """Fantasy-style points (half-point PPR): a single number for how much an offensive player produced."""
    g = s.get
    return (0.04 * g("passing_yards", 0) + 4 * g("passing_tds", 0) - 2 * g("passing_interceptions", 0)
            + 0.1 * (g("rushing_yards", 0) + g("receiving_yards", 0)) + 6 * (g("rushing_tds", 0) + g("receiving_tds", 0))
            + 0.5 * g("receptions", 0))


def defense_points(s: dict) -> float:
    """Sacks and interceptions are the big plays; tackles and tackles for loss add up over a season."""
    g = s.get
    return (4 * g("def_sacks", 0) + 5 * g("def_interceptions", 0) + 0.6 * g("tackles", 0)
            + 1.5 * g("def_tackles_for_loss", 0) + 1.0 * g("def_pass_defended", 0))


def team_factor(wins: float) -> float:
    """MVP voters reward winners: a 14-win team gets full credit, a 6-win team 70%."""
    return 0.7 + 0.3 * min(max((wins - 6) / 8, 0.0), 1.0)


def mvp_score(player: dict, stats: dict, team_wins: float) -> float:
    return offense_points(stats) * (1.0 if player["position"] == "QB" else 0.9) * team_factor(team_wins)


def is_candidate(p: dict) -> bool:
    """Only players who could plausibly lead a category or win an award are worth simulating."""
    if p["position"] in OFFENSE:
        return offense_points(p["proj"]) >= (30 if p.get("years_exp") == 0 else 60)
    if p["position"] in DEFENSE:
        return defense_points(p["proj"]) >= (25 if p.get("years_exp") == 0 else 45)
    return False


def simulate_awards(players: list[dict], schedule: list[dict], ratings: dict, cfg, n_sims: int = 500, seed: int = 7):
    """Returns {"awards": {award: {player_id: probability}}, "leaders": {category: {player_id: P(finishes first)}}}.

    `players`: dicts with id, team, position, years_exp, avail, gp, stats, proj, rates. `schedule`: this
    season's regular-season games (dicts as in sim_state).
    """
    rng = random.Random(seed)
    nprng = np.random.default_rng(seed)
    cand = [p for p in players if is_candidate(p)]

    played_wins: Counter = Counter()
    upcoming = []   # (game_id, week, home, away, p_home)
    for g in schedule:
        if g["result"] is None:
            upcoming.append((g["game_id"], g["week"], g["home_team"], g["away_team"], game_probability(g, ratings, cfg)))
        elif g["result"] != 0:
            played_wins[g["home_team"] if g["result"] > 0 else g["away_team"]] += 1
    upcoming.sort(key=lambda x: x[1])

    awards = {a: Counter() for a in AWARDS}
    leaders = {c: Counter() for c in LEADER_CATEGORIES}
    for _ in range(n_sims):
        team_wins: dict[str, list[bool]] = {}
        for _gid, _wk, home, away, p in upcoming:
            home_won = rng.random() < p
            team_wins.setdefault(home, []).append(home_won)
            team_wins.setdefault(away, []).append(not home_won)
        totals = {t: played_wins[t] + sum(w) for t, w in team_wins.items()}

        best = dict.fromkeys(AWARDS)           # award -> (score, id)
        lead = dict.fromkeys(LEADER_CATEGORIES)
        for p in cand:
            sim = simulate_player(p, team_wins.get(p["team"], []), nprng)
            s = sim["stats"]
            rookie = p.get("years_exp") == 0
            if p["position"] in OFFENSE:
                pts = offense_points(s)
                for award, score in (("mvp", mvp_score(p, s, totals.get(p["team"], 0))), ("opoty", pts), ("oroy", pts if rookie else None)):
                    if score is not None:
                        score *= float(np.exp(nprng.normal(0, VOTER_NOISE[award])))
                    if score is not None and (best[award] is None or score > best[award][0]):
                        best[award] = (score, p["id"])
            else:
                pts = defense_points(s)
                for award, score in (("dpoty", pts), ("droy", pts if rookie else None)):
                    if score is not None:
                        score *= float(np.exp(nprng.normal(0, VOTER_NOISE[award])))
                    if score is not None and (best[award] is None or score > best[award][0]):
                        best[award] = (score, p["id"])
            for cat, key in LEADER_CATEGORIES.items():
                if key in s and (lead[cat] is None or s[key] > lead[cat][0]):
                    lead[cat] = (s[key], p["id"])
        for a, b in best.items():
            if b:
                awards[a][b[1]] += 1
        for c, b in lead.items():
            if b:
                leaders[c][b[1]] += 1
    return {
        "awards": {a: {pid: n / n_sims for pid, n in c.items()} for a, c in awards.items()},
        "leaders": {c: {pid: n / n_sims for pid, n in cnt.items()} for c, cnt in leaders.items()},
    }
