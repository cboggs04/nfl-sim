"""Live scores and in-game win probability. Pure Python (standard library only), no web framework code.

Source: ESPN's public NFL scoreboard feed (free, no key, but unofficial and undocumented, so every field is read
defensively and anything unexpected is skipped instead of failing). nflverse, the model's data source, only
updates after games end, so this is used only to show games while they are being played.

In-game win probability (`live_win_prob`) starts from the model's pregame probability and updates with the
score, the time left and who has the ball:
  - the pregame probability is turned into an expected final margin, assuming final margins are roughly normal
    with a 15-point standard deviation (13.5 is the usual figure for final margins; 15 scored better in-game);
  - the part of that expected margin still to come shrinks with the time left, and so does the uncertainty
    (standard deviation scales with the square root of the time left);
  - the team with the ball gets the expected points of its field position (about 0.4 at its own 20, 2.5 at
    midfield, 4.6 at the opponent's 20), a simple straight-line fit to the usual expected-points curve.
It is a simple, stated model, not fitted on play-by-play like nflverse's own win probability. Checked on every
7th play of 2024-25 (scripts/check_live_wp.py, pregame odds from the closing spread): Brier 0.152 and well
calibrated, against 0.145 for nflverse's fitted, spread-aware vegas_home_wp.
"""
from __future__ import annotations

import json
import math
import random
import time
import urllib.request
from dataclasses import asdict, dataclass, field
from statistics import NormalDist

SCOREBOARD_URL = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard"

MARGIN_SD = 15.0            # spread of outcomes, in points (scripts/check_live_wp.py)
GAME_SECONDS = 3600
OT_SECONDS = 600            # regular-season overtime is one 10-minute period
_N = NormalDist()

# ESPN abbreviations that differ from nflverse's.
ESPN_ALIASES = {"WSH": "WAS", "LAR": "LA", "JAC": "JAX"}


def team_abbr(espn_abbr: str) -> str:
    a = (espn_abbr or "").upper()
    return ESPN_ALIASES.get(a, a)


@dataclass
class LiveGame:
    game_id: str | None           # our game id (nflverse); None if the ESPN game couldn't be matched
    espn_id: str
    home: str
    away: str
    state: str                    # "pre", "in" or "post"
    home_score: int
    away_score: int
    period: int                   # 1-4, 5 = overtime
    clock: str                    # "4:12"
    detail: str                   # "Q3 4:12", "Halftime", "Final/OT", "Sun 1:00 PM"
    possession: str | None        # team abbreviation with the ball
    down_distance: str | None     # "3rd & 4 at KC 35"
    red_zone: bool
    p_home_pre: float | None      # model's pregame P(home wins)
    p_home_live: float | None     # in-game P(home wins); None before kickoff
    home_record: str | None = None    # "8-2" (as of now, from ESPN)
    away_record: str | None = None
    broadcast: str | None = None      # "NBC"
    venue: str | None = None          # "Highmark Stadium, Orchard Park, NY"
    home_lines: list[int] = field(default_factory=list)   # points by quarter (5th = overtime)
    away_lines: list[int] = field(default_factory=list)
    leaders: list[dict] = field(default_factory=list)     # [{category: "PASS", name, team, line, headshot}]

    def to_dict(self) -> dict:
        return asdict(self)


def seconds_left(period: int, clock_seconds: float) -> float:
    """Game seconds remaining in regulation (0 in overtime; see live_win_prob for overtime)."""
    if period > 4:
        return 0.0
    return max(0.0, (4 - period) * 900 + min(max(clock_seconds, 0.0), 900))


def expected_points(yards_to_goal: float) -> float:
    """Rough expected points for having the ball `yards_to_goal` yards from the end zone."""
    return 6.0 - 0.07 * min(max(yards_to_goal, 1.0), 99.0)


