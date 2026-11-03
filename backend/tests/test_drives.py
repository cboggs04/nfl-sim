from engine.drives import game_drives


def play(drive, posteam, **kw):
    return {"fixed_drive": drive, "posteam": posteam, "defteam": "B" if posteam == "A" else "A", "qtr": 1, **kw}


def test_scores_and_turnovers_add_up():
    plays = [
        play(1, "A", fixed_drive_result="Touchdown", drive_end_transition="TOUCHDOWN"),
        play(1, "A", fixed_drive_result="Touchdown", touchdown=1, td_team="A"),
        play(1, "A", fixed_drive_result="Touchdown", extra_point_result="good"),
        play(2, "B", fixed_drive_result="Turnover", drive_end_transition="INTERCEPTION"),
        play(3, "A", fixed_drive_result="Punt"),
        play(4, "B", fixed_drive_result="Field goal", field_goal_result="made"),
        play(5, "A", fixed_drive_result="End of half"),
    ]
    ev = game_drives(plays, "B", "A", 3, 7)
    assert [(e["side"], e["kind"], e["pts"]) for e in ev] == [("away", "TD", 7), ("home", "INT", 0), ("away", "PUNT", 0), ("home", "FG", 3)]


def test_defensive_touchdown_belongs_to_the_scoring_team():
    plays = [play(1, "A", fixed_drive_result="Opp touchdown", drive_end_transition="INTERCEPTION", touchdown=1, td_team="B"),
             play(1, "B", extra_point_result="good")]
    ev = game_drives(plays, "B", "A", 7, 0)
    assert ev == [{"side": "home", "kind": "TD", "pts": 7, "q": 1, "how": "pick"}]


def test_wrong_total_returns_none():
    plays = [play(1, "A", fixed_drive_result="Field goal", field_goal_result="made")]
    assert game_drives(plays, "B", "A", 0, 6) is None
