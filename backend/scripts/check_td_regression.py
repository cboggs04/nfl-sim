"""Check how far touchdown rates should regress toward what a player's yardage implies.

Predicts each player's touchdowns in weeks 8+ from his weeks 1-7 and last season, for 2019-2025, and reports the error
for several blends of 'his own TD rate' and 'the rate his yards imply'. The weights in engine/players.py (TD_FROM_YARDS)
come from this. Run from backend/:  .venv/bin/python -m scripts.check_td_regression
"""
import nflreadpy as nfl
import numpy as np
import polars as pl


def main():
    SEASONS = list(range(2019, 2026))
    CUT = 7   # predict weeks 8+ from weeks 1-7
    w = nfl.load_player_stats(SEASONS).filter(pl.col("season_type") == "REG")
    cols = ["passing_tds", "passing_yards", "rushing_tds", "rushing_yards", "receiving_tds", "receiving_yards", "attempts", "carries", "targets"]
    w = w.with_columns([pl.col(c).fill_null(0) for c in cols])
    base = w.group_by("season", "player_id", "position").agg(
        pl.col("week").filter(pl.col("week") <= CUT).n_unique().alias("g0"),
        *[pl.col(c).filter(pl.col("week") <= CUT).sum().alias(c + "_0") for c in cols],
        pl.col("week").filter(pl.col("week") > CUT).n_unique().alias("g1"),
        *[pl.col(c).filter(pl.col("week") > CUT).sum().alias(c + "_1") for c in cols],
        pl.col("week").n_unique().alias("gall"),
        *[pl.col(c).sum().alias(c + "_all") for c in cols])
    prev = base.select("season", "player_id", *[pl.col(c + "_all").alias(c + "_p") for c in cols], pl.col("gall").alias("gp_p")).with_columns((pl.col("season") + 1).alias("season"))
    d = base.join(prev, on=["season", "player_id"], how="left").filter((pl.col("g0") >= 4) & (pl.col("g1") >= 4)).to_dicts()
    print(len(d), "player-seasons")
    # league touchdowns per yard by position (from all other seasons would be cleaner; this is stable enough)
    def per_yard(pos, td, yd):
        rows = [r for r in d if r["position"] in pos]
        return sum(r[td + "_all"] for r in rows) / max(1, sum(r[yd + "_all"] for r in rows))
    TDY = {"QB": {"passing": per_yard(["QB"], "passing_tds", "passing_yards"), "rushing": per_yard(["QB"], "rushing_tds", "rushing_yards")},
           "RB": {"rushing": per_yard(["RB"], "rushing_tds", "rushing_yards"), "receiving": per_yard(["RB"], "receiving_tds", "receiving_yards")},
           "WR": {"receiving": per_yard(["WR"], "receiving_tds", "receiving_yards")}, "TE": {"receiving": per_yard(["TE"], "receiving_tds", "receiving_yards")}}
    print({k: {a: round(b, 4) for a, b in v.items()} for k, v in TDY.items()})
    def rate(r, kind, prior_games, wy):
        td, yd = kind + "_tds", kind + "_yards"
        g0 = r["g0"]; obs = r[td + "_0"]; yrate = r[yd + "_0"] / g0
        if r.get("gp_p"):
            obs_rate = (obs + r[td + "_p"] / r["gp_p"] * prior_games) / (g0 + prior_games)
            y_rate = (r[yd + "_0"] + r[yd + "_p"] / r["gp_p"] * prior_games) / (g0 + prior_games)
        else:
            obs_rate = obs / g0; y_rate = yrate
        expected = y_rate * TDY.get(r["position"], {}).get(kind, 0)
        return wy * expected + (1 - wy) * obs_rate
    groups = [("QB rushing TDs", "rushing", ["QB"], lambda r: r["carries_0"] + r["rushing_yards_0"] > 0 and r["attempts_0"] > 80),
              ("RB rushing TDs", "rushing", ["RB"], lambda r: r["carries_0"] >= 50),
              ("WR/TE receiving TDs", "receiving", ["WR", "TE"], lambda r: r["targets_0"] >= 20),
              ("QB passing TDs", "passing", ["QB"], lambda r: r["attempts_0"] > 120)]
    for name, kind, pos, cond in groups:
        rows = [r for r in d if r["position"] in pos and cond(r)]
        print(f"\n{name}  (n={len(rows)})  RMSE of rest-of-season TD forecast; lower is better")
        for pg in (3, 8):
            line = []
            for wy in (0.0, 0.25, 0.5, 0.75, 1.0):
                err = [(rate(r, kind, pg, wy) * r["g1"] - r[kind + "_tds_1"]) ** 2 for r in rows]
                line.append(f"yards-weight {wy:.2f}: {np.sqrt(np.mean(err)):.3f}")
            print(f"  prior {pg} games: " + " | ".join(line))
        # How much of the forecast error is NOT pure chance? Error variance = Poisson variance (~ the forecast) + (cv x forecast)^2.
        best_w = {"QB rushing TDs": 0.4, "QB passing TDs": 0.75}.get(name, 0.75)
        pred = np.array([rate(r, kind, 3, best_w) * r["g1"] for r in rows])
        actual = np.array([r[kind + "_tds_1"] for r in rows])
        cv2 = (np.mean((pred - actual) ** 2) - pred.mean()) / np.mean(pred**2)
        print(f"  uncertainty in true TD rate beyond chance (cv): {np.sqrt(max(cv2, 0)):.2f}   (mean forecast {pred.mean():.1f} TDs)")


if __name__ == "__main__":
    main()
