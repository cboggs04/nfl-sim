import pytest

from engine.elo import EloConfig, compute_ratings, expected_home_win, update

CFG = EloConfig()


def test_equal_teams_neutral_is_coin_flip():
    assert expected_home_win(1500, 1500, 0) == pytest.approx(0.5)


def test_home_field_helps_equal_teams():
    assert 0.55 < expected_home_win(1500, 1500, 65) < 0.6


def test_400_point_gap_is_about_91_percent():
    assert expected_home_win(1900, 1500, 0) == pytest.approx(10 / 11)


def test_update_is_zero_sum_and_rewards_winner():
    h, a = update(1500, 1500, 27, 10, False, CFG)
    assert h > 1500 > a
    assert (h - 1500) == pytest.approx(1500 - a)


def test_upset_moves_ratings_more_than_expected_win():
    fav_wins = update(1650, 1450, 24, 20, False, CFG)[0] - 1650
    dog_wins = update(1650, 1450, 20, 24, False, CFG)[0] - 1650
    assert abs(dog_wins) > abs(fav_wins)


def test_offseason_regression_pulls_toward_1500():
    g = lambda s: dict(season=s, home_team="A", away_team="B", home_score=30, away_score=10, neutral=False)
    after_one = compute_ratings([g(2020)])
    after_two = compute_ratings([g(2020), g(2021)])
    # Without regression A would gain as much in 2021 as in 2020; with it, less.
    assert after_two["A"] - after_one["A"] < after_one["A"] - 1500
