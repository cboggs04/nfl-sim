"""Live scores: in-game win probability, parsing ESPN's scoreboard, the shared cache, and demo mode."""
import pytest

from engine.live import (LiveCache, _yards_to_goal, demo_games, live_win_prob, parse_scoreboard, seconds_left,
                         team_abbr)

SCHEDULE = [
    {"game_id": "2026_12_KC_BUF", "week": 12, "home": "BUF", "away": "KC", "espn_id": "401873082", "p_home": 0.6},
    {"game_id": "2026_12_WAS_ARI", "week": 12, "home": "ARI", "away": "WAS", "espn_id": None, "p_home": 0.45},
    {"game_id": "2026_12_GB_LA", "week": 12, "home": "LA", "away": "GB", "espn_id": "401873079", "p_home": 0.5},
]


def event(eid, home, away, state, hs=0, as_=0, period=0, clock=900.0, display="15:00", short="", situation=None,
          home_id="1", away_id="2"):
    comp = {
        "competitors": [
            {"homeAway": "home", "score": str(hs), "team": {"id": home_id, "abbreviation": home}},
            {"homeAway": "away", "score": str(as_), "team": {"id": away_id, "abbreviation": away}},
        ],
        "status": {"clock": clock, "displayClock": display, "period": period,
                   "type": {"state": state, "shortDetail": short}},
    }
    if situation:
        comp["situation"] = situation
    return {"id": eid, "competitions": [comp]}


# ---- win probability ----

def test_kickoff_probability_is_the_pregame_one():
    assert live_win_prob(0.7, 0, 0, 1, 900) == pytest.approx(0.7, abs=0.01)


def test_leading_late_is_nearly_certain_and_trailing_is_not():
    assert live_win_prob(0.5, 24, 10, 4, 60) > 0.99
    assert live_win_prob(0.5, 10, 24, 4, 60) < 0.01


def test_lead_matters_more_as_time_runs_out():
    early = live_win_prob(0.5, 7, 0, 1, 600)
    late = live_win_prob(0.5, 7, 0, 4, 120)
    assert 0.5 < early < late


def test_pregame_favorite_keeps_an_edge_when_tied_early_but_not_at_the_end():
    assert live_win_prob(0.8, 10, 10, 2, 600) > 0.7
    assert live_win_prob(0.8, 10, 10, 4, 5) == pytest.approx(0.5, abs=0.12)


def test_possession_near_the_goal_line_helps():
    tied = live_win_prob(0.5, 14, 14, 4, 300)
    assert live_win_prob(0.5, 14, 14, 4, 300, possession_home=True, yards_to_goal=5) > tied
    assert live_win_prob(0.5, 14, 14, 4, 300, possession_home=False, yards_to_goal=5) < tied


def test_final_is_one_zero_or_half():
    assert live_win_prob(0.2, 21, 20, 4, 0, final=True) == 1.0
    assert live_win_prob(0.9, 20, 21, 4, 0, final=True) == 0.0
    assert live_win_prob(0.9, 20, 20, 5, 0, final=True) == 0.5


def test_overtime_uses_the_overtime_clock():
    assert 0.5 < live_win_prob(0.5, 23, 20, 5, 300) < 1.0
    assert live_win_prob(0.5, 23, 20, 5, 0) == 1.0


def test_seconds_left():
    assert seconds_left(1, 900) == 3600
    assert seconds_left(3, 120) == 1020
    assert seconds_left(5, 300) == 0


# ---- parsing ----

def test_espn_abbreviations_map_to_ours():
    assert team_abbr("WSH") == "WAS" and team_abbr("LAR") == "LA" and team_abbr("kc") == "KC"


def test_yards_to_goal_from_possession_text():
    assert _yards_to_goal("KC 35", "KC") == 65      # own 35
    assert _yards_to_goal("BUF 20", "KC") == 20     # opponent's 20
    assert _yards_to_goal("50", "KC") == 50
    assert _yards_to_goal(None, "KC") is None


def test_parse_scoreboard_matches_games_and_reads_the_situation():
    data = {"week": {"number": 12}, "events": [
        event("401873082", "BUF", "KC", "in", 17, 10, 3, 252.0, "4:12", "4:12 - 3rd",
              {"possession": "2", "possessionText": "BUF 20", "downDistanceText": "3rd & 4 at BUF 20", "isRedZone": True},
              home_id="1", away_id="2"),
        event("999", "ARI", "WSH", "pre", short="Sun 4:25 PM"),       # no id match: matched on the teams
        event("401873079", "LAR", "GB", "post", 20, 27, 4, 0.0, "0:00", "Final"),
        event("123", "NYG", "DAL", "pre"),                             # not on our schedule
    ]}
    games = {g.espn_id: g for g in parse_scoreboard(data, SCHEDULE)}
    buf = games["401873082"]
    assert buf.game_id == "2026_12_KC_BUF" and buf.state == "in" and (buf.home_score, buf.away_score) == (17, 10)
    assert buf.possession == "KC" and buf.red_zone and buf.down_distance == "3rd & 4 at BUF 20"
    assert buf.p_home_pre == 0.6 and 0.5 < buf.p_home_live < 0.95
    ari = games["999"]
    assert ari.game_id == "2026_12_WAS_ARI" and ari.away == "WAS" and ari.p_home_live is None
    la = games["401873079"]
    assert la.game_id == "2026_12_GB_LA" and la.home == "LA" and la.p_home_live == 0.0
    assert games["123"].game_id is None


def test_parse_scoreboard_skips_malformed_events():
    data = {"events": [{"id": "1"}, {"id": "2", "competitions": []}, event("401873082", "BUF", "KC", "pre")]}
    assert [g.espn_id for g in parse_scoreboard(data, SCHEDULE)] == ["401873082"]
    assert parse_scoreboard({}, SCHEDULE) == []


# ---- cache ----

def test_cache_shares_one_fetch_and_keeps_the_last_good_copy():
    now = [1000.0]
    calls = []

    def fetch():
        calls.append(now[0])
        if len(calls) == 2:
            raise TimeoutError
        return {"events": []}

    cache = LiveCache(fetch=fetch, ttl_live=20, ttl_idle=120, clock=lambda: now[0])
    assert cache.get()[0] == {"events": []}
    now[0] += 60
    cache.get()
    assert len(calls) == 1                      # still fresh (no game on: 120 s)
    now[0] += 61
    data, _, err = cache.get()                  # refetch fails: last copy kept
    assert len(calls) == 2 and data == {"events": []} and err == "TimeoutError"


def test_cache_refreshes_faster_while_a_game_is_on():
    now = [0.0]
    calls = []

    def fetch():
        calls.append(1)
        return {"events": [{"status": {"type": {"state": "in"}}}]}

    cache = LiveCache(fetch=fetch, ttl_live=20, ttl_idle=120, clock=lambda: now[0])
    cache.get()
    now[0] = 25
    cache.get()
    assert len(calls) == 2


# ---- demo ----

def test_demo_scores_only_go_up_and_end_final():
    sched = [g for g in SCHEDULE]
    prev = None
    for t in range(0, 900, 30):
        games = {g.game_id: g for g in demo_games(sched, 12, now=float(t))}
        assert len(games) == 3
        if prev:
            for gid, g in games.items():
                p = prev[gid]
                if g.state == "in" and p.state == "in":
                    assert g.home_score >= p.home_score and g.away_score >= p.away_score
        prev = games
    finals = [g for t in range(0, 900, 10) for g in demo_games(sched, 12, now=float(t)) if g.state == "post"]
    assert finals and all(g.home_score != g.away_score and g.p_home_live in (0.0, 1.0) for g in finals)
