import random

from engine.teams import DIVISIONS, conference_teams
from engine.tiebreakers import (Results, _common_games, _pick_wild_card,
                                _strength_of_victory, conference_seeds,
                                division_standings)

RNG = random.Random(0)


def W(winner, loser):
    """A game the `winner` won (as the 'home' side; home/away doesn't matter here)."""
    return (winner, loser, 1)


def test_best_record_wins_division_no_tiebreaker_needed():
    games = [W("BUF", "MIA"), W("BUF", "NE"), W("MIA", "NE")]
    assert division_standings(games, "AFC East", RNG)[:3] == ["BUF", "MIA", "NE"]


def test_two_team_tie_decided_by_head_to_head():
    # BUF and MIA both 1-1; BUF beat MIA.
    games = [W("BUF", "MIA"), W("KC", "BUF"), W("MIA", "KC")]
    assert division_standings(games, "AFC East", RNG)[:2] == ["BUF", "MIA"]


def test_split_head_to_head_falls_to_division_record():
    # BUF and MIA split head-to-head and both finish 2-2 overall, but BUF's
    # extra win came inside the division (vs NE) and MIA's outside it (vs KC).
    games = [W("BUF", "MIA"), W("MIA", "BUF"), W("BUF", "NE"),
             W("MIA", "KC"), W("KC", "BUF"), W("DAL", "MIA")]
    # overall: BUF 2-2, MIA 2-2 (W BUF, L BUF, W KC, L DAL); div: BUF 2/3, MIA 1/2
    assert division_standings(games, "AFC East", RNG)[:2] == ["BUF", "MIA"]


def test_three_way_tie_uses_sweep_then_restarts_two_team():
    games = [W("BUF", "MIA"), W("BUF", "NE"), W("MIA", "NE"),
             W("KC", "BUF"), W("DAL", "BUF"),   # BUF 2-2
             W("MIA", "KC"), W("DAL", "MIA"),   # MIA 2-2
             W("NE", "KC"), W("NE", "DAL")]     # NE 2-2
    assert division_standings(games, "AFC East", RNG)[:3] == ["BUF", "MIA", "NE"]


def test_strength_of_victory_is_pooled_opponent_win_pct():
    # BUF beat KC (KC 1-1) and DAL (DAL 0-2 vs. others) -> (1 + 0) / (2 + 2) = .25
    games = [W("BUF", "KC"), W("BUF", "DAL"), W("KC", "NE"), W("NE", "DAL"),
             W("NE", "DAL")]
    res = Results(games)
    assert _strength_of_victory(res, ["BUF"])["BUF"] == (1 + 0) / (2 + 3)


def test_common_games_needs_minimum_count():
    games = [W("BUF", "KC"), W("MIA", "KC")]
    assert _common_games(4)(Results(games), ["BUF", "MIA"]) is None
    assert _common_games(1)(Results(games), ["BUF", "MIA"]) is not None


def test_wild_card_same_division_teams_use_division_tiebreaker_first():
    # BUF, MIA, KC all 1-1. MIA beat KC, but BUF beat MIA so MIA loses the
    # division tiebreak and is out; BUF then faces KC, who beat BUF.
    games = [W("BUF", "MIA"), W("MIA", "KC"), W("KC", "BUF")]
    assert _pick_wild_card(Results(games), ["BUF", "MIA", "KC"], RNG) == "KC"


def test_full_conference_seeding_with_clear_rankings():
    # Round robin among AFC teams where a lower index always beats a higher one.
    order = ["BUF", "KC", "BAL", "HOU", "MIA", "DEN", "CIN", "LAC", "PIT", "NE",
             "IND", "JAX", "CLE", "TEN", "NYJ", "LV"]
    assert set(order) == set(conference_teams("AFC"))
    games = [W(order[i], order[j]) for i in range(16) for j in range(i + 1, 16)]
    seeds, winners = conference_seeds(games, "AFC", RNG)
    # Division winners: BUF (East), KC (West), BAL (North), HOU (South), seeded by record.
    assert seeds[:4] == ["BUF", "KC", "BAL", "HOU"]
    # Wild cards: best three non-winners.
    assert seeds[4:] == ["MIA", "DEN", "CIN"]
    assert winners == {"BUF", "KC", "BAL", "HOU"}


def test_division_winner_can_have_worse_record_than_wild_card():
    # Weak-division winner is still seeded ahead of nothing but never behind a
    # wild card: seeds 1-4 are always the division winners.
    order = ["BUF", "MIA", "NE", "NYJ", "KC", "LV", "DEN", "LAC", "BAL", "CIN",
             "PIT", "CLE", "HOU", "IND", "JAX", "TEN"]
    games = [W(order[i], order[j]) for i in range(16) for j in range(i + 1, 16)]
    seeds, winners = conference_seeds(games, "AFC", RNG)
    assert set(seeds[:4]) == winners == {"BUF", "KC", "BAL", "HOU"}
    assert seeds[4:] == ["MIA", "NE", "NYJ"]  # the East's 2nd-4th beat all other non-winners