def live_win_prob(p_home_pre: float, home_score: int, away_score: int, period: int, clock_seconds: float,
                  possession_home: bool | None = None, yards_to_goal: float | None = None, final: bool = False) -> float:
    """P(home team wins) given the pregame probability and the current game situation."""
    margin = home_score - away_score
    if final:
        return 1.0 if margin > 0 else 0.0 if margin < 0 else 0.5
    p_pre = min(max(p_home_pre, 0.001), 0.999)
    mu = MARGIN_SD * _N.inv_cdf(p_pre)                     # pregame expected home margin
    if period > 4:
        # Overtime: the time left is what's left of the one overtime period (shown on the clock).
        left = min(max(clock_seconds, 0.0), OT_SECONDS)
    else:
        left = seconds_left(period, clock_seconds)
    f = left / GAME_SECONDS
    ep = 0.0
    if possession_home is not None:
        ep = expected_points(yards_to_goal if yards_to_goal is not None else 70.0)
        ep = ep if possession_home else -ep
        ep *= min(1.0, 0.25 + left / 120)                  # with seconds left, a drive may not finish
    expected = margin + mu * f + ep
    sd = MARGIN_SD * math.sqrt(max(f, 1e-6))
    if left <= 0:
        # Clock at 0:00 but not final yet (a last play or a review): the current margin all but decides it.
        return 1.0 if margin > 0 else 0.0 if margin < 0 else 0.5
    # A tie is possible but rare; the continuous model splits it evenly, which is close enough.
    return min(max(_N.cdf(expected / sd), 0.0), 1.0)


def _clock_seconds(text: str) -> float:
    try:
        m, s = text.split(":")
        return int(m) * 60 + float(s)
    except (ValueError, AttributeError):
        return 0.0


def _yards_to_goal(possession_text: str | None, offense: str | None) -> float | None:
    """ESPN's possessionText looks like "KC 35" (ball on KC's 35) or "50". Turn it into yards to the end zone."""
    if not possession_text or not offense:
        return None
    parts = possession_text.split()
    try:
        line = int(parts[-1])
    except (ValueError, IndexError):
        return None
    if len(parts) == 1:
        return float(line)                                 # "50": midfield
    side = team_abbr(parts[0])
    return float(100 - line if side == offense else line)


def parse_scoreboard(data: dict, schedule: list[dict]) -> list[LiveGame]:
    """Turn ESPN's scoreboard JSON into LiveGames matched to our games.

    `schedule`: our games for the season (dicts with game_id, week, home, away, espn_id, p_home). Matched on
    ESPN's event id first, then on the two teams."""
    by_espn = {str(g["espn_id"]): g for g in schedule if g.get("espn_id")}
    by_teams: dict[tuple[str, str], list[dict]] = {}
    for g in schedule:
        by_teams.setdefault((g["home"], g["away"]), []).append(g)
    week = (data.get("week") or {}).get("number")

    out = []
    for ev in data.get("events") or []:
        try:
            comp = ev["competitions"][0]
            teams = {c["homeAway"]: c for c in comp["competitors"]}
            home, away = team_abbr(teams["home"]["team"]["abbreviation"]), team_abbr(teams["away"]["team"]["abbreviation"])
            status = comp.get("status") or ev.get("status") or {}
            stype = status.get("type") or {}
        except (KeyError, IndexError, TypeError):
            continue
        espn_id = str(ev.get("id", ""))
        ours = by_espn.get(espn_id)
        if ours is None:
            candidates = by_teams.get((home, away), [])
            ours = next((g for g in candidates if g["week"] == week), candidates[0] if len(candidates) == 1 else None)

        state = stype.get("state", "pre")
        if state not in ("pre", "in", "post"):
            state = "pre"
        period = int(status.get("period") or 0)
        clock = status.get("displayClock") or "0:00"
        clock_s = float(status.get("clock") if status.get("clock") is not None else _clock_seconds(clock))
        hs, as_ = _int(teams["home"].get("score")), _int(teams["away"].get("score"))

        sit = comp.get("situation") or {}
        ids = {str(c["team"].get("id")): team_abbr(c["team"]["abbreviation"]) for c in comp["competitors"]}
        poss = ids.get(str(sit.get("possession"))) if state == "in" and sit.get("possession") is not None else None
        ytg = _yards_to_goal(sit.get("possessionText"), poss)
        dd = sit.get("downDistanceText") if state == "in" else None

        extras = _extras(comp, teams, ids)
        p_pre = ours["p_home"] if ours else None
        p_live = None
        if state != "pre":
            p_live = live_win_prob(0.5 if p_pre is None else p_pre, hs, as_, period, clock_s,
                                   None if poss is None else poss == home, ytg, final=state == "post")
        out.append(LiveGame(
            game_id=ours["game_id"] if ours else None, espn_id=espn_id, home=home, away=away, state=state,
            home_score=hs, away_score=as_, period=period, clock=clock,
            detail=stype.get("shortDetail") or stype.get("detail") or "", possession=poss, down_distance=dd,
            red_zone=bool(sit.get("isRedZone")) and state == "in", p_home_pre=p_pre,
            p_home_live=None if p_live is None else round(p_live, 4), **extras))
    return out


