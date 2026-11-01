"""League stat leaders and projected award winners."""
from functools import lru_cache

from fastapi import APIRouter, HTTPException

from engine.data import DATA_DIR

from .datafiles import file_stamp
from .schemas import LeadersResponse

router = APIRouter(prefix="/api")


@lru_cache
def _leaders_cached(stamp: tuple) -> LeadersResponse:
    path = DATA_DIR / "leaders.json"
    if not path.exists():
        raise HTTPException(503, "leaders.json not generated yet. Run: python -m scripts.precompute")
    return LeadersResponse.model_validate_json(path.read_text())


def _leaders() -> LeadersResponse:
    return _leaders_cached(file_stamp("leaders.json"))


@router.get("/leaders", response_model=LeadersResponse)
def get_leaders():
    return _leaders()
