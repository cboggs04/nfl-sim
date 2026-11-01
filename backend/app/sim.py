"""Live interactive-simulation endpoints (the demo's "simulate a season" and "play a game")."""
import random
from functools import lru_cache

from fastapi import APIRouter, HTTPException

from engine.data import DATA_DIR
from engine.elo import EloConfig, game_probability
from engine.players import simulate_player
from engine.playoffs import play_game
from engine.simulate import simulate_one_season
from engine.teams import TEAMS

from .datafiles import file_stamp
from .rosters import load_rosters
from .schemas import (PlayoffGameRequest, PlayoffGameResponse, SimGameResult, SimState,
                      SimPlayerResult, SimStanding, SimTeamGame, SimTeamRequest, SimTeamResult, SimulatedSeason)

router = APIRouter(prefix="/api/sim")


def _state() -> tuple[SimState, EloConfig, list[dict]]:
    return _state_cached(file_stamp("sim_state.json"))


@lru_cache
def _state_cached(stamp: tuple) -> tuple[SimState, EloConfig, list[dict]]:
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


@router.post("/team", response_model=SimTeamResult)
def simulate_team_season(req: SimTeamRequest):
    """Play out one team's remaining games, then its players' stats, with results driving the stats."""
    import numpy as np

    team = req.team.upper()
    if team not in TEAMS:
        raise HTTPException(422, f"Unknown team '{req.team}'")
    state, cfg, schedule = _state()
    rng = random.Random()
    games = []
    for g in sorted((g for g in schedule if g["result"] is None and team in (g["home_team"], g["away_team"])), key=lambda g: g["week"]):
        home = g["home_team"] == team
        p_home = game_probability(g, state.ratings, cfg)
        p = p_home if home else 1 - p_home
        games.append(SimTeamGame(game_id=g["game_id"], week=g["week"], opponent=g["away_team"] if home else g["home_team"],
                                 home=home, neutral=g["neutral"], p_win=p, win=rng.random() < p))
    nprng = np.random.default_rng()
    wins = [g.win for g in games]
    players = []
    for pl in load_rosters()[team].players:
        sim = simulate_player(pl.model_dump(), wins, nprng)
        players.append(SimPlayerResult(id=pl.id, gp=sim["gp"], stats={k: round(v, 1) for k, v in sim["stats"].items()}))
    return SimTeamResult(team=team, games=games, players=players)
