"""Check the live win probability (engine/live.py) on real play-by-play: Brier score and calibration against final
results, next to nflverse's fitted, spread-aware win probability (vegas_home_wp). Downloads play-by-play (~200 MB).

    cd backend && .venv/bin/python -m scripts.check_live_wp [--sd 13.5 15]

Result (2024-25, every 7th play, 13,389 plays): sd 13.5 -> 0.1529, sd 15 -> 0.1516; nflverse 0.1447.
"""
import argparse
from statistics import NormalDist

import nflreadpy as nfl
import polars as pl

import engine.live as live


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--seasons", type=int, nargs="+", default=[2024, 2025])
    ap.add_argument("--sd", type=float, nargs="+", default=[13.5, 15.0])
    args = ap.parse_args()
    cols = ["qtr", "quarter_seconds_remaining", "total_home_score", "total_away_score", "posteam", "home_team",
            "yardline_100", "vegas_home_wp", "result", "spread_line"]
    rows = (nfl.load_pbp(args.seasons).filter(pl.col("season_type") == "REG").select(cols)
            .drop_nulls(["vegas_home_wp", "result", "spread_line", "quarter_seconds_remaining"]).gather_every(7).to_dicts())
    pre_of = NormalDist(0, 13.5).cdf   # pregame P(home wins) from the closing spread
    for sd in args.sd:
        live.MARGIN_SD = sd
        mine = theirs = 0.0
        buckets: dict[int, list[float]] = {}
        for r in rows:
            p = live.live_win_prob(pre_of(r["spread_line"]), r["total_home_score"], r["total_away_score"], min(r["qtr"], 5),
                                   r["quarter_seconds_remaining"], None if r["posteam"] is None else r["posteam"] == r["home_team"],
                                   r["yardline_100"])
            y = 1.0 if r["result"] > 0 else 0.0 if r["result"] < 0 else 0.5
            mine += (p - y) ** 2
            theirs += (r["vegas_home_wp"] - y) ** 2
            b = buckets.setdefault(min(9, int(p * 10)), [0.0, 0])
            b[0] += y
            b[1] += 1
        n = len(rows)
        print(f"sd {sd}: Brier {mine / n:.4f} (nflverse {theirs / n:.4f}, {n:,} plays)")
        print("  predicted -> actual: " + "  ".join(f"{k / 10:.1f}+ {s / c:.2f}" for k, (s, c) in sorted(buckets.items())))


if __name__ == "__main__":
    main()
