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


def test_played_games_are_locked_in():
    # A is much stronger, but B already won the first game in real life.
    sched = [dict(SCHEDULE[0], result=-7), dict(SCHEDULE[1])]  # game 1: B (away) won
    teams, wins = simulate_season(sched, {"A": 1900, "B": 1100}, 2000, seed=1)
    b = wins[:, teams.index("B")]
    assert (b >= 1).all()  # B's win is in every simulated season
    assert wins[:, teams.index("A")].max() <= 1  # A can win at most game 2
