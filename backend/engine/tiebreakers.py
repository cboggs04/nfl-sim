"""NFL tiebreakers and playoff seeding for ONE simulated (or real) regular season.

Pure Python, no web code. Input is a list of games as (home, away, home_result)
where home_result is 1 (home win), 0 (home loss) or 0.5 (tie).

Implemented, in the NFL's official order:
  Division:   head-to-head, division record, common games, conference record,
              strength of victory, strength of schedule
  Wild card:  (division tiebreaker first for same-division teams), head-to-head
              sweep, conference record, common games (min 4), strength of victory,
              strength of schedule
After the last step we flip a coin. The NFL's remaining steps (points-based
rankings, net points, touchdowns) need game scores, which this model doesn't
simulate, so they're folded into the coin flip. That only matters in a tiny
fraction of ties.

Key NFL rule: once a multi-team tiebreaker cuts the group to two teams, the
two-team procedure restarts from step 1; and once a team is picked, the
remaining teams start over from step 1.
"""
import random
from collections import defaultdict

from .teams import CONFERENCE_OF, DIVISION_OF, DIVISIONS, conference_teams

_EPS = 9  # decimal places used when comparing percentages


class Results:
    """Everything the tiebreakers need to know about a season's results."""

    def __init__(self, games):
        self.games = defaultdict(list)  # team -> [(opponent, result for that team)]
        for home, away, r in games:
            self.games[home].append((away, r))
            self.games[away].append((home, 1 - r))

    def pct(self, team, only=None):
        """Win % (ties = half a win), optionally only vs opponents where only(opp) is True."""
        rs = [r for opp, r in self.games[team] if only is None or only(opp)]
        return sum(rs) / len(rs) if rs else 0.0

    def record(self, team):
        rs = [r for _, r in self.games[team]]
        return sum(rs), len(rs)

    def pooled_pct(self, opponents):
        """Combined win % of a list of opponents (an opponent listed twice counts twice)."""
        w = g = 0
        for o in opponents:
            ow, og = self.record(o)
            w, g = w + ow, g + og
        return w / g if g else 0.0


# ---- tiebreaker steps: (results, tied_teams) -> {team: value} (higher = better) or None if N/A

def _head_to_head(res, S):
    members = set(S)
    played_all = {t: all(any(o == u for o, _ in res.games[t]) for u in S if u != t) for t in S}
    if all(played_all.values()):
        return {t: res.pct(t, lambda o: o in members) for t in S}
    # Not everyone played everyone: the step only applies if one team swept the others.
    sweepers = [t for t in S if played_all[t]
                and all(r == 1 for o, r in res.games[t] if o in members)]
    if len(sweepers) == 1:
        return {t: 1.0 if t == sweepers[0] else 0.0 for t in S}
    return None


def _division_record(res, S):
    return {t: res.pct(t, lambda o: DIVISION_OF[o] == DIVISION_OF[t]) for t in S}


def _conference_record(res, S):
    return {t: res.pct(t, lambda o: CONFERENCE_OF[o] == CONFERENCE_OF[t]) for t in S}


def _common_games(min_games):
    def step(res, S):
        members = set(S)
        common = set.intersection(*[{o for o, _ in res.games[t]} for t in S]) - members
        counts = {t: sum(1 for o, _ in res.games[t] if o in common) for t in S}
        if not common or min(counts.values()) < min_games:
            return None
        return {t: res.pct(t, lambda o: o in common) for t in S}
    return step


def _strength_of_victory(res, S):
    return {t: res.pooled_pct([o for o, r in res.games[t] if r == 1]) for t in S}


def _strength_of_schedule(res, S):
    return {t: res.pooled_pct([o for o, _ in res.games[t]]) for t in S}


DIVISION_STEPS = [_head_to_head, _division_record, _common_games(0),
                  _conference_record, _strength_of_victory, _strength_of_schedule]
WILD_CARD_STEPS = [_head_to_head, _conference_record, _common_games(4),
                   _strength_of_victory, _strength_of_schedule]


def _break_tie(res, S, steps, rng):
    """Return the single best team out of tied teams S."""
    cur = list(S)
    if len(cur) == 1:
        return cur[0]
    for step in steps:
        vals = step(res, cur)
        if vals is None:
            continue
        best = max(round(v, _EPS) for v in vals.values())
        keep = [t for t in cur if round(vals[t], _EPS) == best]
        if len(keep) == len(cur):
            continue
        if len(keep) == 1:
            return keep[0]
        if len(keep) == 2:
            return _break_tie(res, keep, steps, rng)  # restart two-team procedure
        cur = keep
    return rng.choice(cur)  # stands in for the points-based steps + coin toss


def _pick_division(res, S, rng):
    return _break_tie(res, S, DIVISION_STEPS, rng)


def _pick_wild_card(res, S, rng):
    """Best of S under wild-card rules: same-division teams are reduced by the
    division tiebreaker first, then one team per division is compared."""
    by_div = defaultdict(list)
    for t in S:
        by_div[DIVISION_OF[t]].append(t)
    candidates = [_pick_division(res, ts, rng) for ts in by_div.values()]
    return _break_tie(res, candidates, WILD_CARD_STEPS, rng)


def _order(res, pool, pick, rng):
    """Rank a pool by win %, resolving each tied group by repeatedly picking the best."""
    groups = defaultdict(list)
    for t in pool:
        groups[round(res.pct(t), _EPS)].append(t)
    ordered = []
    for p in sorted(groups, reverse=True):
        rest = list(groups[p])
        while rest:
            best = pick(res, rest, rng) if len(rest) > 1 else rest[0]
            ordered.append(best)
            rest.remove(best)
    return ordered


def division_standings(games, division, rng=None):
    """Teams in `division` ranked 1st..4th."""
    rng = rng or random.Random()
    return _order(Results(games), DIVISIONS[division], _pick_division, rng)


def conference_seeds(games, conf, rng=None):
    """Return the 7 playoff teams for 'AFC' or 'NFC' in seed order.

    Seeds 1-4: division winners ranked by record. Seeds 5-7: best three
    non-winners. Returns (seeds, division_winners).
    """
    rng = rng or random.Random()
    res = games if isinstance(games, Results) else Results(games)
    winners = []
    for div, teams in DIVISIONS.items():
        if div.startswith(conf):
            winners.append(_order(res, teams, _pick_division, rng)[0])
    seeded_winners = _order(res, winners, _pick_wild_card, rng)
    others = [t for t in conference_teams(conf) if t not in winners]
    wild_cards = _order(res, others, _pick_wild_card, rng)[:3]
    return seeded_winners + wild_cards, set(winners)
