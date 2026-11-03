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


def load_qb_game_epa(seasons: list[int], refresh: bool = False) -> pl.DataFrame:
    """Each quarterback's passing value in each game, from play-by-play.

    One row per (game, passer): game_id, season, team, passer_id, passer, dropbacks
    (pass attempts + sacks + scrambles) and epa (total EPA on those plays). Cached to
    backend/data/qb_game_epa.parquet, one season at a time, like load_team_game_epa.
    refresh=True re-downloads only the latest requested season (the one still being played).
    """
    cache = DATA_DIR / "qb_game_epa.parquet"
    have = pl.read_parquet(cache) if cache.exists() else None
    if have is not None and refresh:
        have = have.filter(pl.col("season") != max(seasons))
    have_seasons = set(have["season"].unique().to_list()) if have is not None else set()
    missing = [s for s in seasons if s not in have_seasons]
    if missing:
        import nflreadpy as nfl

        parts = [have] if have is not None else []
        for season in missing:
            pbp = nfl.load_pbp([season])
            parts.append(
                pbp.filter((pl.col("qb_dropback") == 1) & pl.col("qb_epa").is_not_null() & pl.col("passer_player_id").is_not_null())
                .group_by("game_id", "season", "posteam", "passer_player_id")
                .agg(pl.col("passer_player_name").first().alias("passer"), pl.len().alias("dropbacks"),
                     pl.col("qb_epa").sum().alias("epa"))
                .rename({"posteam": "team", "passer_player_id": "passer_id"})
            )
        have = pl.concat(parts)
        DATA_DIR.mkdir(exist_ok=True)
        have.write_parquet(cache)
    return have.filter(pl.col("season").is_in(seasons)).with_columns(pl.col("team").replace(TEAM_ALIASES))


# ---- Players (rosters, season stat totals, games played) ----

PLAYER_STAT_COLUMNS = [
    "completions", "attempts", "passing_yards", "passing_tds", "passing_interceptions",
    "carries", "rushing_yards", "rushing_tds",
    "targets", "receptions", "receiving_yards", "receiving_tds",
    "def_tackles_solo", "def_tackle_assists", "def_tackles_for_loss", "def_sacks", "def_interceptions",
    "def_pass_defended", "fg_made", "fg_att", "pat_made", "pat_att", "pt_att", "pt_yards", "pt_inside_20",
    "passing_epa", "rushing_epa", "receiving_epa",   # expected points added (used for the skill-player ratings)
]
ROSTER_COLUMNS = ["gsis_id", "pfr_id", "full_name", "team", "position", "jersey_number", "status",
                  "years_exp", "birth_date", "headshot_url", "height", "weight", "college"]


def load_roster(season: int, refresh: bool = False) -> pl.DataFrame:
    """Current roster for a season (one row per player), cached to backend/data/roster_<season>.parquet.
    Includes headshot URLs. Rosters change weekly, so refresh=True re-downloads."""
    cache = DATA_DIR / f"roster_{season}.parquet"
    if cache.exists() and not refresh:
        df = pl.read_parquet(cache)
    else:
        import nflreadpy as nfl

        df = nfl.load_rosters([season]).select(ROSTER_COLUMNS)
        DATA_DIR.mkdir(exist_ok=True)
        df.write_parquet(cache)
    return df.with_columns(pl.col("team").replace(TEAM_ALIASES))


def load_player_totals(seasons: list[int], refresh: bool = False) -> pl.DataFrame:
    """Regular-season stat totals per player and season: player_id (gsis), season, weeks (games with
    a stat line) plus the sums in PLAYER_STAT_COLUMNS. Cached to backend/data/player_totals.parquet;
    refresh=True re-downloads only the latest requested season."""
    cache = DATA_DIR / "player_totals.parquet"
    have = pl.read_parquet(cache) if cache.exists() else None
    if have is not None and "passing_epa" not in have.columns:
        have = None  # an older cache without the EPA columns: download again
    if have is not None and refresh:
        have = have.filter(pl.col("season") != max(seasons))
    have_seasons = set(have["season"].unique().to_list()) if have is not None else set()
    missing = [s for s in seasons if s not in have_seasons]
    if missing:
        import nflreadpy as nfl

        parts = [have] if have is not None else []
        for season in missing:
            w = nfl.load_player_stats([season]).filter(pl.col("season_type") == "REG")
            for c in PLAYER_STAT_COLUMNS:  # a column can be missing in a season with no such plays
                if c not in w.columns:
                    w = w.with_columns(pl.lit(0).alias(c))
            parts.append(
                w.group_by("player_id", "season")
                .agg(pl.col("week").n_unique().alias("weeks"),
                     *[pl.col(c).fill_null(0).sum().cast(pl.Float64) for c in PLAYER_STAT_COLUMNS])
            )
        have = pl.concat(parts)
        DATA_DIR.mkdir(exist_ok=True)
        have.write_parquet(cache)
    return have.filter(pl.col("season").is_in(seasons))


def load_snap_games(season: int, refresh: bool = False) -> pl.DataFrame:
    """Games each player was on the field for (any offense, defense or special-teams snap): pfr_id, games.
    This is a truer 'games played' than stat lines (linemen rarely have stats). Cached per season."""
    cache = DATA_DIR / f"snap_games_{season}.parquet"
    if cache.exists() and not refresh:
        return pl.read_parquet(cache)
    import nflreadpy as nfl

    s = nfl.load_snap_counts([season]).filter(pl.col("game_type") == "REG")
    out = (
        s.with_columns((pl.col("offense_snaps").fill_null(0) + pl.col("defense_snaps").fill_null(0)
                        + pl.col("st_snaps").fill_null(0)).alias("snaps"))
        .filter(pl.col("snaps") > 0)
        .group_by("pfr_player_id").agg(pl.col("week").n_unique().alias("games"))
        .rename({"pfr_player_id": "pfr_id"})
    )
    DATA_DIR.mkdir(exist_ok=True)
    out.write_parquet(cache)
    return out
