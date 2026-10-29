"""Elo ratings -> Monte Carlo of the 272-game season + playoffs -> terminal table.

Run from backend/:  .venv/bin/python -m scripts.run_milestone1 [--season 2026] [--sims 10000]
"""
import argparse

import polars as pl

from engine.data import load_games
from engine.elo import EloConfig, compute_ratings, regress_to_mean
from engine.simulate import simulate_league

FIRST_SEASON = 2010  # ~15 years of history is plenty for Elo to converge


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--season", type=int, default=2026)
    ap.add_argument("--sims", type=int, default=10_000)
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--preseason", action="store_true",
                    help="ignore games already played; simulate the full season from kickoff ratings")
    ap.add_argument("--refresh", action="store_true", help="re-download data")
    args = ap.parse_args()

    cfg = EloConfig()
    df = load_games(list(range(FIRST_SEASON, args.season + 1)), refresh=args.refresh)
    played = pl.col("result").is_not_null()

    schedule = df.filter((pl.col("season") == args.season) & (pl.col("game_type") == "REG")).to_dicts()
    if args.preseason:
        # Ratings as of kickoff, and every game re-simulated (ignores real results).
        history = df.filter((pl.col("season") < args.season) & played)
        ratings = regress_to_mean(compute_ratings(history.to_dicts(), cfg), cfg)
        for g in schedule:
            g["result"] = None
    else:
        # Ratings include this season's games so far; played games stay fixed.
        history = df.filter(played)
        ratings = compute_ratings(history.to_dicts(), cfg)

    n_played = sum(g["result"] is not None for g in schedule)
    record = {}
    for g in schedule:
        if g["result"] is not None and g["result"] != 0:
            w, l = (g["home_team"], g["away_team"]) if g["result"] > 0 else (g["away_team"], g["home_team"])
            record.setdefault(w, [0, 0])[0] += 1
            record.setdefault(l, [0, 0])[1] += 1
    print(f"{args.season}: {len(schedule)} regular-season games ({n_played} played and locked in, "
          f"{len(schedule) - n_played} simulated), {args.sims:,} simulations")
    print(f"Elo from {len(history)} games ({FIRST_SEASON}-"
          f"{args.season if not args.preseason else args.season - 1}).\n")

    league = simulate_league(schedule, ratings, args.sims, cfg, args.seed)

    print(f"{'Team':<5}{'Rec':>6}{'Elo':>5}{'ExpW':>6}{'Div':>6}{'Playoff':>9}{'#1 Seed':>9}{'Conf':>6}{'SB':>6}  Likely wins")
    for t, r in sorted(league.items(), key=lambda kv: -kv[1]["p_super_bowl"] - kv[1]["p_playoffs"] * 1e-3):
        top = sorted(sorted(range(18), key=lambda w: -r["win_dist"][w])[:3])
        likely = ", ".join(f"{w}W {r['win_dist'][w]:.0%}" for w in top)
        rec = "-".join(map(str, record.get(t, [0, 0])))
        print(f"{t:<5}{rec:>6}{ratings[t]:>5.0f}{r['exp_wins']:>6.1f}{r['p_division']:>6.0%}{r['p_playoffs']:>9.0%}"
              f"{r['p_top_seed']:>9.0%}{r['p_conference']:>6.0%}{r['p_super_bowl']:>6.0%}  {likely}")


if __name__ == "__main__":
    main()
