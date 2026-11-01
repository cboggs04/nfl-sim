"""Roster endpoint: every player on a team with current and projected stats."""
from functools import lru_cache

from fastapi import APIRouter, HTTPException

from engine.data import DATA_DIR

from .datafiles import file_stamp
from .schemas import TeamRoster

router = APIRouter(prefix="/api")


def load_rosters() -> dict[str, TeamRoster]:
    return _load_rosters_cached(file_stamp("rosters.json"))


@lru_cache
def _load_rosters_cached(stamp: tuple) -> dict[str, TeamRoster]:
    import json

    path = DATA_DIR / "rosters.json"
    if not path.exists():
        raise HTTPException(503, "rosters.json not generated yet. Run: python -m scripts.precompute")
    return {t: TeamRoster.model_validate(r) for t, r in json.loads(path.read_text()).items()}


@router.get("/teams/{abbr}/roster", response_model=TeamRoster)
def get_roster(abbr: str):
    roster = load_rosters().get(abbr.upper())
    if roster is None:
        raise HTTPException(404, f"Unknown team '{abbr}'")
    return roster
