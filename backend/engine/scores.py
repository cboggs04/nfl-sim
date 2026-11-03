"""Simulated final scores for a game whose winner is already decided. Pure Python, no web code.

The winner still comes from the Elo win probability (engine.playoffs.play_game). This only decides *how* they won:
  - Margin: the favorite is expected to win by MARGIN_PER_ELO points per rating point (4.3 points per 100 Elo), with a
    spread of MARGIN_SD points around that. We draw a margin from that bell curve and keep it only if it agrees with the
    winner who was already chosen, so an upset is a (usually small) win by the underdog, never a contradiction.
  - Total points: a bell curve around the league average, independent of the margin (their correlation in the data is
    0.03), then split between the teams so they differ by the margin.
Constants were fitted on 2,639 regular-season games from 2016-2025: see scripts/fit_score_model.py.
"""
import random

MARGIN_PER_ELO = 0.0435   # points of expected margin per Elo point of rating gap (home field included)
MARGIN_SD = 13.1          # spread of the actual margin around the expected one
TOTAL_MEAN = 45.6         # average combined points in a game
TOTAL_SD = 13.9

# Scores a team cannot finish with using touchdowns (6/7/8) and field goals (3): the animation can't build them.
IMPOSSIBLE = {1, 2, 4, 5}


def simulate_score(elo_home: float, elo_away: float, hfa: float, home_won: bool, rng: random.Random) -> tuple[int, int]:
    """Final (home_points, away_points) for a game the home team won (home_won) or lost. No ties: the winner has more."""
    expected = MARGIN_PER_ELO * (elo_home - elo_away + hfa)  # home margin we'd expect
    margin = None
    for _ in range(2000):
        m = round(rng.gauss(expected, MARGIN_SD))
        if m != 0 and (m > 0) == home_won:
            margin = abs(m)
            break
    if margin is None:  # (only possible for an extreme upset)
        margin = 3
    for _ in range(500):
        total = rng.gauss(TOTAL_MEAN, TOTAL_SD)
        winner = round((total + margin) / 2)
        loser = winner - margin
        if loser >= 0 and winner <= 70 and winner not in IMPOSSIBLE and loser not in IMPOSSIBLE:
            break
    else:
        winner, loser = margin + 17, 17
    return (winner, loser) if home_won else (loser, winner)
