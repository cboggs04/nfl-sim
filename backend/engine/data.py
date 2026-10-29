"""Load NFL schedule/results via nflreadpy (the maintained successor to nfl_data_py)
and cache them locally. Data is a polars DataFrame."""
from pathlib import Path

import polars as pl

DATA_DIR = Path(__file__).resolve().parent.parent / "data"

# Franchises that moved or rebranded: map old abbreviations to the current one
# so a team keeps one continuous Elo history.
TEAM_ALIASES = {"OAK": "LV", "SD": "LAC", "STL": "LA", "LAR": "LA"}


def load_games(seasons: list[int], refresh: bool = False) -> pl.DataFrame:
    """Return all games (regular season + playoffs) for the given seasons,
    sorted chronologically, with team abbreviations normalised.

    Cached to backend/data/schedules.parquet so we only hit the network once.
    Use refresh=True to re-download (e.g. as new weeks get played).
    """
    cache = DATA_DIR / "schedules.parquet"
    if cache.exists() and not refresh:
        df = pl.read_parquet(cache)
        if set(seasons) <= set(df["season"].unique().to_list()):
            return _clean(df.filter(pl.col("season").is_in(seasons)))
    import nflreadpy as nfl  # imported lazily so tests don't need the network

    df = nfl.load_schedules(seasons)
    DATA_DIR.mkdir(exist_ok=True)
    df.write_parquet(cache)
    return _clean(df)


def _clean(df: pl.DataFrame) -> pl.DataFrame:
    return (
        df.with_columns(pl.col("home_team", "away_team").replace(TEAM_ALIASES))
        .with_columns((pl.col("location") == "Neutral").alias("neutral"))
        .sort(["season", "gameday", "game_id"])
    )
