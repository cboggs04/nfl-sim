"""Measure how team results change player production (the 'game flow' used when simulating player stats).

For each stat, compare a team's total in games it won and lost against its average over all games, using
2020-2025 regular seasons. A factor of 1.12 for wins means teams produce 12% more of that stat in wins than on
average. Writes backend/engine/game_flow.json, which engine/players.py loads.

Run from backend/:  .venv/bin/python -m scripts.fit_game_flow
"""
import json
from pathlib import Path

import polars as pl

from engine.data import PLAYER_STAT_COLUMNS, TEAM_ALIASES, load_games

SEASONS = list(range(2020, 2026))
OUT = Path(__file__).resolve().parent.parent / "engine" / "game_flow.json"


def main():
    import nflreadpy as nfl

    games = load_games(SEASONS).filter((pl.col("game_type") == "REG") & pl.col("result").is_not_null())
    outcome = pl.concat([
        games.select("game_id", pl.col("home_team").alias("team"), (pl.col("result") > 0).alias("won"), (pl.col("result") != 0).alias("decided")),
        games.select("game_id", pl.col("away_team").alias("team"), (pl.col("result") < 0).alias("won"), (pl.col("result") != 0).alias("decided")),
    ])
    stats = nfl.load_player_stats(SEASONS).filter(pl.col("season_type") == "REG")
    stats = stats.with_columns(pl.col("team").replace(TEAM_ALIASES))
    stats = stats.with_columns((pl.col("def_tackles_solo") + pl.col("def_tackle_assists")).alias("tackles"))  # derived, as in engine.players
    cols = [c for c in PLAYER_STAT_COLUMNS + ["tackles"] if c in stats.columns]
    team_game = stats.group_by("game_id", "team").agg(*[pl.col(c).fill_null(0).sum() for c in cols])
    df = team_game.join(outcome, on=["game_id", "team"]).filter(pl.col("decided"))

    flow = {}
    print(f"{'stat':<26}{'in wins':>9}{'in losses':>11}")
    for c in cols:
        overall = df[c].mean()
        if not overall:
            continue
        win = df.filter(pl.col("won"))[c].mean() / overall
        loss = df.filter(~pl.col("won"))[c].mean() / overall
        flow[c] = {"win": round(win, 3), "loss": round(loss, 3)}
        print(f"{c:<26}{win:>9.3f}{loss:>11.3f}")
    OUT.write_text(json.dumps(flow, indent=1))
    print(f"\nSaved {OUT} ({df.height} team-games)")


if __name__ == "__main__":
    main()
