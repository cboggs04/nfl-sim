"""Download team logos, names and brand colors for the frontend (run once; results are committed).

Saves logos to frontend/public/logos/<ABBR>.png and names/colors to frontend/lib/teamInfo.json.
Logos are NFL/club trademarks, used here for a non-commercial class project.

    cd backend && .venv/bin/python -m scripts.fetch_team_assets
"""
import json
import urllib.request
from pathlib import Path

import nflreadpy as nfl

from engine.teams import TEAMS

FRONTEND = Path(__file__).resolve().parents[2] / "frontend"


def main():
    logos = FRONTEND / "public" / "logos"
    logos.mkdir(parents=True, exist_ok=True)
    colors = {}
    for row in nfl.load_teams().to_dicts():
        abbr = row["team_abbr"]
        if abbr not in TEAMS:
            continue  # skip legacy abbreviations (OAK, SD, STL, LAR)
        colors[abbr] = {"name": row["team_name"], "primary": row["team_color"], "secondary": row["team_color2"]}
        req = urllib.request.Request(row["team_logo_espn"], headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=30) as resp:
            (logos / f"{abbr}.png").write_bytes(resp.read())
    missing = set(TEAMS) - set(colors)
    assert not missing, f"no data for {missing}"
    (FRONTEND / "lib" / "teamInfo.json").write_text(json.dumps(dict(sorted(colors.items())), indent=1))
    print(f"Saved {len(colors)} logos to {logos} and colors to lib/teamInfo.json")


if __name__ == "__main__":
    main()
