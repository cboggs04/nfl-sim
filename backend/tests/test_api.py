import pytest
from fastapi.testclient import TestClient

from app.main import app
from engine.data import DATA_DIR

client = TestClient(app)
needs_data = pytest.mark.skipif(not (DATA_DIR / "season.json").exists(), reason="run scripts.precompute")


@needs_data
def test_season_endpoint():
    r = client.get("/api/season")
    assert r.status_code == 200
    assert len(r.json()["teams"]) == 32


@needs_data
def test_team_endpoint_is_case_insensitive():
    r = client.get("/api/teams/sea")
    assert r.status_code == 200
    assert r.json()["odds"]["team"] == "SEA" and len(r.json()["games"]) == 17


@needs_data
def test_unknown_team_is_404():
    assert client.get("/api/teams/XXX").status_code == 404


@needs_data
def test_bracket_and_backtest_endpoints():
    assert client.get("/api/bracket").status_code == 200
    assert client.get("/api/backtest").status_code == 200


def test_cors_allows_frontend_origin():
    r = client.options("/api/season", headers={"Origin": "http://localhost:3000",
                                               "Access-Control-Request-Method": "GET"})
    assert r.headers.get("access-control-allow-origin") == "http://localhost:3000"


sim_data = pytest.mark.skipif(not (DATA_DIR / "sim_state.json").exists(), reason="run scripts.precompute")


@sim_data
def test_sim_season_endpoint():
    r = client.post("/api/sim/season")
    assert r.status_code == 200
    body = r.json()
    assert len(body["games"]) == 272 and len(body["standings"]) == 32
    assert [len(body["seeds"][c]) for c in ("AFC", "NFC")] == [7, 7]
    assert sum(g["played"] for g in body["games"]) > 0   # real results stay locked in


@sim_data
def test_sim_game_endpoint():
    r = client.post("/api/sim/game", json={"home": "SEA", "away": "NE"})
    assert r.status_code == 200 and r.json()["winner"] in ("SEA", "NE")
    odds = client.post("/api/sim/game", json={"home": "SEA", "away": "NE", "play": False}).json()
    assert odds["winner"] is None and 0 < odds["p_home"] < 1
    assert client.post("/api/sim/game", json={"home": "XXX", "away": "NE"}).status_code == 422
