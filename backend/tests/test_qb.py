import pytest

from engine.elo import EloConfig, walk_games
from engine.qb import QbConfig, QbTracker, projected_starters, stats_by_game


def game(gid, season, h, a, hq, aq, hs=24, as_=20, result=True):
    return {"game_id": gid, "season": season, "home_team": h, "away_team": a, "neutral": False,
            "home_qb_id": hq, "away_qb_id": aq, "home_qb_name": hq, "away_qb_name": aq,
            "home_score": hs, "away_score": as_, "week": int(gid[-1]), "result": hs - as_ if result else None}


def tracker(rows=(), **kw):
    return QbTracker(stats_by_game(rows), QbConfig(**kw))


def test_unknown_qb_gets_the_prior_and_missing_qb_gets_nothing():
    t = tracker(prior=-0.1, elo_per_epa=400)
    assert t.rating("nobody") == pytest.approx(-0.1)
    assert t.adjustment("KC", "nobody") == pytest.approx(-40)   # unproven QB: a bit below an average starter
    assert t.adjustment("KC", None) == 0.0                      # no starter listed: leave Elo alone


def test_small_samples_are_shrunk_toward_the_prior():
    rows = [{"game_id": "g1", "passer_id": "hot", "dropbacks": 10, "epa": 8.0}]   # +0.8/dropback in 10 snaps
    t = tracker(rows, prior=0.0, shrink=100)
    t.update(game("g1", 2020, "KC", "LV", "hot", "x"))
    assert 0 < t.rating("hot") < 0.1             # 8 / 110, not 0.8


def test_better_qb_means_bigger_boost():
    rows = [{"game_id": f"g{i}", "passer_id": "star", "dropbacks": 40, "epa": 12.0} for i in range(1, 6)]
    rows += [{"game_id": f"g{i}", "passer_id": "scrub", "dropbacks": 40, "epa": -8.0} for i in range(1, 6)]
    t = tracker(rows, shrink=50, elo_per_epa=300)
    for i in range(1, 6):
        t.update(game(f"g{i}", 2020, "KC", "LV", "star", "scrub"))
    assert t.adjustment("KC", "star") > 30 > -30 > t.adjustment("KC", "scrub")
    assert t.adjustment("KC", "star") > t.adjustment("KC", "unknown")   # a proven QB beats an unknown one
    assert t.adjustment("LV", "scrub") == t.adjustment("KC", "scrub")   # the rating belongs to the QB, not the team


def test_hooks_leave_plain_elo_alone_when_adjustment_is_zero():
    games = [game(f"g{i}", 2020, "KC", "LV", "a", "b", hs=27, as_=17) for i in range(1, 5)]
    plain, withqb = {}, {}
    list(walk_games(games, EloConfig(), plain))
    list(walk_games(games, EloConfig(), withqb, qb=tracker(elo_per_epa=0.0)))
    assert plain == pytest.approx(withqb)


def test_yielded_ratings_include_the_adjustment_but_stored_ratings_do_not():
    rows = [{"game_id": "g1", "passer_id": "a", "dropbacks": 300, "epa": 90.0},
            {"game_id": "g2", "passer_id": "b", "dropbacks": 300, "epa": -60.0}]
    t = tracker(rows, shrink=10, elo_per_epa=500)
    ratings = {}
    seen = []
    games = [game("g1", 2020, "KC", "LV", "a", "z"), game("g2", 2020, "KC", "LV", "b", "z")]
    for g, eh, ea in walk_games(games, EloConfig(), ratings, qb=t):
        seen.append(eh)
    # game 1: no history yet, so both QBs get the prior adjustment on top of plain Elo
    assert seen[0] == pytest.approx(1500 + 500 * t.cfg.prior)
    # game 2: the yielded rating carries QB b's own adjustment, which the stored plain Elo does not
    assert seen[1] - ratings["KC"] != pytest.approx(0)


def test_old_seasons_fade():
    rows = [{"game_id": "g1", "passer_id": "a", "dropbacks": 400, "epa": 100.0}]
    t = tracker(rows, prior=0.0, shrink=100, season_decay=0.5)
    t.update(game("g1", 2019, "KC", "LV", "a", "z"))
    before = t.rating("a")
    t.update(game("g9", 2020, "KC", "LV", "q", "z"))   # new season: a's sample halves
    assert t.rating("a") < before


def test_projected_starters_prefer_the_next_listed_game():
    sched = [game("s1", 2026, "KC", "LV", "mahomes", "oldlv"),
             game("s2", 2026, "KC", "DEN", "backup", "nix", result=False),
             game("s3", 2026, "LV", "DEN", None, None, result=False)]
    sched[2]["home_qb_id"] = sched[2]["away_qb_id"] = None
    out = projected_starters(sched)
    assert out["KC"][0] == "backup"       # listed for the coming week
    assert out["LV"][0] == "oldlv"        # nothing listed -> last known starter
    assert out["DEN"][0] == "nix"
