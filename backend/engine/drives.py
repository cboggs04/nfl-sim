"""Turn nflverse play-by-play into the list of drives in each game, for the team-page replays.

Pure data work: it takes a polars DataFrame of plays and returns plain dicts. Each drive becomes one event:
    {"side": "home" | "away", "kind": ..., "pts": int, "q": quarter (5 = overtime), "how": optional detail}
`side` is the team the event belongs to: the team with the ball for most drives, but the team that scored for
a defensive touchdown or a safety. Kinds: TD, FG, MISSED_FG, PUNT, INT, FUMBLE, DOWNS, SAFETY.
A game is only returned if its events add up to the real final score, so a replay can never show the wrong result.
"""
import polars as pl

_BY_RESULT = {
    "Touchdown": "TD",
    "Field goal": "FG",
    "Missed field goal": "MISSED_FG",
    "Punt": "PUNT",
    "Turnover on downs": "DOWNS",
    "Safety": "SAFETY",
}


def _points(play: dict) -> tuple[str | None, int]:
    """(scoring team, points) for one play, 0 if it didn't score."""
    if play.get("touchdown") == 1 and play.get("td_team"):
        return play["td_team"], 6
    if play.get("field_goal_result") == "made":
        return play["posteam"], 3
    if play.get("extra_point_result") == "good":
        return play["posteam"], 1
    if play.get("two_point_conv_result") == "success":
        return play["posteam"], 2
    if play.get("safety") == 1:
        return play["defteam"], 2
    return None, 0


def _kind(result: str | None, transition: str | None) -> str | None:
    if result == "Turnover":
        return "INT" if transition == "INTERCEPTION" else "FUMBLE"
    if result == "Opp touchdown":
        return "TD"
    return _BY_RESULT.get(result or "")


def game_drives(plays: list[dict], home: str, away: str, home_score: int, away_score: int) -> list[dict] | None:
    """Drives of one game in order, or None if they don't add up to the final score. `plays` must be in play order."""
    groups: list[list[dict]] = []
    seen = None
    for p in plays:
        if p.get("fixed_drive") is None:
            continue
        if p["fixed_drive"] != seen:
            groups.append([])
            seen = p["fixed_drive"]
        groups[-1].append(p)

    events: list[dict] = []
    totals = {home: 0, away: 0}
    for grp in groups:
        scored: dict[str, int] = {}
        for p in grp:
            team, pts = _points(p)
            if team in totals:
                scored[team] = scored.get(team, 0) + pts
        first = grp[0]
        result = first.get("fixed_drive_result")
        transition = next((p.get("drive_end_transition") for p in grp if p.get("drive_end_transition")), None)
        kind = _kind(result, transition)
        poss = next((p["posteam"] for p in grp if p.get("posteam")), None)  # (the opening "GAME" row has none)
        q = int(grp[0].get("qtr") or 1)
        if scored and (kind in (None, "TD") or poss not in scored or poss is None):
            # A score: the team that scored owns the event (a pick six belongs to the defense).
            team = max(scored, key=scored.get)
            how = None
            if team != poss:
                how = {"INTERCEPTION": "pick", "FUMBLE": "fumble"}.get(transition or "", "return")
            ev_kind = "SAFETY" if result == "Safety" or transition == "SAFETY" else "TD"
            if ev_kind == "TD" and scored[team] < 6:
                ev_kind = "SAFETY" if scored[team] == 2 else ev_kind
            events.append({"side": "home" if team == home else "away", "kind": ev_kind, "pts": scored[team], "q": q, **({"how": how} if how else {})})
            totals[team] += scored[team]
            for other, pts in scored.items():  # e.g. a defensive two-point return: points to the other team
                if other != team:
                    totals[other] += pts
            continue
        if kind is None or poss not in totals:
            continue  # end of half or game: nothing to show
        pts = scored.get(poss, 0)
        totals[poss] += pts
        events.append({"side": "home" if poss == home else "away", "kind": kind, "pts": pts, "q": q})
    if totals[home] != home_score or totals[away] != away_score:
        return None
    return events


def drives_by_game(pbp: pl.DataFrame, games: list[dict]) -> dict[str, list[dict]]:
    """`games`: dicts with game_id, home_team, away_team, home_score, away_score (played games only)."""
    cols = [c for c in ("game_id", "play_id", "fixed_drive", "fixed_drive_result", "drive_end_transition", "posteam", "defteam", "qtr",
                        "touchdown", "td_team", "field_goal_result", "extra_point_result", "two_point_conv_result", "safety") if c in pbp.columns]
    by_game = {k[0] if isinstance(k, tuple) else k: v for k, v in pbp.select(cols).sort("game_id", "play_id").partition_by("game_id", as_dict=True).items()}
    out = {}
    for g in games:
        df = by_game.get(g["game_id"])
        if df is None:
            continue
        events = game_drives(df.to_dicts(), g["home_team"], g["away_team"], int(g["home_score"]), int(g["away_score"]))
        if events:
            out[g["game_id"]] = events
    return out