LEADER_CATEGORIES = {"passingYards": "PASS", "rushingYards": "RUSH", "receivingYards": "REC"}


def _record(c: dict) -> str | None:
    for r in c.get("records") or c.get("record") or []:
        if r.get("type") == "total" or r.get("name") == "overall":
            return r.get("summary") or r.get("displayValue")
    return None


def _lines(c: dict) -> list[int]:
    return [_int(x.get("value", x.get("displayValue"))) for x in c.get("linescores") or []]


def _venue(v: dict | None) -> str | None:
    if not v or not v.get("fullName"):
        return None
    a = v.get("address") or {}
    place = ", ".join(x for x in (a.get("city"), a.get("state")) if x)
    return f"{v['fullName']}, {place}" if place else v["fullName"]


def _extras(comp: dict, teams: dict, ids: dict) -> dict:
    """Records, TV, venue, line scores and game leaders from a scoreboard competition (all optional)."""
    leaders = []
    for cat in comp.get("leaders") or []:
        short = LEADER_CATEGORIES.get(cat.get("name"))
        top = (cat.get("leaders") or [None])[0]
        if not short or not top:
            continue
        ath = top.get("athlete") or {}
        head = ath.get("headshot")
        leaders.append({"category": short, "name": ath.get("shortName") or ath.get("displayName") or "",
                        "team": ids.get(str((top.get("team") or ath.get("team") or {}).get("id"))),
                        "line": top.get("displayValue") or "",
                        "headshot": head.get("href") if isinstance(head, dict) else head})
    names = [n for b in comp.get("broadcasts") or [] for n in b.get("names") or []]
    return {"home_record": _record(teams["home"]), "away_record": _record(teams["away"]),
            "broadcast": " / ".join(names) or None, "venue": _venue(comp.get("venue")),
            "home_lines": _lines(teams["home"]), "away_lines": _lines(teams["away"]), "leaders": leaders}


def _int(v) -> int:
    try:
        return int(v)
    except (TypeError, ValueError):
        return 0


def scoreboard_url(week: int | None = None, season: int | None = None) -> str:
    """The current scoreboard, or a given regular-season week's."""
    if week is None:
        return SCOREBOARD_URL
    return f"{SCOREBOARD_URL}?seasontype=2&week={int(week)}" + (f"&dates={int(season)}" if season else "")


def fetch_scoreboard(url: str = SCOREBOARD_URL, timeout: float = 6.0) -> dict:
    req = urllib.request.Request(url, headers={"User-Agent": "nfl-season-simulator/1.0", "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8"))


def scoreboard_states(data: dict) -> list:
    return [((ev.get("status") or {}).get("type") or {}).get("state") for ev in data.get("events") or []]


def summary_states(data: dict) -> list:
    """A game summary's state, as a one-item list (for LiveCache)."""
    comp = ((data.get("header") or {}).get("competitions") or [{}])[0]
    return [((comp.get("status") or {}).get("type") or {}).get("state")]


class LiveCache:
    """Keeps the last scoreboard so every visitor shares one ESPN request: refreshed at most every `ttl_live`
    seconds while a game is on, every `ttl_idle` seconds otherwise. If ESPN fails, the last good copy is kept."""

    def __init__(self, fetch=fetch_scoreboard, ttl_live: float = 20.0, ttl_idle: float = 120.0, clock=time.time,
                 ttl_done: float | None = None, states=None):
        self.fetch, self.ttl_live, self.ttl_idle, self.clock = fetch, ttl_live, ttl_idle, clock
        self.ttl_done = ttl_idle if ttl_done is None else ttl_done   # when every game is final
        self.states = states or scoreboard_states                     # data -> list of game states
        self.data: dict | None = None
        self.fetched_at = 0.0
        self.error: str | None = None

    def get(self) -> tuple[dict | None, float, str | None]:
        now = self.clock()
        states = self.states(self.data) if self.data else []
        ttl = self.ttl_live if "in" in states else self.ttl_done if states and all(x == "post" for x in states) else self.ttl_idle
        if self.data is None or now - self.fetched_at >= ttl:
            try:
                self.data, self.error = self.fetch(), None
            except Exception as e:  # network error, timeout, bad JSON: keep serving the last good copy
                self.error = f"{type(e).__name__}"
            self.fetched_at = now   # don't hammer ESPN when it's failing either
        return self.data, self.fetched_at, self.error


