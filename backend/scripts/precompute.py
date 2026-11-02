"""Precompute the default simulation and cache it as JSON in backend/data/.

The API serves these files directly; only /api/whatif runs live simulations.
Re-run whenever new games have been played:

    cd backend && .venv/bin/python -m scripts.precompute [--sims 20000]

Writes season.json, teams.json (one TeamDetail per team), bracket.json, rosters.json (players, stats and
projections), and sim_state.json (ratings + schedule, so the live endpoints need no data download).
(backtest.json comes from scripts.run_backtest.)
"""
import argparse
import json
from datetime import datetime, timezone

import polars as pl

from app.schemas import (BacktestResponse, BracketConference, BracketResponse, GameView,
                         Record, SeasonResponse, SeedProb, SeedSlot, SimState, StateGame,
                         TeamAdvancement, TeamDetail, TeamOdds)
from datetime import date

from app.schemas import AwardRow, LeaderRow, LeadersResponse, RosterPlayer, TeamRoster
from engine.data import DATA_DIR, load_games, load_player_totals, load_qb_game_epa, load_roster, load_snap_games
from engine.awards import AWARDS, LEADER_CATEGORIES, simulate_awards
from engine.players import POSITION_STATS, apply_depth_chart, build_player
from engine.elo import EloConfig, game_probability, walk_games
from engine.qb import QbConfig, QbTracker, projected_starters, stats_by_game
from engine.simulate import simulate_league
from engine.teams import CONFERENCE_OF, DIVISION_OF, TEAM_NAMES, TEAMS

FIRST_SEASON = 2010


def live_settings() -> tuple[EloConfig, QbConfig | None]:
    """The model settings the backtest chose (backtest.json); defaults if it hasn't been run."""
    path = DATA_DIR / "backtest.json"
    if path.exists():
        live = BacktestResponse.model_validate_json(path.read_text()).live
        if live:
            return (EloConfig(k=live.k, home_field=live.home_field, season_regression=live.season_regression),
                    QbConfig(**live.qb) if live.qb else None)
    return EloConfig(), None


def build_all(season: int, n_sims: int, seed: int = 42, refresh: bool = False, award_sims: int = 500):
    """Run the simulation and build every cached response. Returns a dict of pydantic models."""
    cfg, qb_cfg = live_settings()
    seasons = list(range(FIRST_SEASON, season + 1))
    df = load_games(seasons, refresh=refresh)
    schedule = df.filter((pl.col("season") == season) & (pl.col("game_type") == "REG")).to_dicts()

    # Plain team Elo (learned with each game's quarterbacks accounted for), then add the adjustment for
    # each team's projected starting QB. Everything downstream (sims, what-if) just sees one rating per team.
    tracker = QbTracker(stats_by_game(load_qb_game_epa(seasons, refresh=refresh).to_dicts()), qb_cfg) if qb_cfg else None
    team_elo: dict[str, float] = {}
    for _ in walk_games(df.filter(pl.col("result").is_not_null()).to_dicts(), cfg, team_elo, qb=tracker):
        pass
    starters = projected_starters(schedule) if tracker else {}
    qb_adj = {t: tracker.adjustment(t, starters[t][0]) if t in starters else 0.0 for t in TEAMS} if tracker else dict.fromkeys(TEAMS, 0.0)
    ratings = {t: team_elo[t] + qb_adj[t] for t in TEAMS}
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
            p_top_seed=r["p_top_seed"], p_conference=r["p_conference"], p_super_bowl=r["p_super_bowl"],
            qb=starters[t][1] if t in starters else None, qb_adj=round(qb_adj[t], 1))

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
    rosters = build_rosters(season, schedule, refresh)
    return {"season": season_resp, "teams": teams, "bracket": bracket, "state": state, "rosters": rosters,
            "leaders": build_leaders(rosters, schedule, ratings, cfg, award_sims)}


