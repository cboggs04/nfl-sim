from engine.trade import BACKUP_QB_ADJ, MAX_VALUE, player_values, trade_effect


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
    wr = player("x", "WR", 10)
    _, gain_thin = trade_effect(wr, 20.0, 0.0)
    _, gain_deep = trade_effect(wr, 20.0, MAX_VALUE["WR"])
    assert gain_deep < gain_thin
    lose, _ = trade_effect(wr, 20.0, 0.0)
    assert lose == -20.0


def test_quarterback_trade_replaces_starter_with_backup_and_never_hurts_the_buyer():
    qb = {"id": "q", "position": "QB", "avail_full": 1.0}
    lose, gain = trade_effect(qb, 0, 0, {"adj": 90.0, "to_starter_adj": 10.0})
    assert lose == -(90.0 - BACKUP_QB_ADJ)
    assert gain == 80.0
    _, gain_worse = trade_effect(qb, 0, 0, {"adj": -5.0, "to_starter_adj": 40.0})
    assert gain_worse == 0.0