# --- Demo mode: a made-up live week, so the feature can be shown when no game is on -------------------------

DEMO_CYCLE = 900   # real seconds for one demo game, kickoff to final (the games start at staggered times)


def demo_games(schedule: list[dict], week: int, now: float | None = None) -> list[LiveGame]:
    """Every game of `week` as if it were being played now, sped up: each runs about 12 real minutes, then shows
    as final for a few minutes and starts over. Scores come from made-up drives (seeded by the game id, and leaning
    toward the model's favorite), so they only go up and look the same for every viewer."""
    now = time.time() if now is None else now
    out = []
    for i, g in enumerate(sorted((g for g in schedule if g["week"] == week), key=lambda g: g["game_id"])):
        t = (now + i * 97) % DEMO_CYCLE / (DEMO_CYCLE * 0.8)           # game progress 0..1 (>1: final)
        elapsed = min(t, 1.0) * GAME_SECONDS
        rng = random.Random(g["game_id"])
        p = g.get("p_home") or 0.5
        hs = as_ = 0
        drives = []
        home_first = rng.random() < 0.5
        for d in range(24):                                          # 12 possessions each
            start = d * GAME_SECONDS / 24
            home_ball = (d % 2 == 0) == home_first
            strength = p if home_ball else 1 - p
            r = rng.random()
            pts = 7 if r < 0.17 + 0.12 * (strength - 0.5) else 3 if r < 0.33 + 0.12 * (strength - 0.5) else 0
            drives.append((start, home_ball, pts))
        offense, drive_progress = None, 0.0
        for start, home_ball, pts in drives:
            if start + GAME_SECONDS / 24 <= elapsed:
                hs, as_ = hs + (pts if home_ball else 0), as_ + (0 if home_ball else pts)
            elif start <= elapsed:
                offense, drive_progress = home_ball, (elapsed - start) / (GAME_SECONDS / 24)
        final = t >= 1.0
        if final and hs == as_:
            hs += 3                                                  # no ties in the demo
        period = min(4, int(elapsed // 900) + 1)
        clock_s = 0.0 if final else 900 - (elapsed - (period - 1) * 900)
        clock = f"{int(clock_s // 60)}:{int(clock_s % 60):02d}"
        # The ball moves down the field as the drive goes on.
        ytg = None if offense is None else float(max(1, round(75 - 65 * drive_progress)))
        poss = None if final or offense is None else (g["home"] if offense else g["away"])
        p_live = live_win_prob(p, hs, as_, period, clock_s, None if poss is None else offense, ytg, final=final)
        detail = "Final" if final else "Halftime" if period == 2 and clock_s == 0 else f"Q{period} {clock}"
        out.append(LiveGame(
            game_id=g["game_id"], espn_id=str(g.get("espn_id") or ""), home=g["home"], away=g["away"],
            state="post" if final else "in", home_score=hs, away_score=as_, period=period, clock=clock,
            detail=detail, possession=poss,
            down_distance=None if poss is None else f"{['1st & 10', '2nd & 6', '3rd & 3'][int(elapsed // 50) % 3]} at "
                                                     f"{_spot(poss, g, ytg)}",
            red_zone=poss is not None and ytg is not None and ytg <= 20, p_home_pre=p,
            p_home_live=round(p_live, 4)))
    return out


def _spot(offense: str, g: dict, ytg: float | None) -> str:
    if ytg is None:
        return "midfield"
    other = g["away"] if offense == g["home"] else g["home"]
    if ytg == 50:
        return "50"
    return f"{other} {int(ytg)}" if ytg < 50 else f"{offense} {int(100 - ytg)}"
