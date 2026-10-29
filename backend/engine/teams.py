"""Static league structure: 2 conferences x 4 divisions x 4 teams."""
DIVISIONS = {
    "AFC East": ["BUF", "MIA", "NE", "NYJ"],
    "AFC North": ["BAL", "CIN", "CLE", "PIT"],
    "AFC South": ["HOU", "IND", "JAX", "TEN"],
    "AFC West": ["DEN", "KC", "LV", "LAC"],
    "NFC East": ["DAL", "NYG", "PHI", "WAS"],
    "NFC North": ["CHI", "DET", "GB", "MIN"],
    "NFC South": ["ATL", "CAR", "NO", "TB"],
    "NFC West": ["ARI", "LA", "SF", "SEA"],
}
DIVISION_OF = {t: d for d, ts in DIVISIONS.items() for t in ts}
CONFERENCE_OF = {t: d[:3] for t, d in DIVISION_OF.items()}
TEAMS = sorted(DIVISION_OF)


def conference_teams(conf: str) -> list[str]:
    return [t for t in TEAMS if CONFERENCE_OF[t] == conf]
