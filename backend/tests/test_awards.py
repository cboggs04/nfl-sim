import pytest

from engine.awards import defense_points, is_candidate, mvp_score, offense_points, simulate_awards, team_factor
from engine.elo import EloConfig
from engine.players import build_player


def player(pid, team, pos, rates_stats, years_exp=5, games=7):
    """A player whose per-game production equals `rates_stats` (totals so far = rate x games)."""
    cur = {k: v * games for k, v in rates_stats.items()}
    p = build_player({"id": pid, "name": pid, "position": pos, "status": "ACT"}, cur, None, games, 0, games, 10)
    return {**p, "team": team, "years_exp": years_exp}


QB_STAR = {"completions": 24, "attempts": 36, "passing_yards": 320, "passing_tds": 2.6, "passing_interceptions": 0.5, "rushing_yards": 15, "rushing_tds": 0.2}
QB_MID = {"completions": 20, "attempts": 33, "passing_yards": 215, "passing_tds": 1.3, "passing_interceptions": 0.9, "rushing_yards": 10, "rushing_tds": 0.1}


def schedule(n_each=10):
    games = [{"game_id": f"g{i}", "week": i + 8, "home_team": "AAA" if i % 2 else "BBB", "away_team": "BBB" if i % 2 else "AAA",
              "neutral": False, "result": None} for i in range(n_each)]
    return games


def test_scoring_formulas():
    assert offense_points({"passing_yards": 300, "passing_tds": 2, "passing_interceptions": 1}) == pytest.approx(12 + 8 - 2)
    assert offense_points({"receiving_yards": 100, "receptions": 8, "receiving_tds": 1}) == pytest.approx(10 + 4 + 6)
    assert defense_points({"def_sacks": 2, "tackles": 5, "def_interceptions": 1}) == pytest.approx(14 + 1 + 8)
    assert team_factor(14) == 1.0 and team_factor(3) == 0.7 and team_factor(14) > team_factor(10) > team_factor(7)


def test_mvp_rewards_winning_and_quarterbacks():
    s = {"passing_yards": 4000, "passing_tds": 30, "passing_interceptions": 8}
    assert mvp_score({"position": "QB"}, s, 14) > mvp_score({"position": "QB"}, s, 7)
    assert mvp_score({"position": "QB"}, s, 12) > mvp_score({"position": "RB"}, s, 12)


def test_candidates_are_stars_or_good_rookies():
    star = player("a", "AAA", "QB", QB_STAR)
    scrub = player("b", "AAA", "QB", {k: v * 0.05 for k, v in QB_MID.items()})
    assert is_candidate(star) and not is_candidate(scrub)
    kicker = player("k", "AAA", "K", {"fg_made": 2, "fg_att": 2.5, "pat_made": 3, "pat_att": 3})
    assert not is_candidate(kicker)


def test_better_quarterback_wins_mvp_more_often_and_probabilities_sum_to_one():
    players = [player("star", "AAA", "QB", QB_STAR), player("mid", "BBB", "QB", QB_MID)]
    ratings = {"AAA": 1550.0, "BBB": 1500.0}
    out = simulate_awards(players, schedule(), ratings, EloConfig(), n_sims=300, seed=1)
    mvp = out["awards"]["mvp"]
    assert mvp["star"] > 0.6 and mvp["star"] > mvp.get("mid", 0)
    assert sum(mvp.values()) == pytest.approx(1.0)
    assert out["leaders"]["passing_yards"]["star"] > 0.6


def test_rookie_awards_only_go_to_rookies():
    # Two rookies and a veteran. The veteran can never win a rookie award.
    players = [player("vet", "AAA", "QB", QB_STAR, years_exp=6), player("r1", "BBB", "QB", QB_MID, years_exp=0),
               player("r2", "BBB", "RB", {"carries": 14, "rushing_yards": 60, "rushing_tds": 0.4, "receptions": 2, "receiving_yards": 15, "receiving_tds": 0.05}, years_exp=0)]
    out = simulate_awards(players, schedule(), {"AAA": 1500.0, "BBB": 1500.0}, EloConfig(), n_sims=100, seed=2)
    assert set(out["awards"]["oroy"]) <= {"r1", "r2"}
    assert out["awards"]["droy"] == {}


def test_same_seed_same_odds():
    players = [player("star", "AAA", "QB", QB_STAR), player("mid", "BBB", "QB", QB_MID)]
    args = (players, schedule(), {"AAA": 1520.0, "BBB": 1500.0}, EloConfig())
    assert simulate_awards(*args, n_sims=50, seed=3) == simulate_awards(*args, n_sims=50, seed=3)


def test_a_player_wins_at_most_one_award_a_season():
    # Star QB would win both MVP and OPOTY on production; the one-award rule hands OPOTY to someone else.
    players = [player("star", "AAA", "QB", QB_STAR), player("mid", "BBB", "QB", QB_MID), player("rb", "BBB", "RB", {"carries": 17, "rushing_yards": 85, "rushing_tds": 0.6, "receptions": 3, "receiving_yards": 22, "receiving_tds": 0.1})]
    out = simulate_awards(players, schedule(), {"AAA": 1550.0, "BBB": 1500.0}, EloConfig(), n_sims=300, seed=4)
    for pid in ("star", "mid", "rb"):
        total = sum(out["awards"][a].get(pid, 0.0) for a in out["awards"])
        assert total <= 1.0 + 1e-9, pid
    assert out["awards"]["mvp"]["star"] + out["awards"]["opoty"].get("star", 0) <= 1.0 + 1e-9
    assert out["awards"]["opoty"].get("mid", 0) + out["awards"]["opoty"].get("rb", 0) > 0.5   # star is usually taken by MVP


def test_pass_rushers_outscore_tackle_heavy_linebackers():
    edge = {"def_sacks": 15, "tackles": 50, "def_tackles_for_loss": 15, "def_interceptions": 0, "def_pass_defended": 2}
    backer = {"def_sacks": 4, "tackles": 160, "def_tackles_for_loss": 12, "def_interceptions": 2, "def_pass_defended": 6}
    assert defense_points(edge) > defense_points(backer)
