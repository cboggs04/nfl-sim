"""One game's details for the expanded game on the scores page: line score, team stats, player box score, scoring
plays, and the model's win probability through the game. Parsed from ESPN's game summary feed (same unofficial
source as engine/live.py; every field read defensively). Pure Python, no web code.

The win-probability timeline is OUR model (engine/live.live_win_prob from the pregame odds and the score), not
ESPN's: it is worked out every 30 game seconds from the scoring plays, so it ignores possession between scores.
"""
from __future__ import annotations

from .live import GAME_SECONDS, _int, _venue, live_win_prob, team_abbr

# Team stats shown (ESPN label -> our label), in this order.
TEAM_STATS = [
    ("Total Yards", "Total yards"), ("Passing", "Passing yards"), ("Rushing", "Rushing yards"),
    ("1st Downs", "First downs"), ("3rd down efficiency", "3rd down"), ("4th down efficiency", "4th down"),
    ("Red Zone (Made-Att)", "Red zone"), ("Comp/Att", "Comp/Att"), ("Yards per Play", "Yards per play"),
    ("Sacks-Yards Lost", "Sacks-yards"), ("Turnovers", "Turnovers"), ("Penalties", "Penalties-yards"),
    ("Possession", "Possession"),
]
# Box score categories shown, in order, with our titles.
BOX_CATEGORIES = [("passing", "Passing"), ("rushing", "Rushing"), ("receiving", "Receiving"), ("defensive", "Defense"),
                  ("interceptions", "Interceptions"), ("kicking", "Kicking"), ("punting", "Punting"),
                  ("kickReturns", "Kick returns"), ("puntReturns", "Punt returns")]


def _abbr_by_id(summary: dict) -> dict[str, str]:
    out = {}
    for c in ((summary.get("header") or {}).get("competitions") or [{}])[0].get("competitors") or []:
        t = c.get("team") or {}
        out[str(t.get("id"))] = team_abbr(t.get("abbreviation", ""))
    return out


def game_seconds_elapsed(period: int, clock_seconds: float) -> float:
    if period <= 0:
        return 0.0
    if period > 4:
        return GAME_SECONDS + (period - 5) * 600 + (600 - min(max(clock_seconds, 0), 600))
    return (period - 1) * 900 + (900 - min(max(clock_seconds, 0), 900))


def win_prob_series(p_home_pre: float, scoring: list[dict], state: str, period: int, clock_seconds: float,
                    final_home: int, final_away: int, step: int = 30) -> list[dict]:
    """Model P(home wins) every `step` game seconds up to now (or the end), from the score at each moment."""
    if state == "pre":
        return []
    end = game_seconds_elapsed(period, clock_seconds) if state == "in" else max(
        GAME_SECONDS, max((game_seconds_elapsed(s["period"], s["clock_seconds"]) for s in scoring), default=0))
    events = sorted(((game_seconds_elapsed(s["period"], s["clock_seconds"]), s["home_score"], s["away_score"]) for s in scoring))
    out, i, hs, as_ = [], 0, 0, 0
    t = 0.0
    while True:
        while i < len(events) and events[i][0] <= t:
            hs, as_ = events[i][1], events[i][2]
            i += 1
        if t >= end:
            break
        per, clk = _period_clock(t)
        out.append({"t": round(t / 60, 2), "p": round(live_win_prob(p_home_pre, hs, as_, per, clk), 4),
                    "home": hs, "away": as_})
        t += step
    if state == "post":
        out.append({"t": round(end / 60, 2), "p": live_win_prob(p_home_pre, final_home, final_away, 4, 0, final=True),
                    "home": final_home, "away": final_away})
    else:
        per, clk = _period_clock(end)
        out.append({"t": round(end / 60, 2), "p": round(live_win_prob(p_home_pre, hs, as_, per, clk), 4), "home": hs, "away": as_})
    return out


