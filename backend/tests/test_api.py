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


@needs_data
def test_whatif_rating_boost_helps_and_validates():
    base = {t["team"]: t for t in client.get("/api/season").json()["teams"]}
    r = client.post("/api/whatif", json={"rating_adjustments": {"CHI": 150}, "n_sims": 1000})
    assert r.status_code == 200
    out = {t["team"]: t for t in r.json()["teams"]}
    assert len(out) == 32 and out["CHI"]["elo"] == pytest.approx(base["CHI"]["elo"] + 150, abs=0.1)
    assert out["CHI"]["exp_wins"] > base["CHI"]["exp_wins"] + 0.5
    assert client.post("/api/whatif", json={"rating_adjustments": {"XXX": 10}}).status_code == 422
    assert client.post("/api/whatif", json={"rating_adjustments": {"CHI": 999}}).status_code == 422
    assert client.post("/api/whatif", json={"n_sims": 5}).status_code == 422


@needs_data
def test_whatif_game_override():
    games = client.get("/api/teams/KC").json()["games"]
    nxt = next(g for g in games if not g["played"])
    home_win = nxt["home"]  # force KC to win
    base = client.get("/api/season").json()["teams"]
    kc_base = next(t for t in base if t["team"] == "KC")["exp_wins"]
    r = client.post("/api/whatif", json={"game_overrides": [{"game_id": nxt["game_id"], "home_win": home_win}], "n_sims": 1000})
    assert r.status_code == 200
    kc = next(t for t in r.json()["teams"] if t["team"] == "KC")
    assert kc["exp_wins"] > kc_base
    played = next(g for g in games if g["played"])
    assert client.post("/api/whatif", json={"game_overrides": [{"game_id": played["game_id"], "home_win": True}]}).status_code == 422
    assert client.post("/api/whatif", json={"game_overrides": [{"game_id": "nope", "home_win": True}]}).status_code == 422


@needs_data
def test_roster_endpoint():
    r = client.get("/api/teams/kc/roster")
    assert r.status_code == 200
    d = r.json()
    assert d["team"] == "KC" and d["games_remaining"] > 0 and len(d["players"]) > 40
    qbs = [p for p in d["players"] if p["position"] == "QB"]
    assert qbs and all(set(d["columns"]["QB"]) == set(p["stats"]) for p in qbs)
    assert all(p["proj"][k] >= p["stats"][k] - 0.2 for p in d["players"] for k in p["stats"])   # projections never go backwards
    assert client.get("/api/teams/XXX/roster").status_code == 404


@needs_data
def test_sim_team_endpoint_drives_players_with_results():
    r = client.post("/api/sim/team", json={"team": "KC"})
    assert r.status_code == 200
    d = r.json()
    roster = client.get("/api/teams/KC/roster").json()
    assert len(d["games"]) == roster["games_remaining"]
    assert {p["id"] for p in d["players"]} == {p["id"] for p in roster["players"]}
    by_id = {p["id"]: p for p in roster["players"]}
    assert all(sp["stats"][k] >= by_id[sp["id"]]["stats"][k] - 0.2 for sp in d["players"] for k in sp["stats"])
    assert client.post("/api/sim/team", json={"team": "XXX"}).status_code == 422


@needs_data
def test_leaders_endpoint():
    r = client.get("/api/leaders")
    assert r.status_code == 200
    d = r.json()
    assert set(d["awards"]) == {"mvp", "opoty", "dpoty", "oroy", "droy"}
    assert all(0 < sum(a["prob"] for a in rows) <= 1.0001 for rows in d["awards"].values())
    assert all(a["rookie"] for a in d["awards"]["oroy"] + d["awards"]["droy"])
    py = d["leaders"]["passing_yards"]
    assert len(py) == 10 and py == sorted(py, key=lambda x: -x["projected"])
    assert all(p["projected"] >= p["current"] - 0.2 for rows in d["leaders"].values() for p in rows)
    qb = next(p for p in client.get("/api/teams/KC/roster").json()["players"] if p["position"] == "QB" and p["gp"] > 0)
    assert "rushing_tds" in qb["stats"]


@needs_data
def test_sim_team_full_season_mode_replays_every_game():
    r = client.post("/api/sim/team", json={"team": "KC", "mode": "full"})
    assert r.status_code == 200
    d = r.json()
    roster = client.get("/api/teams/KC/roster").json()
    assert len(d["games"]) == 17
    played = [g for g in d["games"] if g["played"]]
    assert len(played) == roster["team_games_played"] and all(g["actual_win"] in (True, False) for g in played)
    assert all(g["actual_win"] is None for g in d["games"] if not g["played"])
    assert {p["id"] for p in d["players"]} == {p["id"] for p in roster["players"]}
    assert client.post("/api/sim/team", json={"team": "KC", "mode": "weird"}).status_code == 422
