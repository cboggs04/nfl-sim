# NFL Season Simulator

Interactive web app that simulates the NFL season with Monte Carlo methods and projects every team's record, playoff odds, and Super Bowl odds. Class project, ~4 week timeline. Final deliverable: a polished, live demo presented in class.

## Stack
- Backend: Python + FastAPI
- Data: nfl_data_py (nflverse)
- Frontend: Next.js (TypeScript) + Tailwind + Recharts
- Deploy: Vercel (frontend) + small hosted API

## Architecture rules
- `backend/engine/` is pure Python. It must never import FastAPI or any web code.
- `backend/app/` holds routes and Pydantic schemas (`schemas.py` defines all JSON shapes).
- The frontend only talks to the API through the typed client in `frontend/lib/api.ts`.
- Default simulation results are precomputed by `backend/scripts/precompute.py` and cached as JSON in `backend/data/`. Only the what-if endpoint runs live sims (~2,000 runs).

## Model
- Team ratings: start with Elo, then try EPA-based offense/defense ratings.
- Rating gap + home field -> per-game win probability.
- Simulate all 272 regular-season games N times, with NFL tiebreakers, division winners, wild cards, 7-team seeding, and the full playoff bracket through the Super Bowl.
- Per team output: expected wins, win distribution (0-17), division/playoff/top-seed/conference/Super Bowl odds.

## API endpoints
- GET /api/season
- GET /api/teams/{abbr}
- GET /api/bracket
- POST /api/whatif
- GET /api/backtest
- GET /api/teams/{abbr}/roster (players, stats, projections)
- POST /api/sim/season, /api/sim/game, /api/sim/team (interactive single simulations)

## Feature priority
1. Season dashboard (sortable table)
2. Interactive playoff bracket
3. Team deep-dive page
4. What-if sandbox
5. Backtesting / calibration page
6. Claude API chat layer that turns questions into what-if parameters

## Working rules
- Build the thinnest end-to-end slice first (data -> sim -> plain dashboard table), then layer features.
- Build in small, testable steps. Write tests for tiebreaker logic early (`backend/tests/`).
- Ask before adding dependencies or making major architecture decisions.
- Build the UI against a mock JSON file while the model is in progress.
- Commit after each working step.
