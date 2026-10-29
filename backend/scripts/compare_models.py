"""Walk-forward comparison of Elo vs EPA ratings (vs a blend) on past seasons.

For each test season, models are fit ONLY on earlier seasons, then predict every
regular-season game using ratings as they stood before kickoff. Lower Brier = better
(a coin flip scores 0.250).

Run from backend/:  .venv/bin/python -m scripts.compare_models
"""
import math

import numpy as np
import polars as pl

from engine.data import load_games, load_team_game_epa
from engine.elo import EloConfig, walk_games
from engine.epa_ratings import EpaRatings, fit_logistic, predict

FIRST, LAST = 2010, 2025
WARMUP = 2012          # ratings need a couple of seasons to settle before we train on them
VALIDATION = range(2016, 2018)   # used to pick alpha
TEST = range(2018, LAST + 1)     # untouched until alpha is chosen
LN10_400 = math.log(10) / 400


def build_table(alpha: float) -> dict[str, np.ndarray]:
    """One row per completed game with pre-game Elo and EPA features."""
    games = load_games(list(range(FIRST, LAST + 1))).filter(pl.col("result").is_not_null())
    epa = load_team_game_epa(list(range(FIRST, LAST + 1)))
    by_game = {(r["game_id"], r["team"]): r["epa"] for r in epa.to_dicts()}

    rows = games.to_dicts()
    rt = EpaRatings(alpha)
    cols = {k: [] for k in ("season", "reg", "home", "y", "elo_diff", "epa_diff")}
    season = None
    for g, eh, ea in walk_games(rows, EloConfig()):
        if g["season"] != season:
            if season is not None:
                rt.new_season()
            season = g["season"]
        h, a = g["home_team"], g["away_team"]
        cols["season"].append(g["season"])
        cols["reg"].append(g["game_type"] == "REG")
        cols["home"].append(0.0 if g["neutral"] else 1.0)
        cols["y"].append(1.0 if g["result"] > 0 else 0.0 if g["result"] < 0 else 0.5)
        cols["elo_diff"].append((eh - ea) * LN10_400)
        cols["epa_diff"].append(rt.strength(h) - rt.strength(a))
        eh_epa, ea_epa = by_game.get((g["game_id"], h)), by_game.get((g["game_id"], a))
        if eh_epa is not None and ea_epa is not None:
            rt.update(h, a, eh_epa, ea_epa)
            rt.update(a, h, ea_epa, eh_epa)
    return {k: np.array(v) for k, v in cols.items()}


def brier(p, y):
    return float(np.mean((p - y) ** 2))


def logloss(p, y):
    p = np.clip(p, 1e-6, 1 - 1e-6)
    return float(-np.mean(y * np.log(p) + (1 - y) * np.log(1 - p)))


def walk_forward(t, features, seasons):
    """Fit on all earlier seasons, predict each season in `seasons`. Returns (p, y)."""
    X_all = np.column_stack([t[f] for f in features] + [t["home"]])
    ps, ys = [], []
    for s in seasons:
        train = (t["season"] >= WARMUP) & (t["season"] < s) & (t["y"] != 0.5)
        test = (t["season"] == s) & t["reg"] & (t["y"] != 0.5)
        w = fit_logistic(X_all[train], t["y"][train])
        ps.append(predict(X_all[test], w))
        ys.append(t["y"][test])
    return np.concatenate(ps), np.concatenate(ys)


def report(name, p, y):
    acc = "n/a" if np.ptp(p) == 0 else f"{np.mean((p > .5) == (y > .5)):.1%}"
    print(f"  {name:<22} Brier {brier(p, y):.4f}   LogLoss {logloss(p, y):.4f}   Accuracy {acc}")


def main():
    print("Choosing the EPA smoothing factor (alpha) on validation seasons 2016-2017...")
    best = None
    for alpha in (0.01, 0.02, 0.03, 0.05, 0.08, 0.12, 0.2):
        t = build_table(alpha)
        p, y = walk_forward(t, ["epa_diff"], VALIDATION)
        b = brier(p, y)
        print(f"  alpha={alpha:<5} Brier {b:.4f}")
        if best is None or b < best[0]:
            best = (b, alpha, t)
    _, alpha, t = best
    print(f"-> alpha = {alpha}\n")

    seasons = list(TEST)
    n = int(np.sum(np.isin(t["season"], seasons) & t["reg"] & (t["y"] != 0.5)))
    print(f"Test: {seasons[0]}-{seasons[-1]} regular seasons, {n} games\n")
    mask = np.isin(t["season"], seasons) & t["reg"] & (t["y"] != 0.5)
    y = t["y"][mask]
    report("Coin flip (50%)", np.full(len(y), 0.5), y)
    home_rate = np.mean(t["y"][(t["season"] >= WARMUP) & (t["season"] < seasons[0]) & (t["y"] != .5)])
    report("Always home team", np.full(len(y), home_rate), y)
    # Elo exactly as the simulator uses it (no refitting): K=20, HFA 65
    p_raw = 1 / (1 + np.exp(-(t["elo_diff"][mask] + t["home"][mask] * 65 * LN10_400)))
    report("Elo (as in simulator)", p_raw, y)
    for name, feats in (("Elo (refit)", ["elo_diff"]),
                        ("EPA only", ["epa_diff"]),
                        ("Elo + EPA blend", ["elo_diff", "epa_diff"])):
        p, yy = walk_forward(t, feats, seasons)
        report(name, p, yy)


if __name__ == "__main__":
    main()
