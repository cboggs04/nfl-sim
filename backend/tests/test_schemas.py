import json

import pytest

from app.schemas import BacktestResponse, BracketResponse, SeasonResponse, TeamDetail
from engine.data import DATA_DIR


def _load(name):
    path = DATA_DIR / name
    if not path.exists():
        pytest.skip(f"{name} not generated yet (run scripts.precompute)")
    return json.loads(path.read_text())


def test_cached_season_matches_schema():
    s = SeasonResponse.model_validate(_load("season.json"))
    assert len(s.teams) == 32
    assert all(len(t.win_dist) == 18 and abs(sum(t.win_dist) - 1) < 1e-6 for t in s.teams)
    assert sum(t.p_super_bowl for t in s.teams) == pytest.approx(1)


def test_cached_teams_and_bracket_match_schema():
    teams = {k: TeamDetail.model_validate(v) for k, v in _load("teams.json").items()}
    assert len(teams) == 32 and all(len(d.games) == 17 for d in teams.values())
    b = BracketResponse.model_validate(_load("bracket.json"))
    assert [len(c.slots) for c in b.conferences] == [7, 7]


def test_cached_backtest_matches_schema():
    BacktestResponse.model_validate(_load("backtest.json"))