def build_rosters(season: int, schedule: list[dict], refresh: bool = False) -> dict[str, TeamRoster]:
    """Every team's players with current stats, per-game rates and projections (engine.players)."""
    roster = load_roster(season, refresh).filter(pl.col("status").is_in(["ACT", "INA", "RES"]) & pl.col("position").is_in(list(POSITION_STATS)))
    totals = {(r["player_id"], r["season"]): r for r in load_player_totals([season - 1, season], refresh).to_dicts()}
    snaps = {s: {r["pfr_id"]: r["games"] for r in load_snap_games(s, refresh and s == season).to_dicts()} for s in (season - 1, season)}

    played = {t: 0 for t in TEAMS}
    remaining = {t: 0 for t in TEAMS}
    for g in schedule:
        for t in (g["home_team"], g["away_team"]):
            played[t] += g["result"] is not None
            remaining[t] += g["result"] is None
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    today = date.today()

    starters = projected_starters(schedule)
    out: dict[str, TeamRoster] = {}
    for t in TEAMS:
        built = []
        for r in roster.filter(pl.col("team") == t).to_dicts():
            pid, pfr = r["gsis_id"], r["pfr_id"]
            cur, prev = totals.get((pid, season)), totals.get((pid, season - 1))
            cur_games = max(snaps[season].get(pfr, 0), int(cur["weeks"]) if cur else 0)
            prev_games = max(snaps[season - 1].get(pfr, 0), int(prev["weeks"]) if prev else 0)
            roster_row = {"id": pid, "name": r["full_name"], "position": r["position"], "status": r["status"]}
            built.append((r, build_player(roster_row, cur, prev, cur_games, prev_games, played[t], remaining[t])))
        # Only one quarterback (kicker, punter) plays at a time: share the games rather than give each his own.
        apply_depth_chart([p for _, p in built], remaining[t], {"QB": starters[t][0]} if t in starters else {})
        players = []
        for r, p in built:
            born = r["birth_date"]
            players.append(RosterPlayer(
                id=r["gsis_id"], name=r["full_name"], position=r["position"], jersey=r["jersey_number"], status=r["status"],
                headshot=r["headshot_url"], years_exp=r["years_exp"],
                age=None if born is None else today.year - born.year - ((today.month, today.day) < (born.month, born.day)),
                gp=p["gp"], proj_gp=round(p["proj_gp"], 2), avail=round(p["avail"], 3), avail_full=round(p["avail_full"], 3),
                stats={k: round(v, 1) for k, v in p["stats"].items()}, proj={k: round(v, 1) for k, v in p["proj"].items()},
                rates={k: round(v, 4) for k, v in p["rates"].items()}))
        out[t] = TeamRoster(team=t, season=season, generated_at=now, team_games_played=played[t], games_remaining=remaining[t],
                            columns=POSITION_STATS, players=players)
    return out


def build_leaders(rosters: dict[str, TeamRoster], schedule: list[dict], ratings: dict, cfg: EloConfig, n_sims: int,
                  top_leaders: int = 10, top_awards: int = 6) -> LeadersResponse:
    """League stat leaders (by projected total) and the most likely award winners, via engine.awards."""
    players = [{**p.model_dump(), "team": t} for t, r in rosters.items() for p in r.players]
    by_id = {p["id"]: p for p in players}
    mc = simulate_awards(players, schedule, ratings, cfg, n_sims)

    leaders = {}
    for cat, key in LEADER_CATEGORIES.items():
        pool = sorted((p for p in players if key in p["stats"]), key=lambda p: -p["proj"][key])[:top_leaders]
        leaders[cat] = [LeaderRow(id=p["id"], name=p["name"], team=p["team"], position=p["position"], headshot=p["headshot"],
                                  current=p["stats"][key], projected=p["proj"][key], p_lead=mc["leaders"][cat].get(p["id"], 0.0))
                        for p in pool]
    awards = {}
    for a in AWARDS:
        ranked = sorted(mc["awards"][a].items(), key=lambda kv: -kv[1])[:top_awards]
        awards[a] = [AwardRow(id=pid, name=by_id[pid]["name"], team=by_id[pid]["team"], position=by_id[pid]["position"],
                              headshot=by_id[pid]["headshot"], rookie=by_id[pid]["years_exp"] == 0, prob=prob,
                              proj=by_id[pid]["proj"]) for pid, prob in ranked]
    return LeadersResponse(season=next(iter(rosters.values())).season, n_sims=n_sims,
                           generated_at=datetime.now(timezone.utc).isoformat(timespec="seconds"), leaders=leaders, awards=awards)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--season", type=int, default=2026)
    ap.add_argument("--sims", type=int, default=20_000)
    ap.add_argument("--award-sims", type=int, default=500, help="simulated seasons for award odds")
    ap.add_argument("--refresh", action="store_true", help="re-download game data first")
    args = ap.parse_args()

    out = build_all(args.season, args.sims, refresh=args.refresh, award_sims=args.award_sims)
    DATA_DIR.mkdir(exist_ok=True)
    (DATA_DIR / "season.json").write_text(out["season"].model_dump_json(indent=1))
    (DATA_DIR / "teams.json").write_text(json.dumps({t: json.loads(d.model_dump_json()) for t, d in out["teams"].items()}))
    (DATA_DIR / "bracket.json").write_text(out["bracket"].model_dump_json(indent=1))
    (DATA_DIR / "sim_state.json").write_text(out["state"].model_dump_json())
    (DATA_DIR / "leaders.json").write_text(out["leaders"].model_dump_json(indent=1))
    (DATA_DIR / "rosters.json").write_text(json.dumps({t: json.loads(r.model_dump_json()) for t, r in out["rosters"].items()}))

    bt = DATA_DIR / "backtest.json"
    if bt.exists():
        BacktestResponse.model_validate_json(bt.read_text())  # fail loudly if the shape drifts
    s = out["season"]
    print(f"Wrote season.json, teams.json, bracket.json, sim_state.json, rosters.json, leaders.json to {DATA_DIR}")
    print(f"{s.season}: {s.games_played}/{s.games_total} games played, {s.n_sims:,} sims")
    for o in s.teams[:5]:
        print(f"  {o.team:<4}{o.name:<24}Super Bowl {o.p_super_bowl:.1%}")


if __name__ == "__main__":
    main()
