"""Game detail (engine/gamedetail.py): parsing ESPN's game summary and the model's win-probability timeline."""
import pytest

from engine.gamedetail import game_seconds_elapsed, parse_summary, win_prob_series
from engine.live import LiveCache, parse_scoreboard, summary_states


def summary(state="post", period=4, clock=0.0):
    team = lambda i, a: {"id": i, "abbreviation": a}
    return {
        "header": {"competitions": [{
            "status": {"period": period, "clock": clock, "displayClock": "0:00", "type": {"state": state, "shortDetail": "Final"}},
            "competitors": [
                {"homeAway": "home", "team": team("1", "LAR"), "score": "24", "linescores": [{"displayValue": "7"}, {"displayValue": "10"}, {"displayValue": "0"}, {"displayValue": "7"}]},
                {"homeAway": "away", "team": team("2", "GB"), "score": "20", "linescores": [{"displayValue": "3"}, {"displayValue": "3"}, {"displayValue": "7"}, {"displayValue": "7"}]},
            ],
            "broadcasts": [{"media": {"shortName": "FOX"}}],
        }]},
        "boxscore": {
            "teams": [
                {"team": team("1", "LAR"), "statistics": [{"label": "Total Yards", "displayValue": "380"}, {"label": "Turnovers", "displayValue": "1"}]},
                {"team": team("2", "GB"), "statistics": [{"label": "Total Yards", "displayValue": "310"}, {"label": "Turnovers", "displayValue": "2"}]},
            ],
            "players": [{"team": team("1", "LAR"), "statistics": [
                {"name": "passing", "labels": ["C/ATT", "YDS"], "totals": ["20/30", "250"],
                 "athletes": [{"athlete": {"id": "9", "displayName": "Matthew Stafford", "headshot": {"href": "h.png"}}, "stats": ["20/30", "250"]}]},
                {"name": "fumbles", "labels": ["FUM"], "athletes": [{"athlete": {"id": "8", "displayName": "X"}, "stats": ["1"]}]},
            ]}],
        },
        "scoringPlays": [
            {"period": {"number": 1}, "clock": {"value": 600, "displayValue": "10:00"}, "team": {"id": "1"},
             "type": {"abbreviation": "TD"}, "text": "TD pass", "homeScore": 7, "awayScore": 0},
            {"period": {"number": 4}, "clock": {"value": 30, "displayValue": "0:30"}, "team": {"id": "2"},
             "type": {"abbreviation": "TD"}, "text": "TD run", "homeScore": 24, "awayScore": 20},
        ],
        "gameInfo": {"venue": {"fullName": "SoFi Stadium", "address": {"city": "Inglewood", "state": "CA"}}, "attendance": 70000,
                     "weather": {"temperature": 68, "displayValue": "Sunny"}},
    }


def test_parse_summary_orients_everything_to_our_teams():
    d = parse_summary(summary(), "LA", "GB", 0.6)
    assert (d["home_score"], d["away_score"]) == (24, 20) and d["home_lines"] == [7, 10, 0, 7]
    assert d["team_stats"][0] == {"label": "Total yards", "home": "380", "away": "310"}
    assert [c["key"] for c in d["home_box"]] == ["passing"] and d["away_box"] == []      # fumbles isn't shown
    assert d["home_box"][0]["rows"][0]["name"] == "Matthew Stafford" and d["home_box"][0]["totals"] == ["20/30", "250"]
    assert d["scoring"][0]["team"] == "LA" and d["scoring"][1]["team"] == "GB"
    assert d["venue"] == "SoFi Stadium, Inglewood, CA" and d["broadcast"] == "FOX" and d["weather"] == "68°F, sunny"


def test_win_prob_series_starts_at_pregame_and_ends_decided():
    d = parse_summary(summary(), "LA", "GB", 0.6)
    wp = d["win_prob"]
    assert wp[0]["p"] == pytest.approx(0.6, abs=0.01) and wp[-1]["p"] == 1.0 and wp[-1]["t"] == 60
    assert all(0 <= p["p"] <= 1 for p in wp)
    assert wp[25]["home"] == 7                                    # 12.5 min in: after the first TD


def test_win_prob_series_stops_at_the_current_moment_while_live():
    sc = [{"period": 1, "clock_seconds": 600, "home_score": 7, "away_score": 0}]
    wp = win_prob_series(0.5, sc, "in", 2, 450, 7, 0)
    assert wp[-1]["t"] == pytest.approx(22.5) and 0.5 < wp[-1]["p"] < 1
    assert win_prob_series(0.5, [], "pre", 0, 0, 0, 0) == []


def test_game_seconds_elapsed():
    assert game_seconds_elapsed(1, 900) == 0 and game_seconds_elapsed(4, 0) == 3600 and game_seconds_elapsed(5, 300) == 3900


def test_missing_sections_dont_break_parsing():
    d = parse_summary({"header": {"competitions": [{}]}}, "LA", "GB", 0.5)
    assert d["state"] == "pre" and d["team_stats"] == [] and d["win_prob"] == []


def test_summary_cache_refreshes_fast_while_the_game_is_on():
    now, calls = [0.0], []
    cache = LiveCache(fetch=lambda: calls.append(1) or summary("in", 2, 400), ttl_live=20, ttl_idle=600, clock=lambda: now[0],
                      states=summary_states)
    cache.get()
    now[0] = 25
    cache.get()
    assert len(calls) == 2


def test_scoreboard_extras_records_tv_leaders():
    comp = {"competitors": [
        {"homeAway": "home", "score": "21", "team": {"id": "1", "abbreviation": "LAR"}, "records": [{"type": "total", "summary": "8-3"}],
         "linescores": [{"value": 7}, {"value": 14}]},
        {"homeAway": "away", "score": "10", "team": {"id": "2", "abbreviation": "GB"}, "records": [{"name": "overall", "summary": "6-5"}]}],
        "status": {"period": 2, "clock": 0, "displayClock": "0:00", "type": {"state": "in", "shortDetail": "Halftime"}},
        "broadcasts": [{"names": ["FOX"]}], "venue": {"fullName": "SoFi Stadium"},
        "leaders": [{"name": "passingYards", "leaders": [{"displayValue": "12/15, 160 YDS", "team": {"id": "1"},
                                                         "athlete": {"shortName": "M. Stafford", "headshot": "h.png"}}]}]}
    g = parse_scoreboard({"events": [{"id": "5", "competitions": [comp]}]},
                         [{"game_id": "2026_12_GB_LA", "week": 12, "home": "LA", "away": "GB", "espn_id": "5", "p_home": 0.6}])[0]
    assert (g.home_record, g.away_record, g.broadcast, g.venue) == ("8-3", "6-5", "FOX", "SoFi Stadium")
    assert g.home_lines == [7, 14] and g.leaders == [{"category": "PASS", "name": "M. Stafford", "team": "LA", "line": "12/15, 160 YDS", "headshot": "h.png"}]
