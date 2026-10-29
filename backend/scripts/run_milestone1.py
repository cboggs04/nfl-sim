"""Milestone 1: Elo ratings -> Monte Carlo of one 272-game season -> terminal table.

Run from backend/:  .venv/bin/python -m scripts.run_milestone1 [--season 2026] [--sims 10000]
"""
import argparse

import polars as pl

from engine.data import load_games
from engine.elo import EloConfig, compute_ratings, regress_to_mean
from engine.simulate import simulate_season, summarize

FIRST_SEASON = 2010  # ~15 years of history is plenty for Elo to converge


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--season", type=int, default=2026)
    ap.add_argument("--sims", type=int, default=10_000)
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--refresh", action="store_true", help="re-download data")
    args = ap.parse_args()

    cfg = EloConfig()
    df = load_games(list(range(FIRST_SEASON, args.season + 1)), refresh=args.refresh)

    history = df.filter((pl.col("season") < args.season) & pl.col("result").is_not_null())
    ratings = regress_to_mean(compute_ratings(history.to_dicts(), cfg), cfg)

    schedule = df.filter((pl.col("season") == args.season) & (pl.col("game_type") == "REG")).to_dicts()
    print(f"{args.season}: {len(schedule)} regular-season games, {args.sims:,} simulations")
    print(f"Ratings from {len(history)} games ({FIRST_SEASON}-{args.season - 1}), "
          f"regressed 1/3 to the mean for the new season.\n")

    teams, wins = simulate_season(schedule, ratings, args.sims, cfg, args.seed)
    rows = summarize(teams, wins)

    print(f"{'Team':<5}{'Elo':>6}{'ExpW':>7}  {'Win distribution (most likely win totals)'}")
    for r in rows:
        top = sorted(range(18), key=lambda w: -r["dist"][w])[:3]
        mode = max(range(18), key=lambda w: r["dist"][w])
        bar = "#" * round(r["dist"][mode] * 100)
        likely = ", ".join(f"{w}W {r['dist'][w]:.0%}" for w in sorted(top))
        print(f"{r['team']:<5}{ratings[r['team']]:>6.0f}{r['exp_wins']:>7.2f}  {likely:<26}{bar}")


if __name__ == "__main__":
    main()