def _period_clock(t: float) -> tuple[int, float]:
    if t >= GAME_SECONDS:
        return 5, max(0.0, 600 - (t - GAME_SECONDS))
    per = int(t // 900) + 1
    return per, 900 - (t - (per - 1) * 900)


def parse_summary(summary: dict, home: str, away: str, p_home_pre: float) -> dict:
    """Everything the expanded game shows. `home`/`away`: our abbreviations (to orient ESPN's lists)."""
    ids = _abbr_by_id(summary)
    comp = ((summary.get("header") or {}).get("competitions") or [{}])[0]
    status = comp.get("status") or {}
    stype = status.get("type") or {}
    state = stype.get("state") if stype.get("state") in ("pre", "in", "post") else "pre"
    period = _int(status.get("period"))
    clock_s = float(status.get("clock") or 0)

    lines, scores = {home: [], away: []}, {home: 0, away: 0}
    for c in comp.get("competitors") or []:
        a = team_abbr((c.get("team") or {}).get("abbreviation", ""))
        if a in lines:
            lines[a] = [_int(x.get("value", x.get("displayValue"))) for x in c.get("linescores") or []]
            scores[a] = _int(c.get("score"))

    # Team stats, side by side.
    by_team: dict[str, dict[str, str]] = {}
    for t in (summary.get("boxscore") or {}).get("teams") or []:
        a = team_abbr((t.get("team") or {}).get("abbreviation", ""))
        by_team[a] = {}
        for st in t.get("statistics") or []:
            by_team[a].setdefault(st.get("label"), st.get("displayValue"))
    team_stats = [{"label": ours, "home": by_team.get(home, {}).get(espn), "away": by_team.get(away, {}).get(espn)}
                  for espn, ours in TEAM_STATS if espn in by_team.get(home, {}) or espn in by_team.get(away, {})]

    # Player box score: per team, per category, a table.
    box: dict[str, list[dict]] = {home: [], away: []}
    for p in (summary.get("boxscore") or {}).get("players") or []:
        a = team_abbr((p.get("team") or {}).get("abbreviation", ""))
        if a not in box:
            continue
        cats = {c.get("name"): c for c in p.get("statistics") or []}
        for name, title in BOX_CATEGORIES:
            c = cats.get(name)
            if not c or not c.get("athletes"):
                continue
            rows = []
            for row in c["athletes"]:
                ath = row.get("athlete") or {}
                head = ath.get("headshot")
                rows.append({"name": ath.get("displayName") or ath.get("shortName") or "", "id": str(ath.get("id", "")),
                             "headshot": head.get("href") if isinstance(head, dict) else head,
                             "stats": [str(x) for x in row.get("stats") or []]})
            totals = [str(x) for x in c.get("totals") or []]
            box[a].append({"key": name, "title": title, "labels": [str(x) for x in c.get("labels") or []],
                           "rows": rows, "totals": totals or None})

    scoring = []
    for sp in summary.get("scoringPlays") or []:
        clock = sp.get("clock") or {}
        scoring.append({"period": _int((sp.get("period") or {}).get("number")), "clock": clock.get("displayValue") or "",
                        "clock_seconds": float(clock.get("value") or 0),
                        "team": ids.get(str((sp.get("team") or {}).get("id"))) or team_abbr((sp.get("team") or {}).get("abbreviation", "")),
                        "type": (sp.get("type") or {}).get("abbreviation") or (sp.get("type") or {}).get("text") or "",
                        "text": sp.get("text") or "", "home_score": _int(sp.get("homeScore")), "away_score": _int(sp.get("awayScore"))})

    info = summary.get("gameInfo") or {}
    weather = info.get("weather") or {}
    names = [n for b in comp.get("broadcasts") or [] for n in ((b.get("media") or {}).get("shortName"),) if n]
    return {
        "state": state, "period": period, "clock": status.get("displayClock") or "",
        "detail": stype.get("shortDetail") or stype.get("detail") or "",
        "home_lines": lines[home], "away_lines": lines[away],
        "home_score": scores[home], "away_score": scores[away],
        "team_stats": team_stats, "home_box": box[home], "away_box": box[away], "scoring": scoring,
        "win_prob": win_prob_series(p_home_pre, scoring, state, period, clock_s, scores[home], scores[away]),
        "venue": _venue(info.get("venue")), "attendance": _int(info.get("attendance")) or None,
        "weather": f"{weather['temperature']}°F, {weather.get('displayValue', '').lower()}".rstrip(", ")
                   if weather.get("temperature") is not None else None,
        "broadcast": " / ".join(names) or None,
    }
