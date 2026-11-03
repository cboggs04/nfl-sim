import random

import pytest

from engine.scores import IMPOSSIBLE, MARGIN_PER_ELO, TOTAL_MEAN, simulate_score


def draw(n, elo_home, elo_away, hfa, home_won, seed=1):
    rng = random.Random(seed)
    return [simulate_score(elo_home, elo_away, hfa, home_won, rng) for _ in range(n)]


def test_winner_always_has_more_points_and_scores_are_buildable():
    for home_won in (True, False):
        for h, a in draw(3000, 1600, 1500, 20, home_won):
            assert (h > a) == home_won and h != a
            assert h >= 0 and a >= 0 and h not in IMPOSSIBLE and a not in IMPOSSIBLE


def test_totals_look_like_football():
    games = draw(4000, 1550, 1550, 0, True)
    mean_total = sum(h + a for h, a in games) / len(games)
    assert mean_total == pytest.approx(TOTAL_MEAN, abs=2.0)
    assert 3 <= sum(max(h, a) for h, a in games) / len(games) - sum(min(h, a) for h, a in games) / len(games) <= 14   # typical margin


def test_bigger_favorite_wins_by_more_on_average():
    avg = lambda gap: sum(abs(h - a) for h, a in draw(4000, 1500 + gap, 1500, 0, True)) / 4000  # noqa: E731
    assert avg(250) > avg(0) + 3                                  # a 250-point rating edge adds ~ 11 expected points
    assert avg(250) - avg(0) < 250 * MARGIN_PER_ELO + 2


def test_upset_wins_are_usually_close_never_contradictory():
    games = draw(3000, 1750, 1450, 0, False)                       # the underdog (away) won
    margins = [a - h for h, a in games]
    assert all(m >= 1 for m in margins)
    assert sum(margins) / len(margins) < sum(abs(h - a) for h, a in draw(3000, 1750, 1450, 0, True)) / 3000   # closer than a favorite's win


def test_same_seed_same_score():
    assert draw(5, 1600, 1500, 20, True, seed=9) == draw(5, 1600, 1500, 20, True, seed=9)
