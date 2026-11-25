"""Scores page and live scores: GET /api/games (the season's games, precomputed) and GET /api/live (games in
progress, from ESPN's scoreboard via engine/live.py, shared by every visitor through a short cache)."""
import json
import time
from datetime import datetime, timezone
from functools import lru_cache

from fastapi import APIRouter, HTTPException

from engine.data import DATA_DIR
from engine.live import LiveCache, demo_games, parse_scoreboard

from .datafiles import file_stamp
from .schemas import GamesResponse, LiveResponse, ScoreGame, TeamDetail

router = APIRouter(prefix="/api")
_cache = LiveCache()


@lru_cache
def _games_cached(stamp: tuple) -> GamesResponse:
    path = DATA_DIR / "games.json"
    if path.exists():
        return GamesResponse.model_validate_json(path.read_text())
    return _games_from_teams()


def load_games_response() -> GamesResponse:
    return _games_cached(file_stamp("games.json", "teams.json"))


def _games_from_teams() -> GamesResponse:
    """Fallback for data written before games.json existed: rebuild the games from teams.json (no kickoff times,
    and played games show the current model probability instead of the pregame one)."""
    path = DATA_DIR / "teams.json"
    if not path.exists():
        raise HTTPException(503, "games.json not generated yet. Run: python -m scripts.precompute")
    teams = {k: TeamDetail.model_validate(v) for k, v in json.loads(path.read_text()).items()}
    elo = {t: d.odds.elo for t, d in teams.items()}
    season = next(iter(teams.values())).season
    games = []
    for t, d in teams.items():
        for g in d.games:
            if not g.home:
                continue
            p = g.p_win if g.p_win is not None else 1 / (1 + 10 ** (-(elo[t] - elo[g.opponent]) / 400))
            games.append(ScoreGame(game_id=g.game_id, week=g.week, kickoff=g.kickoff, home=t, away=g.opponent,
                                   neutral=g.neutral, played=g.played, home_score=g.team_score, away_score=g.opp_score,
                                   overtime=False, p_home=round(p, 4)))
    games.sort(key=lambda g: (g.week, g.kickoff or "", g.game_id))
    open_weeks = [g.week for g in games if not g.played]
    return GamesResponse(season=season, current_week=min(open_weeks) if open_weeks else max(g.week for g in games),
                         games=games)


def _schedule() -> list[dict]:
    return [g.model_dump() for g in load_games_response().games]


@router.get("/games", response_model=GamesResponse)
def get_games():
    """Every regular-season game with its result (if played), kickoff time and the model's win probability."""
    return load_games_response()


@router.get("/live", response_model=LiveResponse)
def get_live(demo: bool = False):
    """Games on ESPN's current scoreboard, matched to ours, with live in-game win probability.
    `?demo=1` returns a made-up, sped-up live version of the current week instead (for presenting when no game is on)."""
    if demo:
        week = load_games_response().current_week
        games = demo_games(_schedule(), week)
        return LiveResponse(source="demo", fetched_at=_iso(time.time()), week=week, games=[g.to_dict() for g in games])
    data, fetched_at, _error = _cache.get()
    if data is None:
        return LiveResponse(source="unavailable", fetched_at=None, week=None, games=[])
    games = parse_scoreboard(data, _schedule())
    return LiveResponse(source="espn", fetched_at=_iso(fetched_at), week=(data.get("week") or {}).get("number"),
                        games=[g.to_dict() for g in games])


def _iso(t: float) -> str:
    return datetime.fromtimestamp(t, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
