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


def load_team_game_epa(seasons: list[int], refresh: bool = False) -> pl.DataFrame:
    """Per team-game offensive EPA/play from play-by-play (pass + run plays only).

    One row per (game, offensive team): game_id, season, team, opp, epa (mean EPA
    per play), plays. A team's *defense* in a game is just its opponent's row.
    Play-by-play is huge (~100 MB/season), so we aggregate each season once and
    cache only the small result in backend/data/team_game_epa.parquet.
    """
    cache = DATA_DIR / "team_game_epa.parquet"
    have = pl.read_parquet(cache) if cache.exists() and not refresh else None
    have_seasons = set(have["season"].unique().to_list()) if have is not None else set()
    missing = [s for s in seasons if s not in have_seasons]
    if missing:
        import nflreadpy as nfl

        parts = [have] if have is not None else []
        for season in missing:
            pbp = nfl.load_pbp([season])
            parts.append(
                pbp.filter(pl.col("play_type").is_in(["pass", "run"]) & pl.col("epa").is_not_null())
                .group_by("game_id", "season", "posteam", "defteam")
                .agg(pl.col("epa").mean(), pl.len().alias("plays"))
                .rename({"posteam": "team", "defteam": "opp"})
            )
        have = pl.concat(parts)
        DATA_DIR.mkdir(exist_ok=True)
        have.write_parquet(cache)
    return have.filter(pl.col("season").is_in(seasons)).with_columns(
        pl.col("team", "opp").replace(TEAM_ALIASES)
    )
