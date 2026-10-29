"""Precompute the default simulation and cache it as JSON in backend/data/.

The API serves these files directly; only /api/whatif runs live simulations.
Re-run whenever new games have been played:

    cd backend && .venv/bin/python -m scripts.precompute [--sims 20000]

Writes season.json, teams.json (one TeamDetail per team), bracket.json, and
sim_state.json (ratings + schedule, so the live endpoints need no data download).
(backtest.json comes from scripts.run_backtest.)
"""
import argparse
import json
from datetime import datetime, timezone

import polars as pl

from app.schemas import (BacktestResponse, BracketConference, BracketResponse, GameView,
                         Record, SeasonResponse, SeedProb, SeedSlot, SimState, StateGame,
                         TeamAdvancement, TeamDetail, TeamOdds)
from engine.data import DATA_DIR, load_games
from engine.elo import EloConfig, compute_ratings, game_probability
from engine.simulate import simulate_league
from engine.teams import CONFERENCE_OF, DIVISION_OF, TEAM_NAMES, TEAMS

FIRST_SEASON = 2010


def build_all(season: int, n_sims: int, seed: int = 42, refresh: bool = False):
    """Run the simulation and build every cached response. Returns a dict of pydantic models."""
    cfg = EloConfig()
    df = load_games(list(range(FIRST_SEASON, season + 1)), refresh=refresh)
    ratings = compute_ratings(df.filter(pl.col("result").is_not_null()).to_dicts(), cfg)
    schedule = df.filter((pl.col("season") == season) & (pl.col("game_type") == "REG")).to_dicts()
    league = simulate_league(schedule, ratings, n_sims, cfg, seed)

    records = {t: Record(wins=0, losses=0, ties=0) for t in TEAMS}
    for g in schedule:
        if g["result"] is None:
            continue
        h, a, r = g["home_team"], g["away_team"], g["result"]
        for t, won, lost in ((h, r > 0, r < 0), (a, r < 0, r > 0)):
            records[t].wins += won
            records[t].losses += lost
            records[t].ties += not (won or lost)
    played = sum(g["result"] is not None for g in schedule)

    odds = {}
    for t in TEAMS:
        r = league[t]
        odds[t] = TeamOdds(
            team=t, name=TEAM_NAMES[t], conference=CONFERENCE_OF[t], division=DIVISION_OF[t],
            elo=round(ratings[t], 1), record=records[t], exp_wins=r["exp_wins"],
            win_dist=list(r["win_dist"]), p_division=r["p_division"], p_playoffs=r["p_playoffs"],
            p_top_seed=r["p_top_seed"], p_conference=r["p_conference"], p_super_bowl=r["p_super_bowl"])

    season_resp = SeasonResponse(
        season=season, n_sims=n_sims, generated_at=datetime.now(timezone.utc).isoformat(timespec="seconds"),
        games_played=played, games_total=len(schedule),
        teams=sorted(odds.values(), key=lambda o: -o.p_super_bowl))

    teams = {}
    for t in TEAMS:
        games = []
        for g in sorted((g for g in schedule if t in (g["home_team"], g["away_team"])), key=lambda g: g["week"]):
            home = g["home_team"] == t
            is_played = g["result"] is not None
            p_win = None if is_played else (lambda p: p if home else 1 - p)(game_probability(g, ratings, cfg))
            margin = None if not is_played else (g["result"] if home else -g["result"])
            games.append(GameView(
                game_id=g["game_id"], week=g["week"], opponent=g["away_team"] if home else g["home_team"],
                home=home, neutral=g["neutral"], played=is_played, p_win=p_win,
                result=None if margin is None else "W" if margin > 0 else "L" if margin < 0 else "T",
                team_score=int(g["home_score"] if home else g["away_score"]) if is_played else None,
                opp_score=int(g["away_score"] if home else g["home_score"]) if is_played else None))
        r = league[t]
        teams[t] = TeamDetail(season=season, odds=odds[t], seed_dist=r["seed_dist"],
                              p_divisional_round=r["p_divisional_round"],
                              p_conference_round=r["p_conference_round"], games=games)

    conferences = []
    for conf in ("AFC", "NFC"):
        slots = []
        for s in range(7):
            probs = sorted(((t, league[t]["seed_dist"][s]) for t in TEAMS if CONFERENCE_OF[t] == conf),
                           key=lambda x: -x[1])
            slots.append(SeedSlot(seed=s + 1, teams=[SeedProb(team=t, prob=p) for t, p in probs if p >= 0.01]))
        conferences.append(BracketConference(conference=conf, slots=slots))
    advancement = [TeamAdvancement(
        team=t, conference=CONFERENCE_OF[t], p_playoffs=league[t]["p_playoffs"],
        p_divisional_round=league[t]["p_divisional_round"], p_conference_round=league[t]["p_conference_round"],
        p_super_bowl_round=league[t]["p_conference"], p_champion=league[t]["p_super_bowl"])
        for t in sorted(TEAMS, key=lambda t: -league[t]["p_super_bowl"])]
    bracket = BracketResponse(season=season, n_sims=n_sims, conferences=conferences, advancement=advancement)
    state = SimState(
        season=season,
        config={"k": cfg.k, "home_field": cfg.home_field, "season_regression": cfg.season_regression},
        ratings={t: round(r, 3) for t, r in ratings.items()},
        games=[StateGame(game_id=g["game_id"], week=g["week"], home_team=g["home_team"],
                         away_team=g["away_team"], neutral=g["neutral"],
                         result=None if g["result"] is None else int(g["result"])) for g in schedule])
    return {"season": season_resp, "teams": teams, "bracket": bracket, "state": state}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--season", type=int, default=2026)
    ap.add_argument("--sims", type=int, default=20_000)
    ap.add_argument("--refresh", action="store_true", help="re-download game data first")
    args = ap.parse_args()

    out = build_all(args.season, args.sims, refresh=args.refresh)
    DATA_DIR.mkdir(exist_ok=True)
    (DATA_DIR / "season.json").write_text(out["season"].model_dump_json(indent=1))
    (DATA_DIR / "teams.json").write_text(json.dumps({t: json.loads(d.model_dump_json()) for t, d in out["teams"].items()}))
    (DATA_DIR / "bracket.json").write_text(out["bracket"].model_dump_json(indent=1))
    (DATA_DIR / "sim_state.json").write_text(out["state"].model_dump_json())

    bt = DATA_DIR / "backtest.json"
    if bt.exists():
        BacktestResponse.model_validate_json(bt.read_text())  # fail loudly if the shape drifts
    s = out["season"]
    print(f"Wrote season.json, teams.json, bracket.json, sim_state.json to {DATA_DIR}")
    print(f"{s.season}: {s.games_played}/{s.games_total} games played, {s.n_sims:,} sims")
    for o in s.teams[:5]:
        print(f"  {o.team:<4}{o.name:<24}Super Bowl {o.p_super_bowl:.1%}")


if __name__ == "__main__":
    main()
