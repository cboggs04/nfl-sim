"""Simulate the NFL playoff bracket from seeded teams. Pure Python, no web code."""
import random

from .elo import EloConfig, expected_home_win


def _play(rng, ratings, home, away, cfg, neutral=False):
    """Play one game; return the winner. `home` is the higher seed (hosts)."""
    p = expected_home_win(ratings[home], ratings[away], 0.0 if neutral else cfg.home_field)
    return home if rng.random() < p else away


def simulate_conference(seeds, ratings, rng, cfg=EloConfig()):
    """Play a 7-team conference bracket; return the conference champion.

    seeds: team abbreviations in seed order (index 0 = the 1 seed).
    Wild Card: 2v7, 3v6, 4v5 (the 1 seed gets a bye).
    Divisional: the 1 seed hosts the LOWEST remaining seed; the other two meet.
    (The NFL reseeds every round, so we always pair best vs worst.)
    """
    rank = {t: i for i, t in enumerate(seeds)}  # lower = better seed
    wc = [_play(rng, ratings, seeds[h], seeds[a], cfg) for h, a in ((1, 6), (2, 5), (3, 4))]
    alive = sorted([seeds[0]] + wc, key=rank.get)
    div = [_play(rng, ratings, alive[0], alive[3], cfg), _play(rng, ratings, alive[1], alive[2], cfg)]
    div.sort(key=rank.get)
    return _play(rng, ratings, div[0], div[1], cfg)


def simulate_playoffs(afc_seeds, nfc_seeds, ratings, rng, cfg=EloConfig()):
    """Run both conference brackets and the Super Bowl (neutral site, no home field).

    Returns (afc_champ, nfc_champ, super_bowl_winner).
    """
    afc = simulate_conference(afc_seeds, ratings, rng, cfg)
    nfc = simulate_conference(nfc_seeds, ratings, rng, cfg)
    champ = _play(rng, ratings, afc, nfc, cfg, neutral=True)
    return afc, nfc, champ
