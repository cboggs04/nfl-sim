"""FastAPI app. Serves the precomputed JSON in backend/data/ (see scripts/precompute.py).

Run from backend/:  .venv/bin/uvicorn app.main:app --reload
Interactive docs:   http://localhost:8000/docs
"""
import json
import os
from functools import lru_cache

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from engine.data import DATA_DIR

from .datafiles import file_stamp
from .leaders import router as leaders_router
from .rosters import router as rosters_router
from .sim import router as sim_router
from .whatif import router as whatif_router
from .schemas import BacktestResponse, BracketResponse, SeasonResponse, TeamDetail

app = FastAPI(title="NFL Season Simulator API")

# The Next.js frontend runs on a different origin, so the browser needs CORS permission.
# Set CORS_ORIGINS="https://your-app.vercel.app,http://localhost:3000" in production.
origins = os.environ.get("CORS_ORIGINS", "http://localhost:3000").split(",")
# CORS_ORIGIN_REGEX (optional) also allows e.g. every Vercel preview URL: "https://.*\\.vercel\\.app"
app.add_middleware(CORSMiddleware, allow_origins=origins, allow_origin_regex=os.environ.get("CORS_ORIGIN_REGEX") or None,
                   allow_methods=["*"], allow_headers=["*"])
app.include_router(sim_router)
app.include_router(rosters_router)
app.include_router(leaders_router)
app.include_router(whatif_router)


@lru_cache
def _load_cached(model: type[BaseModel], filename: str, stamp: tuple) -> BaseModel:
    path = DATA_DIR / filename
    if not path.exists():
        raise HTTPException(503, f"{filename} not generated yet. Run: python -m scripts.precompute")
    return model.model_validate_json(path.read_text())


def _load(model: type[BaseModel], filename: str) -> BaseModel:
    """Read and validate a precomputed JSON file, kept in memory until the file changes."""
    return _load_cached(model, filename, file_stamp(filename))


@lru_cache
def _load_teams_cached(stamp: tuple) -> dict[str, TeamDetail]:
    path = DATA_DIR / "teams.json"
    if not path.exists():
        raise HTTPException(503, "teams.json not generated yet. Run: python -m scripts.precompute")
    return {k: TeamDetail.model_validate(v) for k, v in json.loads(path.read_text()).items()}


def _load_teams() -> dict[str, TeamDetail]:
    return _load_teams_cached(file_stamp("teams.json"))


@app.get("/api/health")
def health():
    """Cheap check for the host (and for waking a sleeping server): are the data files there, and how fresh?"""
    stamps = file_stamp("season.json", "rosters.json", "leaders.json", "sim_state.json")
    return {"status": "ok" if all(stamps) else "missing data", "season_generated_at": _load(SeasonResponse, "season.json").generated_at}


@app.get("/api/season", response_model=SeasonResponse)
def get_season():
    """Dashboard: every team's record, expected wins, and playoff/Super Bowl odds."""
    return _load(SeasonResponse, "season.json")


@app.get("/api/teams/{abbr}", response_model=TeamDetail)
def get_team(abbr: str):
    """Team deep-dive: win distribution, seed odds, and per-game win probabilities."""
    team = _load_teams().get(abbr.upper())
    if team is None:
        raise HTTPException(404, f"Unknown team '{abbr}'")
    return team


@app.get("/api/bracket", response_model=BracketResponse)
def get_bracket():
    """Playoff picture: who is likely to hold each seed and advance each round."""
    return _load(BracketResponse, "bracket.json")


@app.get("/api/backtest", response_model=BacktestResponse)
def get_backtest():
    """Model accuracy and calibration on past seasons."""
    return _load(BacktestResponse, "backtest.json")
