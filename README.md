# NFL Season Simulator

An interactive web app that simulates the NFL season thousands of times to project every team's record, playoff odds and Super Bowl chances, and adds a few things to do with the results: replay real games, simulate the playoffs, test what-ifs, and play a pixel-art football game.

Built as a class project. The model and data run on a free stack: a Python API, a Next.js site, and public NFL data from [nflverse](https://github.com/nflverse).

![Home page with the Super Bowl odds](docs/images/home.jpg)

## What's in it

- **Super Bowl odds (Home):** the top contenders and a sortable league table, from 20,000 simulated seasons.
- **Team pages:** every game's win probability, projected record, and charts. Every game already played has a **pixel-art replay built from the real drive-by-drive results** (touchdowns, field goals, punts, turnovers, pick sixes, overtime and ties). The final score and drives are real; the animation of each play is drawn.
- **Season simulator (team page):** play out the rest of a team's season (or the whole season) and see projected player stats.
- **Playoff simulator:** simulate the rest of the regular season once, see the standings it creates, then play the bracket round by round to a Super Bowl champion.
- **Stat leaders and awards:** projected league leaders and MVP / OPOTY / DPOTY / OROY / DROY odds.
- **What-if sandbox:** boost or hurt a team, or force a game result, and re-run 2,000 simulations to see the odds move.
- **Model accuracy:** a backtest on past seasons, a calibration chart, and how each improvement scored. A short "About the model" panel is in the top bar.
- **Play now:** a keyboard (and touch) pixel-art football game. You run the offense against a computer defense, with 10 plays (5 pass, 5 run) to pick from, three difficulty levels, uniform choices, and four quarters. The other team's drives are simulated from the two teams' ratings.
- **Works on phones:** responsive layout, landscape touch controls for the game, and it can be installed to the home screen.

| Real-game replay | Playoff simulator | Play now |
|---|---|---|
| ![Replay of a real game in overtime](docs/images/replay.jpg) | ![Super Bowl champions screen](docs/images/playoffs.jpg) | ![Play now](docs/images/play-now.jpg) |

## How the model works

- **Ratings:** each team has an Elo rating (K = 20, regressed toward average each offseason). It is adjusted for the projected starting quarterback, rated by EPA per dropback, and a home-field edge re-fitted on recent seasons (about 20 rating points now).
- **Games and seasons:** the rating gap plus home field gives a win probability for each game. The remaining schedule is simulated many times with the real NFL tiebreakers, division winners, wild cards, seeding and the playoffs.
- **Players:** per-game rates blended with last season, touchdown rates regressed toward what yardage implies, and stats that shift with wins and losses.
- **Validation:** tuned on 2012–2017 and graded on 2018–2025 (2,119 games, none seen while tuning): **64.8%** of winners picked, Brier score **0.2191**. A coin flip is 50% and 0.2500.

## Tech stack

| Part | Tools |
|---|---|
| API | Python 3.11, FastAPI, numpy, polars, pydantic |
| Data | nflverse via `nflreadpy` (schedules, results, play-by-play, rosters) |
| Website | Next.js 16 (TypeScript, App Router), Tailwind CSS 4, Recharts |
| Hosting | Render (API) and Vercel (site) |
| Data refresh | A GitHub Actions workflow, every Tuesday |

## Project layout

```
backend/
  engine/     pure Python: Elo, QB adjustment, season/playoff simulation, players, awards, replay drives
  app/        FastAPI routes and the response schemas
  scripts/    precompute.py (builds the cached JSON), backtest and model-fitting scripts
  data/       cached results the API serves (committed), plus downloaded data caches
  tests/      pytest suite
frontend/
  app/        pages (Home, teams, playoff simulator, stat leaders, what-if, play now, model accuracy)
  components/ UI pieces, including the replay animation and the Play now screen
  lib/        the typed API client and the Play now game engine (pure TypeScript)
```

The frontend only talks to the backend through `frontend/lib/api.ts`. Default results are precomputed into `backend/data/*.json`; only the what-if and `/api/sim/*` endpoints run simulations live.

## Run it locally

You need Python 3.11 and Node 20+.

**Backend** (port 8000):

```bash
cd backend
python3.11 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn app.main:app --reload
```

**Frontend** (port 3000):

```bash
cd frontend
npm install
npm run dev
```

The site expects the API at `http://localhost:8000`. To point it somewhere else, set `NEXT_PUBLIC_API_URL`.

**Tests:**

```bash
cd backend && .venv/bin/python -m pytest -q
cd frontend && npx tsc --noEmit && npx eslint .
```

**Refresh the data** (re-downloads the latest results and rebuilds the cached JSON; the first run downloads several seasons and takes a while):

```bash
cd backend
.venv/bin/python -m scripts.precompute --refresh
```

## Deploying

See [DEPLOY.md](DEPLOY.md) for the step-by-step guide (Render for the API, Vercel for the site, and the weekly data refresh). On Render's free plan the API sleeps after about 15 minutes idle, so the first request after a quiet period can take 30 to 60 seconds. The site shows a "waking up" note while it waits.

## Credits and notes

- Game data from [nflverse](https://github.com/nflverse) (free, no API key).
- For fun, not betting advice. This is not affiliated with the NFL or any team; team names and logos belong to their owners.
