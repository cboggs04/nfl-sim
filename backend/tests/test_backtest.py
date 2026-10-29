import pytest

from engine.backtest import calibration, metrics, predict_games


def row(p, y):
    return {"p": p, "y": y}


def test_metrics_perfect_and_coin_flip():
    perfect = metrics([row(1.0, 1.0), row(0.0, 0.0)])
    assert perfect["brier"] == pytest.approx(0.0) and perfect["accuracy"] == 1.0
    coin = metrics([row(0.5, 1.0), row(0.5, 0.0)])
    assert coin["brier"] == pytest.approx(0.25)


def test_ties_are_excluded_from_metrics():
    assert metrics([row(0.9, 1.0), row(0.5, 0.5)])["games"] == 1


def test_calibration_buckets():
    rows = [row(0.72, 1.0), row(0.75, 1.0), row(0.78, 0.0), row(0.31, 0.0)]
    cal = {round(c["bin_low"], 1): c for c in calibration(rows)}
    assert cal[0.7]["games"] == 3 and cal[0.7]["actual"] == pytest.approx(2 / 3)
    assert cal[0.3]["games"] == 1


def test_predictions_use_only_prior_games():
    def g(week, hs, as_):
        return dict(season=2020, week=week, game_type="REG", home_team="A", away_team="B",
                    home_score=hs, away_score=as_, neutral=False)
    rows = predict_games([g(1, 30, 10), g(2, 30, 10)])
    # First game: equal ratings, only home field. Second: A has since won, so A is favored more.
    assert rows[1]["p"] > rows[0]["p"] > 0.5
