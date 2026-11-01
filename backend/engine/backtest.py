"""Backtesting and calibration for the Elo model. Pure Python, no web code.

Every prediction here is "walk-forward": the rating used for a game only reflects
games played BEFORE it, so the model never peeks at the answer.
"""
import itertools
from math import log

from .elo import EloConfig, START_RATING, expected_home_win, walk_games


def predict_games(games, cfg: EloConfig = EloConfig(), qb=None):
    """Pre-game win probability for every regular-season game.

    `games`: chronological completed games (see elo.walk_games for the fields; also
    needs game_type and week). With `qb` (a qb.QbTracker) predictions include the QB adjustment. Returns rows {season, week, home, away, p, y} where
    p = P(home wins) and y = 1 (home won), 0 (home lost) or 0.5 (tie).
    """
    rows = []
    for g, eh, ea in walk_games(games, cfg, qb=qb):
        if g["game_type"] != "REG":
            continue
        p = expected_home_win(eh, ea, 0.0 if g["neutral"] else cfg.home_field)
        margin = g["home_score"] - g["away_score"]
        rows.append({"season": g["season"], "week": g["week"], "home": g["home_team"],
                     "away": g["away_team"], "p": p, "y": 1.0 if margin > 0 else 0.0 if margin < 0 else 0.5})
    return rows


def metrics(rows):
    """Brier score (lower = better; a coin flip scores 0.25), log loss, accuracy. Ties skipped."""
    rows = [r for r in rows if r["y"] != 0.5]
    n = len(rows)
    brier = sum((r["p"] - r["y"]) ** 2 for r in rows) / n
    ll = -sum(log(min(max(r["p"], 1e-6), 1 - 1e-6) if r["y"] else 1 - min(max(r["p"], 1e-6), 1 - 1e-6))
              for r in rows) / n
    acc = sum((r["p"] > 0.5) == (r["y"] == 1.0) for r in rows) / n
    return {"games": n, "brier": brier, "log_loss": ll, "accuracy": acc}


def calibration(rows, n_bins=10):
    """Bucket predictions by probability and compare to how often the home team really won.

    A well-calibrated model has predicted ~= actual in every bucket (70% picks win ~70%).
    """
    bins = [[] for _ in range(n_bins)]
    for r in rows:
        if r["y"] != 0.5:
            bins[min(int(r["p"] * n_bins), n_bins - 1)].append(r)
    return [{"bin_low": i / n_bins, "bin_high": (i + 1) / n_bins, "games": len(b),
             "predicted": sum(r["p"] for r in b) / len(b),
             "actual": sum(r["y"] for r in b) / len(b)}
            for i, b in enumerate(bins) if b]


def tune(games, train_seasons, k_values, hfa_values, regression_values):
    """Grid-search Elo settings by Brier score on `train_seasons` only.

    Returns all results sorted best-first: [(brier, EloConfig), ...].
    """
    results = []
    for k, hfa, reg in itertools.product(k_values, hfa_values, regression_values):
        cfg = EloConfig(k=k, home_field=hfa, season_regression=reg)
        rows = [r for r in predict_games(games, cfg) if r["season"] in train_seasons]
        results.append((metrics(rows)["brier"], cfg))
    return sorted(results, key=lambda x: x[0])


def season_win_errors(games, cfg: EloConfig, seasons, qb=None):
    """How well do *preseason* ratings predict each team's final win total?

    For each season, freeze every team's rating at its first game, add up that
    team's win probabilities over the season (= expected wins), and compare to
    actual wins. Returns (per_season_summary, per_team_rows). Baseline = predicting
    the league average (half the games) for everyone.
    """
    start, sched = {}, {}
    for g, eh, ea in walk_games(games, cfg, qb=qb):
        if g["game_type"] != "REG":
            continue
        s = g["season"]
        start.setdefault((s, g["home_team"]), eh)
        start.setdefault((s, g["away_team"]), ea)
        sched.setdefault(s, []).append(g)

    team_rows, summary = [], []
    for s in seasons:
        exp, act, gp = {}, {}, {}
        for g in sched[s]:
            h, a = g["home_team"], g["away_team"]
            p = expected_home_win(start[(s, h)], start[(s, a)], 0.0 if g["neutral"] else cfg.home_field)
            hw = 1.0 if g["home_score"] > g["away_score"] else 0.0 if g["home_score"] < g["away_score"] else 0.5
            for t, e, w in ((h, p, hw), (a, 1 - p, 1 - hw)):
                exp[t] = exp.get(t, 0) + e
                act[t] = act.get(t, 0) + w
                gp[t] = gp.get(t, 0) + 1
        rows = [{"season": s, "team": t, "expected": exp[t], "actual": act[t], "games": gp[t]} for t in exp]
        team_rows += rows
        summary.append({
            "season": s,
            "mae": sum(abs(r["expected"] - r["actual"]) for r in rows) / len(rows),
            "baseline_mae": sum(abs(r["games"] / 2 - r["actual"]) for r in rows) / len(rows),
        })
    return summary, team_rows


def pick_rolling_hfa(rows_by_hfa: dict, test_seasons, window: int = 6):
    """Walk-forward home-field choice: for each test season, use the home-field edge that scored best
    over the `window` seasons BEFORE it. `rows_by_hfa` maps an edge (Elo points) to predict_games rows.
    Returns (rows for the test seasons, {season: edge chosen})."""
    picks, rows = {}, []
    for s in test_seasons:
        recent = set(range(s - window, s))
        picks[s] = min(rows_by_hfa, key=lambda h: metrics([r for r in rows_by_hfa[h] if r["season"] in recent])["brier"])
        rows += [r for r in rows_by_hfa[picks[s]] if r["season"] == s]
    return rows, picks


def tune_qb(games, make_tracker, cfg: EloConfig, train_seasons, grid):
    """Grid-search quarterback-rating settings by Brier score on `train_seasons` only.
    `make_tracker(qb_cfg)` must return a fresh QbTracker; `grid` is a list of QbConfig.
    Returns [(brier, QbConfig), ...] best-first."""
    out = []
    for qcfg in grid:
        rows = [r for r in predict_games(games, cfg, qb=make_tracker(qcfg)) if r["season"] in train_seasons]
        out.append((metrics(rows)["brier"], qcfg))
    return sorted(out, key=lambda x: x[0])
