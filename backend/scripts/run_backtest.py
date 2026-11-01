"""Backtest the rating model: tune settings on older seasons, grade on newer ones.

Run from backend/:  .venv/bin/python -m scripts.run_backtest
Writes backend/data/backtest.json (served by GET /api/backtest, and read by scripts.precompute
for the settings the live simulation uses).

Four models are graded on the same test seasons:
  initial     first-guess Elo settings
  tuned       Elo tuned on the training seasons (fixed home-field edge)
  recent_hfa  tuned Elo, but the home-field edge is re-fitted each season on the previous 6 seasons
              (home teams have won less often in recent years)
  qb          recent_hfa plus a quarterback adjustment (who starts, rated by EPA per dropback)
"""
import itertools
import json
from dataclasses import asdict, replace

import polars as pl

from engine.backtest import (calibration, metrics, pick_rolling_hfa, predict_games, season_win_errors,
                             tune, tune_qb)
from engine.data import DATA_DIR, load_games, load_qb_game_epa
from engine.elo import EloConfig
from engine.qb import QbConfig, QbTracker, stats_by_game

FIRST, LAST = 2010, 2025
TRAIN = set(range(2012, 2018))   # first two seasons are warm-up so ratings can settle
TEST = list(range(2018, LAST + 1))
HFA_GRID = tuple(range(0, 70, 5))
HFA_WINDOW = 6                   # seasons of history used to re-fit the home-field edge


def summarize(name, rows, summary):
    m = metrics(rows)
    mae = sum(s["mae"] for s in summary) / len(summary)
    base = sum(s["baseline_mae"] for s in summary) / len(summary)
    print(f"  {name:<11} Brier {m['brier']:.4f}  LogLoss {m['log_loss']:.4f}  Accuracy {m['accuracy']:.1%}  "
          f"| preseason win-total error {mae:.2f} wins (guessing 8.5 for everyone: {base:.2f})")
    return m


def model_entry(cfg_dict, rows, summary, hfa_by_season=None):
    out = {
        "config": cfg_dict,
        **metrics(rows),
        "calibration": calibration(rows),
        "by_season": [{"season": s, **metrics([r for r in rows if r["season"] == s])} for s in TEST],
        "win_total_error": summary,
    }
    if hfa_by_season:
        out["hfa_by_season"] = {str(s): h for s, h in hfa_by_season.items()}
    return out


def main():
    df = load_games(list(range(FIRST, LAST + 1)))
    games = df.filter(pl.col("result").is_not_null()).to_dicts()
    stats = stats_by_game(load_qb_game_epa(list(range(FIRST, LAST + 1))).to_dicts())
    make_tracker = lambda qcfg: QbTracker(stats, qcfg)  # noqa: E731  (always a fresh tracker: they remember games)

    print(f"Tuning Elo on {min(TRAIN)}-{max(TRAIN)} (grid search by Brier score)...")
    ranked = tune(games, TRAIN, k_values=(10, 15, 20, 25, 30, 40), hfa_values=(35, 45, 55, 65, 75),
                  regression_values=(0.15, 0.25, 1 / 3, 0.45, 0.55))
    initial, tuned = EloConfig(k=20, home_field=65, season_regression=1 / 3), ranked[0][1]
    for b, c in ranked[:5]:
        print(f"  K={c.k:<3} HFA={c.home_field:<3} regression={c.season_regression:.2f}  train Brier {b:.4f}")
    print(f"-> tuned: K={tuned.k}, home field={tuned.home_field}, regression={tuned.season_regression:.2f}\n")

    print(f"Tuning the quarterback adjustment on {min(TRAIN)}-{max(TRAIN)}...")
    qb_grid = [QbConfig(shrink=sh, season_decay=decay, elo_per_epa=beta)
               for sh, decay, beta in itertools.product((100, 150, 300), (0.5, 0.7, 0.85), (400, 600, 800, 1000))]
    qb_ranked = tune_qb(games, make_tracker, tuned, TRAIN, qb_grid)
    for b, q in qb_ranked[:3]:
        print(f"  shrink={q.shrink:<4} season_decay={q.season_decay:<5} Elo per EPA={q.elo_per_epa:<5} train Brier {b:.4f}")
    qb_cfg = qb_ranked[0][1]
    print(f"-> chosen: {asdict(qb_cfg)}\n")

    out = {"train_seasons": [min(TRAIN), max(TRAIN)], "test_seasons": [TEST[0], TEST[-1]],
           "models": {}, "tuning_top10": [
               {"k": c.k, "home_field": c.home_field, "regression": c.season_regression, "train_brier": b}
               for b, c in ranked[:10]]}
    cfg_dict = lambda c: {"k": c.k, "home_field": c.home_field, "regression": c.season_regression}  # noqa: E731

    print(f"Test: {TEST[0]}-{TEST[-1]} (never used for tuning)")
    for name, cfg in (("initial", initial), ("tuned", tuned)):
        rows = [r for r in predict_games(games, cfg) if r["season"] in TEST]
        summary, _ = season_win_errors(games, cfg, TEST)
        summarize(name, rows, summary)
        out["models"][name] = model_entry(cfg_dict(cfg), rows, summary)

    # Home-field edge chosen season by season from the previous HFA_WINDOW seasons only.
    for name, use_qb in (("recent_hfa", False), ("qb", True)):
        by_hfa = {h: predict_games(games, replace(tuned, home_field=h), qb=make_tracker(qb_cfg) if use_qb else None)
                  for h in HFA_GRID}
        rows, picks = pick_rolling_hfa(by_hfa, TEST, HFA_WINDOW)
        summary = []
        for s in TEST:
            part, _ = season_win_errors(games, replace(tuned, home_field=picks[s]), [s],
                                        qb=make_tracker(qb_cfg) if use_qb else None)
            summary += part
        summarize(name, rows, summary)
        print(f"              home-field edge picked each season: {list(picks.values())}")
        entry = model_entry(cfg_dict(replace(tuned, home_field=picks[TEST[-1]])), rows, summary, picks)
        if use_qb:
            entry["config"].update({f"qb_{k}": v for k, v in asdict(qb_cfg).items()})
            # Live home-field edge: best over the most recent seasons (same rule as the walk-forward above).
            recent = set(range(LAST - HFA_WINDOW + 1, LAST + 1))
            live_hfa = min(by_hfa, key=lambda h: metrics([r for r in by_hfa[h] if r["season"] in recent])["brier"])
            out["live"] = {"k": tuned.k, "home_field": live_hfa, "season_regression": tuned.season_regression,
                           "qb": asdict(qb_cfg)}
        out["models"][name] = entry
    print(f"\nLive settings: home-field edge {out['live']['home_field']} (was {tuned.home_field}), QB adjustment on")

    print("\nCalibration of the final model (predicted P(home win) vs. what happened):")
    print(f"  {'bucket':<10}{'games':>6}{'predicted':>11}{'actual':>8}")
    for c in out["models"]["qb"]["calibration"]:
        print(f"  {c['bin_low']:.1f}-{c['bin_high']:.1f}   {c['games']:>6}{c['predicted']:>10.1%}{c['actual']:>8.1%}")

    path = DATA_DIR / "backtest.json"
    path.write_text(json.dumps(out, indent=2))
    print(f"\nSaved {path}")


if __name__ == "__main__":
    main()
