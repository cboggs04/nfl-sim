import numpy as np
import pytest

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


def _toy_schedule():
    from engine.teams import TEAMS
    n = len(TEAMS)
    return [dict(home_team=TEAMS[i], away_team=TEAMS[(i + d) % n], neutral=False)
            for i in range(n) for d in (1, 2, 3, 5, 7, 11, 13, 17)]


def test_league_probabilities_are_consistent():
    from engine.simulate import simulate_league
    from engine.teams import TEAMS
    out = simulate_league(_toy_schedule(), {t: 1500.0 for t in TEAMS}, 300, seed=3)
    assert sum(r["p_playoffs"] for r in out.values()) == pytest.approx(14)   # 7 per conference
    assert sum(r["p_division"] for r in out.values()) == pytest.approx(8)
    assert sum(r["p_super_bowl"] for r in out.values()) == pytest.approx(1)
    assert sum(r["p_conference"] for r in out.values()) == pytest.approx(2)
    assert sum(r["p_divisional_round"] for r in out.values()) == pytest.approx(8)
    assert sum(r["p_conference_round"] for r in out.values()) == pytest.approx(4)
    assert sum(r["seed_dist"][0] for r in out.values()) == pytest.approx(2)


def test_one_season_is_consistent_and_keeps_played_games():
    import random

    from engine.simulate import simulate_one_season
    from engine.teams import TEAMS
    sched = [dict(g, game_id=f"g{i}", week=1 + i % 18, result=None) for i, g in enumerate(_toy_schedule())]
    sched[0]["result"] = -3                      # the first game's away team really won
    out = simulate_one_season(sched, {t: 1500.0 for t in TEAMS}, rng=random.Random(5))
    assert out["games"][0]["home_win"] is False and out["games"][0]["played"] is True
    assert sum(w + l + t for w, l, t in out["standings"].values()) == 2 * len(sched)
    assert all(len(set(s)) == 7 for s in out["seeds"].values())
    assert len(out["division_winners"]) == 8
