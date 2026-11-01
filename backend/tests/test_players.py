import numpy as np
import pytest

from engine.players import POSITION_STATS, build_player, simulate_game_stats, simulate_player

QB_CUR = {"completions": 150.0, "attempts": 230.0, "passing_yards": 1700.0, "passing_tds": 12.0,
          "passing_interceptions": 4.0, "rushing_yards": 90.0}


def qb(status="ACT", cur=QB_CUR, prev=None, cur_games=7, prev_games=0, played=7, remaining=10):
    return build_player({"id": "x", "name": "Test QB", "position": "QB", "status": status}, cur, prev,
                        cur_games, prev_games, played, remaining)


def test_projection_adds_rate_times_expected_games():
    p = qb()
    exp_games = p["avail"] * 10
    assert p["proj_gp"] == pytest.approx(7 + exp_games)
    assert p["proj"]["passing_yards"] == pytest.approx(1700 + p["rates"]["passing_yards"] * exp_games)
    assert p["proj"]["passing_yards"] > 1700 * 1.5      # a full-time starter keeps piling up yards
    assert p["avail"] > 0.9


def test_injured_reserve_player_projects_no_more_than_current():
    p = qb(status="RES")
    assert p["avail"] == 0 and p["proj"] == p["stats"]


def test_last_season_steadies_a_small_sample():
    hot = {**QB_CUR, "passing_yards": 700.0, "completions": 30.0, "attempts": 45.0}   # one huge game in 2 starts
    prev = {"completions": 340.0, "attempts": 520.0, "passing_yards": 3600.0, "passing_tds": 24.0,
            "passing_interceptions": 11.0, "rushing_yards": 150.0}
    raw = 700 / 2
    no_history = qb(cur=hot, cur_games=2)["rates"]["passing_yards"]
    with_history = qb(cur=hot, cur_games=2, prev=prev, prev_games=17)["rates"]["passing_yards"]
    assert no_history == pytest.approx(raw)                       # nothing to blend with: take it as is
    assert 3600 / 17 < with_history < raw                         # blended between last season's rate and the hot start
    assert abs(with_history - 3600 / 17) < abs(raw - 3600 / 17) / 2


def test_player_with_no_games_has_zero_rates():
    p = qb(cur={}, cur_games=0)
    assert all(v == 0 for v in p["rates"].values()) and p["avail"] < 0.35


def test_every_displayed_stat_is_simulated():
    rng = np.random.default_rng(0)
    for pos, stats in POSITION_STATS.items():
        rates = {s: 3.0 for s in stats}
        out = simulate_game_stats(pos, rates, np.array([True, False, True]), rng)
        assert set(stats) <= set(out), pos
        assert all((v >= 0).all() for v in out.values())


def test_simulated_totals_are_consistent():
    p = qb()
    rng = np.random.default_rng(1)
    for _ in range(50):
        sim = simulate_player(p, [True, False] * 5, rng)
        s = sim["stats"]
        assert sim["gp"] >= 7 and sim["gp"] <= 17
        assert all(s[k] >= p["stats"][k] for k in s)                 # simulated games only add
        assert s["completions"] <= s["attempts"]


def test_winning_boosts_scoring_and_cuts_interceptions():
    p = qb()
    rng = np.random.default_rng(2)
    wins = [simulate_player(p, [True] * 10, rng)["stats"] for _ in range(300)]
    losses = [simulate_player(p, [False] * 10, rng)["stats"] for _ in range(300)]
    mean = lambda rows, k: sum(r[k] for r in rows) / len(rows)  # noqa: E731
    assert mean(wins, "passing_tds") > mean(losses, "passing_tds")
    assert mean(wins, "passing_interceptions") < mean(losses, "passing_interceptions")


def test_unavailable_player_gets_no_new_stats():
    p = qb(status="RES")
    sim = simulate_player(p, [True] * 10, np.random.default_rng(3))
    assert sim["stats"] == p["stats"] and sim["gp"] == p["gp"]


def test_same_seed_same_season():
    p = qb()
    a = simulate_player(p, [True, False] * 5, np.random.default_rng(7))
    b = simulate_player(p, [True, False] * 5, np.random.default_rng(7))
    assert a == b
