from engine.trade import BACKUP_QB_ADJ, MAX_VALUE, player_effect, player_values, qb_team_delta


def player(pid, pos, pts, gp=8):
    rates = {"receiving_yards": pts * 10, "receptions": 0, "def_sacks": 0}
    return {"id": pid, "position": pos, "gp": gp, "rates": rates, "avail_full": 1.0}


def test_stars_are_worth_more_and_replacement_players_nothing():
    team = [player(f"w{i}", "WR", i) for i in range(11)]
    v = player_values({"A": team})
    assert v["w10"] == MAX_VALUE["WR"]          # best receiver: full value
    assert v["w0"] == 0.0                       # worst: replacement level
    assert v["w10"] > v["w8"] > v["w6"]


def test_new_team_gains_less_when_already_deep_at_the_position():
    _, gain_thin = player_effect("WR", 20.0, 1.0, 0.0)
    _, gain_deep = player_effect("WR", 20.0, 1.0, MAX_VALUE["WR"])
    assert gain_deep < gain_thin
    lose, _ = player_effect("WR", 20.0, 1.0, 0.0)
    assert lose == -20.0


def test_quarterback_swap():
    # team A: starter 90, backup -10. team B: starter 10. Swap A's starter for B's starter.
    a = qb_team_delta([90.0, -10.0], leaving=[90.0], arriving=[10.0])
    b = qb_team_delta([10.0], leaving=[10.0], arriving=[90.0])
    assert a == 10.0 - 90.0           # A now plays the better of its backup (-10) and the incoming 10
    assert b == 90.0 - 10.0           # B now plays the incoming 90


def test_qb_trade_never_hurts_the_team_that_keeps_a_better_one():
    assert qb_team_delta([40.0], leaving=[], arriving=[-5.0]) == 0.0
    assert qb_team_delta([40.0, 5.0], leaving=[5.0], arriving=[]) == 0.0   # sending away a backup changes nothing
    assert qb_team_delta([40.0], leaving=[40.0], arriving=[]) == BACKUP_QB_ADJ - 40.0
