"""Trades: which players can be moved, and what moving one does to the two teams' ratings (engine.trade)."""
import json
from functools import lru_cache

from fastapi import APIRouter, HTTPException

from engine.data import DATA_DIR
from engine.teams import TEAMS
from engine.trade import MAX_VALUE, TRADABLE, player_values, trade_effect

from .datafiles import file_stamp
from .rosters import load_rosters
from .schemas import Trade, TradeCandidate, TradeEffect

router = APIRouter(prefix="/api")


@lru_cache
def _context_cached(stamp: tuple):
    rosters = load_rosters()
    players = {t: [p.model_dump() for p in r.players] for t, r in rosters.items()}
    values = player_values(players)
    season = json.loads((DATA_DIR / "season.json").read_text())
    starters = {t["team"]: (t.get("qb"), float(t.get("qb_adj") or 0.0)) for t in season["teams"]}  # team -> (QB name, Elo adj)
    return players, values, starters


def _context():
    return _context_cached(file_stamp("rosters.json", "season.json"))


def _find(players: dict[str, list[dict]], team: str, pid: str) -> dict | None:
    return next((p for p in players.get(team, []) if p["id"] == pid), None)


@router.get("/trade/{abbr}/players", response_model=list[TradeCandidate])
def trade_candidates(abbr: str):
    """The team's players who can be traded, best first, with each one's estimated Elo value."""
    team = abbr.upper()
    players, values, starters = _context()
    if team not in players:
        raise HTTPException(404, f"Unknown team '{abbr}'")
    out = []
    for p in players[team]:
        if p["position"] not in TRADABLE or p["status"] == "INA":
            continue
        if p["position"] == "QB":
            name, adj = starters[team]
            if p["name"] != name:
                continue  # only the starter has a measured rating
            out.append(TradeCandidate(id=p["id"], name=p["name"], position="QB", headshot=p["headshot"], jersey=p["jersey"],
                                      value=round(adj - (-30.0), 1), note="Starting QB, rated by EPA per dropback"))
        else:
            v = values.get(p["id"])
            if v is None or v < 1.0:
                continue
            out.append(TradeCandidate(id=p["id"], name=p["name"], position=p["position"], headshot=p["headshot"], jersey=p["jersey"],
                                      value=round(v, 1), note="Estimated from per-game production vs. his position"))
    return sorted(out, key=lambda c: -c.value)


def trade_adjustments(trades: list[Trade]) -> tuple[dict[str, float], list[TradeEffect]]:
    """Elo adjustments per team for a list of trades, applied in order, plus a description of each trade's effect."""
    players, values, starters = _context()
    adj: dict[str, float] = {}
    starter_adj = {t: s[1] for t, s in starters.items()}
    moved: dict[str, str] = {}   # player id -> the team he is on now
    effects: list[TradeEffect] = []
    for tr in trades:
        for t in (tr.from_team, tr.to_team):
            if t not in TEAMS:
                raise HTTPException(422, f"Unknown team '{t}'")
        if tr.from_team == tr.to_team:
            raise HTTPException(422, "A trade needs two different teams")
        p = _find(players, moved.get(tr.player_id, tr.from_team), tr.player_id) or _find(players, tr.from_team, tr.player_id)
        if p is None or p["position"] not in TRADABLE:
            raise HTTPException(422, f"Player '{tr.player_id}' can't be traded from {tr.from_team}")
        if p["position"] == "QB":
            name, _ = starters[tr.from_team]
            if p["name"] != name:
                raise HTTPException(422, f"{p['name']} isn't {tr.from_team}'s starter, so there is no rating for him")
            q = {"adj": starter_adj[tr.from_team], "to_starter_adj": starter_adj[tr.to_team]}
            lose, gain = trade_effect(p, 0.0, 0.0, q)
            if gain > 0:
                starter_adj[tr.to_team] = q["adj"]
            starter_adj[tr.from_team] = -30.0
        else:
            best = max((values.get(x["id"], 0.0) for x in players[tr.to_team] if x["position"] == p["position"]), default=0.0)
            lose, gain = trade_effect(p, values.get(p["id"], 0.0), best)
        adj[tr.from_team] = adj.get(tr.from_team, 0.0) + lose
        adj[tr.to_team] = adj.get(tr.to_team, 0.0) + gain
        moved[tr.player_id] = tr.to_team
        effects.append(TradeEffect(player_id=p["id"], name=p["name"], position=p["position"], from_team=tr.from_team, to_team=tr.to_team,
                                   from_delta=round(lose, 1), to_delta=round(gain, 1)))
    return adj, effects
