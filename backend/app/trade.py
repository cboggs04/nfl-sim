"""Trades: which players can be moved, and what a swap does to the teams' ratings (engine.trade)."""
from functools import lru_cache

from fastapi import APIRouter, HTTPException

from engine.teams import TEAMS
from engine.trade import BACKUP_QB_ADJ, TRADABLE, player_effect, qb_team_delta

from .datafiles import file_stamp
from .rosters import load_rosters
from .schemas import Trade, TradeCandidate, TradeEffect

router = APIRouter(prefix="/api")


@lru_cache
def _players_cached(stamp: tuple) -> dict[str, list[dict]]:
    return {t: [p.model_dump() for p in r.players] for t, r in load_rosters().items()}


def _players() -> dict[str, list[dict]]:
    return _players_cached(file_stamp("rosters.json"))


def _adj(p: dict) -> float:
    """A quarterback's Elo adjustment (his value over a backup, plus the backup's)."""
    return (p["elo_value"] or 0.0) + BACKUP_QB_ADJ


@router.get("/trade/{abbr}/players", response_model=list[TradeCandidate])
def trade_candidates(abbr: str):
    """The team's players who can be traded, best first, with each one's estimated Elo value and EPA."""
    team = abbr.upper()
    players = _players()
    if team not in players:
        raise HTTPException(404, f"Unknown team '{abbr}'")
    out = []
    for p in players[team]:
        v = p["elo_value"]
        if p["position"] not in TRADABLE or p["status"] == "INA" or v is None:
            continue
        if p["position"] != "QB" and v < 1.0:
            continue
        note = ("Rated by EPA per dropback" if p["position"] == "QB" else "Rated from his EPA per game (this season and last)"
                if p["position"] in ("RB", "WR", "TE") else "Estimated from per-game production vs. his position")
        out.append(TradeCandidate(id=p["id"], name=p["name"], position=p["position"], headshot=p["headshot"], jersey=p["jersey"],
                                  value=round(v, 1), epa=p["epa"], epa_per_game=p["epa_per_game"], note=note))
    return sorted(out, key=lambda c: -c.value)


def trade_adjustments(trades: list[Trade]) -> tuple[dict[str, float], list[TradeEffect]]:
    """Elo change per team for a set of trades, plus a description of each player moved.

    Every team in a trade must send at least one player and get at least one back."""
    if not trades:
        return {}, []
    players = _players()
    sent: dict[str, int] = {}
    got: dict[str, int] = {}
    adj: dict[str, float] = {}
    effects: list[TradeEffect] = []
    leaving: dict[str, list[float]] = {}
    arriving: dict[str, list[float]] = {}
    gone: dict[str, set[str]] = {}  # team -> ids of players it is giving up
    seen: set[str] = set()
    plan = []
    for tr in trades:
        for t in (tr.from_team, tr.to_team):
            if t not in TEAMS:
                raise HTTPException(422, f"Unknown team '{t}'")
        if tr.from_team == tr.to_team:
            raise HTTPException(422, "A trade needs two different teams")
        p = next((x for x in players[tr.from_team] if x["id"] == tr.player_id), None)
        if p is None or p["position"] not in TRADABLE or p["elo_value"] is None:
            raise HTTPException(422, f"Player '{tr.player_id}' can't be traded from {tr.from_team}")
        if tr.player_id in seen:
            raise HTTPException(422, f"{p['name']} is in more than one trade")
        seen.add(tr.player_id)
        sent[tr.from_team] = sent.get(tr.from_team, 0) + 1
        got[tr.to_team] = got.get(tr.to_team, 0) + 1
        gone.setdefault(tr.from_team, set()).add(p["id"])
        plan.append((tr, p))
    for t in set(sent) | set(got):
        if sent.get(t, 0) == 0 or got.get(t, 0) == 0:
            raise HTTPException(422, f"{t} has to send a player and get one back")

    for tr, p in plan:
        effects.append(TradeEffect(player_id=p["id"], name=p["name"], position=p["position"], from_team=tr.from_team, to_team=tr.to_team,
                                   value=round(p["elo_value"], 1)))
        if p["position"] == "QB":
            leaving.setdefault(tr.from_team, []).append(_adj(p))
            arriving.setdefault(tr.to_team, []).append(_adj(p))
            continue
        best = max((x["elo_value"] or 0.0 for x in players[tr.to_team] if x["position"] == p["position"] and x["id"] not in gone.get(tr.to_team, ())), default=0.0)
        lose, gain = player_effect(p["position"], p["elo_value"], p["avail_full"], best)
        adj[tr.from_team] = adj.get(tr.from_team, 0.0) + lose
        adj[tr.to_team] = adj.get(tr.to_team, 0.0) + gain
    for t in set(leaving) | set(arriving):
        before = [_adj(x) for x in players[t] if x["position"] == "QB" and x["elo_value"] is not None]
        adj[t] = adj.get(t, 0.0) + qb_team_delta(before, leaving.get(t, []), arriving.get(t, []))
    return adj, effects
