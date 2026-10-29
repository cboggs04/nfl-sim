import random

from engine.playoffs import simulate_conference, simulate_playoffs

SEEDS = ["A", "B", "C", "D", "E", "F", "G"]


def ratings(**over):
    r = {t: 1500.0 for t in SEEDS}
    r.update(over)
    return r


def test_dominant_team_wins_conference_from_any_seed():
    for team in SEEDS:  # even the 7 seed, who must win 3 road games
        for trial in range(20):
            rng = random.Random(trial)
            assert simulate_conference(SEEDS, ratings(**{team: 5000}), rng) == team


def test_champion_is_one_of_the_two_conference_champions():
    nfc = ["N" + t for t in SEEDS]
    r = ratings() | {t: 1500.0 for t in nfc}
    for trial in range(50):
        afc_c, nfc_c, champ = simulate_playoffs(SEEDS, nfc, r, random.Random(trial))
        assert afc_c in SEEDS and nfc_c in nfc and champ in (afc_c, nfc_c)


def test_one_seed_wins_more_often_than_seven_seed_with_equal_ratings():
    rng = random.Random(1)
    wins = {t: 0 for t in SEEDS}
    for _ in range(4000):
        wins[simulate_conference(SEEDS, ratings(), rng)] += 1
    assert wins["A"] > wins["G"]  # bye + home field help the 1 seed
