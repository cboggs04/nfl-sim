"""Backtest the Elo model: tune settings on older seasons, grade on newer ones.

Run from backend/:  .venv/bin/python -m scripts.run_backtest
Writes backend/data/backtest.json (served later by GET /api/backtest).
"""
import json

import polars as pl

from engine.backtest import calibration, metrics, predict_games, season_win_errors, tune
from engine.data import DATA_DIR, load_games
from engine.elo import EloConfig

FIRST, LAST = 2010, 2025
TRAIN = set(range(2012, 2018))   # first two seasons are warm-up so ratings can settle
TEST = list(range(2018, LAST + 1))


def main():
    df = load_games(list(range(FIRST, LAST + 1)))
    games = df.filter(pl.col("result").is_not_null()).to_dicts()

    print(f"Tuning Elo on {min(TRAIN)}-{max(TRAIN)} (grid search by Brier score)...")
    ranked = tune(games, TRAIN, k_values=(10, 15, 20, 25, 30, 40), hfa_values=(35, 45, 55, 65, 75),
                  regression_values=(0.15, 0.25, 1 / 3, 0.45, 0.55))
    initial, tuned = EloConfig(k=20, home_field=65, season_regression=1 / 3), ranked[0][1]
    for b, c in ranked[:5]:
        print(f"  K={c.k:<3} HFA={c.home_field:<3} regression={c.season_regression:.2f}  train Brier {b:.4f}")
    print(f"-> tuned: K={tuned.k}, home field={tuned.home_field}, regression={tuned.season_regression:.2f}\n")

    out = {"train_seasons": [min(TRAIN), max(TRAIN)], "test_seasons": [TEST[0], TEST[-1]],
           "models": {}, "tuning_top10": [
               {"k": c.k, "home_field": c.home_field, "regression": c.season_regression, "train_brier": b}
               for b, c in ranked[:10]]}
    print(f"Test: {TEST[0]}-{TEST[-1]} (never used for tuning)")
    for name, cfg in (("initial", initial), ("tuned", tuned)):
        rows = [r for r in predict_games(games, cfg) if r["season"] in TEST]
        m = metrics(rows)
        summary, _ = season_win_errors(games, cfg, TEST)
        out["models"][name] = {
            "config": {"k": cfg.k, "home_field": cfg.home_field, "regression": cfg.season_regression},
            **m,
            "calibration": calibration(rows),
            "by_season": [{"season": s, **metrics([r for r in rows if r["season"] == s])} for s in TEST],
            "win_total_error": summary,
        }
        mae = sum(s["mae"] for s in summary) / len(summary)
        base = sum(s["baseline_mae"] for s in summary) / len(summary)
        print(f"  {name:<9} Brier {m['brier']:.4f}  LogLoss {m['log_loss']:.4f}  Accuracy {m['accuracy']:.1%}  "
              f"| preseason win-total error {mae:.2f} wins (guessing 8.5 for everyone: {base:.2f})")
    print("\nCalibration of tuned model (predicted P(home win) vs. what happened):")
    print(f"  {'bucket':<10}{'games':>6}{'predicted':>11}{'actual':>8}")
    for c in out["models"]["tuned"]["calibration"]:
        print(f"  {c['bin_low']:.1f}-{c['bin_high']:.1f}   {c['games']:>6}{c['predicted']:>10.1%}{c['actual']:>8.1%}")

    path = DATA_DIR / "backtest.json"
    path.write_text(json.dumps(out, indent=2))
    print(f"\nSaved {path}")


if __name__ == "__main__":
    main()
