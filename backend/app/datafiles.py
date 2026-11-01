"""Helper so cached data files reload by themselves when scripts.precompute rewrites them."""
from engine.data import DATA_DIR


def file_stamp(*filenames: str) -> tuple[int, ...]:
    """Last-modified time of each data file (0 if missing). Used as part of a cache key: a rewritten file
    gets a new stamp, so the next request loads it fresh. No server restart needed after re-running precompute."""
    return tuple((DATA_DIR / n).stat().st_mtime_ns if (DATA_DIR / n).exists() else 0 for n in filenames)
