"""Fit the numbers in engine/scores.py from historical games (2016-2025 regular season).

Reports: expected margin per Elo point, the spread of margins around it, and the mean and spread of total points.
Run from backend/:  .venv/bin/python -m scripts.fit_score_model
"""
import numpy as np
import polars as pl

from engine.data import load_games
from engine.elo import EloConfig, walk_games


def main():
    games = load_games(list(range(2010, 2026))).filter(pl.col("result").is_not_null()).to_dicts()
    cfg = EloConfig()
    gap, margin, total = [], [], []
    for g, eh, ea in walk_games(games, cfg):
        if g["game_type"] != "REG" or g["season"] < 2016:   # skip the first seasons while ratings settle
            continue
        gap.append(eh - ea + (0 if g["neutral"] else cfg.home_field))
        margin.append(g["home_score"] - g["away_score"])
        total.append(g["home_score"] + g["away_score"])
    gap, margin, total = np.array(gap), np.array(margin, float), np.array(total, float)
    slope, intercept = np.polyfit(gap, margin, 1)
    resid = margin - (slope * gap + intercept)
    print(f"{len(gap)} games")
    print(f"MARGIN_PER_ELO = {slope:.4f}  ({slope * 100:.1f} points per 100 Elo; intercept {intercept:.2f})")
    print(f"MARGIN_SD      = {resid.std():.1f}")
    print(f"TOTAL_MEAN     = {total.mean():.1f}   TOTAL_SD = {total.std():.1f}")
    print(f"corr(total, |margin|) = {np.corrcoef(total, np.abs(margin))[0, 1]:.2f}  (near 0: drawing them independently is fine)")


if __name__ == "__main__":
    main()
