import numpy as np

from engine.simulate import simulate_season, summarize

SCHEDULE = [
    {"home_team": "A", "away_team": "B", "neutral": True},
    {"home_team": "B", "away_team": "A", "neutral": True},
]


def test_every_game_has_one_winner():
    teams, wins = simulate_season(SCHEDULE, {"A": 1500, "B": 1500}, 1000, seed=1)
    assert (wins.sum(axis=1) == len(SCHEDULE)).all()


def test_stronger_team_wins_more():
    teams, wins = simulate_season(SCHEDULE, {"A": 1700, "B": 1300}, 5000, seed=1)
    assert wins[:, teams.index("A")].mean() > 1.7


def test_distribution_sums_to_one():
    teams, wins = simulate_season(SCHEDULE, {"A": 1500, "B": 1500}, 1000, seed=1)
    for r in summarize(teams, wins, max_wins=2):
        assert np.isclose(r["dist"].sum(), 1.0)
