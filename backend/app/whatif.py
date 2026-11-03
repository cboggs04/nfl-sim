"""POST /api/whatif: change team ratings or force game results, then re-run a small live simulation."""
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException

from engine.simulate import simulate_league
from engine.teams import CONFERENCE_OF, DIVISION_OF, TEAM_NAMES, TEAMS

from .schemas import Record, SeasonResponse, TeamOdds, WhatIfRequest
from .sim import _state
from .trade import trade_adjustments

router = APIRouter(prefix="/api")

MAX_ADJUSTMENT = 400  # Elo points; anything bigger is not a realistic roster change


@router.post("/whatif", response_model=SeasonResponse)
def whatif(req: WhatIfRequest):
    state, cfg, schedule = _state()

    for team, delta in req.rating_adjustments.items():
        if team not in TEAMS:
            raise HTTPException(422, f"Unknown team '{team}'")
        if abs(delta) > MAX_ADJUSTMENT:
            raise HTTPException(422, f"Rating adjustment for {team} must be within ±{MAX_ADJUSTMENT}")
    trade_adj, trade_effects = trade_adjustments(req.trades)
    ratings = {t: r + req.rating_adjustments.get(t, 0.0) + trade_adj.get(t, 0.0) for t, r in state.ratings.items()}

    by_id = {g["game_id"]: g for g in schedule}
    games = [dict(g) for g in schedule]
    index = {g["game_id"]: i for i, g in enumerate(games)}
    for o in req.game_overrides:
        g = by_id.get(o.game_id)
        if g is None:
            raise HTTPException(422, f"Unknown game '{o.game_id}'")
        if g["result"] is not None:
            raise HTTPException(422, f"Game '{o.game_id}' has already been played")
        games[index[o.game_id]]["result"] = 1 if o.home_win else -1  # a forced result: any nonzero margin locks it in

    league = simulate_league(games, ratings, req.n_sims, cfg)

    records = {t: Record(wins=0, losses=0, ties=0) for t in TEAMS}
    for g in schedule:  # real results only; forced ones are hypothetical
        if g["result"] is None:
            continue
        h, a = g["home_team"], g["away_team"]
        if g["result"] > 0:
            records[h].wins += 1
            records[a].losses += 1
        elif g["result"] < 0:
            records[a].wins += 1
            records[h].losses += 1
        else:
            records[h].ties += 1
            records[a].ties += 1

    teams = [
        TeamOdds(team=t, name=TEAM_NAMES[t], conference=CONFERENCE_OF[t], division=DIVISION_OF[t],
                 elo=ratings[t], record=records[t], exp_wins=r["exp_wins"], win_dist=list(r["win_dist"]),
                 p_division=r["p_division"], p_playoffs=r["p_playoffs"], p_top_seed=r["p_top_seed"],
                 p_conference=r["p_conference"], p_super_bowl=r["p_super_bowl"])
        for t, r in sorted(league.items(), key=lambda kv: -kv[1]["p_super_bowl"])
    ]
    return SeasonResponse(
        season=state.season, n_sims=req.n_sims,
        generated_at=datetime.now(timezone.utc).isoformat(timespec="seconds"),
        games_played=sum(g["result"] is not None for g in schedule), games_total=len(schedule),
        teams=teams, trade_effects=trade_effects, trade_deltas={t: round(d, 1) for t, d in trade_adj.items()},
    )
