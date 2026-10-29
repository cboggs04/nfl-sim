"""Simulate the NFL playoff bracket from seeded teams. Pure Python, no web code."""
import random

from .elo import EloConfig, expected_home_win


def _play(rng, ratings, home, away, cfg, neutral=False):
    """Play one game; return the winner. `home` is the higher seed (hosts)."""
    p = expected_home_win(ratings[home], ratings[away], 0.0 if neutral else cfg.home_field)
    return home if rng.random() < p else away


def play_game(home, away, ratings, rng, cfg=EloConfig(), neutral=False):
    """Play one playoff game. Returns (p_home, winner)."""
    p = expected_home_win(ratings[home], ratings[away], 0.0 if neutral else cfg.home_field)
    return p, (home if rng.random() < p else away)


def simulate_conference_detailed(seeds, ratings, rng, cfg=EloConfig()):
    """Play a 7-team conference bracket and report who survived each round.

    seeds: team abbreviations in seed order (index 0 = the 1 seed).
    Wild Card: 2v7, 3v6, 4v5 (the 1 seed gets a bye).
    Divisional: the 1 seed hosts the LOWEST remaining seed; the other two meet.
    (The NFL reseeds every round, so we always pair best vs worst.)

    Returns {"divisional": the 4 teams in the divisional round,
             "conference": the 2 teams in the conference final, "champion": team}.
    """
    rank = {t: i for i, t in enumerate(seeds)}  # lower = better seed
    wc = [_play(rng, ratings, seeds[h], seeds[a], cfg) for h, a in ((1, 6), (2, 5), (3, 4))]
    alive = sorted([seeds[0]] + wc, key=rank.get)
    div = [_play(rng, ratings, alive[0], alive[3], cfg), _play(rng, ratings, alive[1], alive[2], cfg)]
    div.sort(key=rank.get)
    return {"divisional": alive, "conference": div,
            "champion": _play(rng, ratings, div[0], div[1], cfg)}


def simulate_conference(seeds, ratings, rng, cfg=EloConfig()):
    """Play a conference bracket; return just the champion."""
    return simulate_conference_detailed(seeds, ratings, rng, cfg)["champion"]


def simulate_playoffs_detailed(afc_seeds, nfc_seeds, ratings, rng, cfg=EloConfig()):
    """Both brackets plus the Super Bowl (neutral site, no home field).

    Returns {"AFC": detail, "NFC": detail, "champion": team}.
    """
    afc = simulate_conference_detailed(afc_seeds, ratings, rng, cfg)
    nfc = simulate_conference_detailed(nfc_seeds, ratings, rng, cfg)
    champ = _play(rng, ratings, afc["champion"], nfc["champion"], cfg, neutral=True)
    return {"AFC": afc, "NFC": nfc, "champion": champ}


def simulate_playoffs(afc_seeds, nfc_seeds, ratings, rng, cfg=EloConfig()):
    """Returns (afc_champ, nfc_champ, super_bowl_winner)."""
    r = simulate_playoffs_detailed(afc_seeds, nfc_seeds, ratings, rng, cfg)
    return r["AFC"]["champion"], r["NFC"]["champion"], r["champion"]
