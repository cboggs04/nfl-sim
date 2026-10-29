"""Live interactive-simulation endpoints (the demo's "simulate a season" and "play a game")."""
import random
from functools import lru_cache

from fastapi import APIRouter, HTTPException

from engine.data import DATA_DIR
from engine.elo import EloConfig
from engine.playoffs import play_game
from engine.simulate import simulate_one_season
from engine.teams import TEAMS

from .schemas import (PlayoffGameRequest, PlayoffGameResponse, SimGameResult, SimState,
                      SimStanding, SimulatedSeason)

router = APIRouter(prefix="/api/sim")


@lru_cache
def _state() -> tuple[SimState, EloConfig, list[dict]]:
    path = DATA_DIR / "sim_state.json"
    if not path.exists():
        raise HTTPException(503, "sim_state.json not generated yet. Run: python -m scripts.precompute")
    state = SimState.model_validate_json(path.read_text())
    cfg = EloConfig(k=state.config["k"], home_field=state.config["home_field"],
                    season_regression=state.config["season_regression"])
    schedule = [g.model_dump() for g in state.games]
    return state, cfg, schedule


@router.post("/season", response_model=SimulatedSeason)
def simulate_season_once():
    """Play out the rest of the season once and seed the playoffs with the real tiebreakers."""
    state, cfg, schedule = _state()
    out = simulate_one_season(schedule, state.ratings, cfg, random.Random())
    return SimulatedSeason(
        games=[SimGameResult(**g) for g in out["games"]],
        standings=[SimStanding(team=t, wins=w, losses=l, ties=ties)
                   for t, (w, l, ties) in sorted(out["standings"].items())],
        seeds=out["seeds"],
        division_winners=out["division_winners"],
    )


@router.post("/game", response_model=PlayoffGameResponse)
def playoff_game(req: PlayoffGameRequest):
    """Roll one playoff game using the Elo win probability (or just return the odds)."""
    state, cfg, _ = _state()
    for t in (req.home, req.away):
        if t not in TEAMS:
            raise HTTPException(422, f"Unknown team '{t}'")
    if req.home == req.away:
        raise HTTPException(422, "A team cannot play itself")
    p_home, winner = play_game(req.home, req.away, state.ratings, random.Random(), cfg, req.neutral)
    return PlayoffGameResponse(home=req.home, away=req.away, p_home=p_home,
                               winner=winner if req.play else None)
