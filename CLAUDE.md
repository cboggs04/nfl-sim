# NFL Season Simulator

Interactive web app that simulates the NFL season with Monte Carlo methods and projects every team's record, playoff odds, and Super Bowl odds. Class project, ~4 week timeline. Final deliverable: a polished, live demo presented in class.

## Status (update this when things change)
Live on Vercel (site) + Render (API); code at github.com/cboggs04/nfl-sim. Built and working:
- Home: Super Bowl odds cards + sortable league table.
- Team pages (Overview / Season simulator tabs): schedule with per-game win odds; simulate the rest of the season or replay the full season; player tables (stats so far, projected, simulated).
- Playoff simulator page (Standings / Bracket tabs): one simulated season shared by both; bracket is playable round by round.
- Stat leaders page: projected league leaders + award odds (MVP, OPOTY, DPOTY, OROY, DROY; a player wins at most one).
- What-if sandbox: adjust team Elo or force game results, re-run 2,000 sims.
- Model accuracy page: backtest, calibration, how each model improvement scored.
- Light theme is the default (dark available via toggle); phone layout via responsive CSS.
- Team pages: every played regular-season game has a pixel-art Replay (ties and overtime included) built from the real drives (`engine/drives.py` reads nflverse play-by-play into `backend/data/drives.json`: TD, FG, missed FG, punt, interception, fumble, downs, safety, pick sixes). Final score is real; the play drawings are for show. Games whose drives don't add up to the real score fall back to made-up drives.
- Playoff games: model-simulated scores (engine/scores.py) shown on the cards; every played game has a pixel-art Replay (the Super Bowl opens by itself). Plays/drives are for show; the model only picks the winner and the score.
- Play now (/play): a keyboard pixel-art football game (you play offense vs the computer defense; the other team's drives are simulated from team ratings). Engine in `frontend/lib/playNow/engine.ts` (pure TS, bot-tested via `frontend/scripts/playNowBots.js`), screen in `components/PlayNow.tsx`. Play picker: after choosing pass or run, press 1/2/3 for one of three plays offered each snap (`PLAYS` in the engine: 5 pass and 5 run plays, a random 3 of each offered). Difficulty levels (Rookie/Pro/All-Star, `DIFFICULTY` in the engine; Pro is the baseline; bots win ~97%/85%/50%). Two halves of 10:00 game clock (5x speed while the ball is live, about 90-120 s real time each).
Not built yet: Claude API chat layer (feature 6).

## Stack
- Backend: Python 3.11 + FastAPI (numpy, polars, pydantic). Hosted on Render (`render.yaml`, `backend/requirements-api.txt`).
- Data: nflverse via `nflreadpy` (the maintained successor of nfl_data_py). Free, no API key.
- Frontend: Next.js 16 (TypeScript, `cacheComponents` on) + Tailwind 4 + Recharts. Hosted on Vercel (root directory `frontend`, env `NEXT_PUBLIC_API_URL`).
- Weekly data refresh: `.github/workflows/refresh-data.yml` (Tuesdays, or run by hand) re-runs precompute and commits `backend/data/*.json`.

## Architecture rules
- `backend/engine/` is pure Python. It must never import FastAPI or any web code.
- `backend/app/` holds routes and Pydantic schemas (`schemas.py` defines all JSON shapes).
- The frontend only talks to the API through the typed client in `frontend/lib/api.ts` (types mirrored by hand in `frontend/lib/types.ts`).
- Default simulation results are precomputed by `backend/scripts/precompute.py` and cached as JSON in `backend/data/` (committed). The API reloads a file automatically when it changes. Only the what-if and `/api/sim/*` endpoints run live sims.

## Model
- Team rating = Elo (K=20, offseason regression 0.45) plus an adjustment for each team's projected starting QB (rated by EPA per dropback, `engine/qb.py`). Home-field edge is re-fitted on the latest 6 seasons (about 20 Elo now; it was 55 in 2012-17). Settings live in `backend/data/backtest.json` ("live" block), written by `scripts/run_backtest.py`.
- Rating gap + home field -> per-game win probability; simulate all 272 games N times with NFL tiebreakers, division winners, wild cards, 7-team seeding and the full playoffs.
- Player stats (`engine/players.py`): per-game rates blended with last season; touchdown rates are regressed toward what yardage implies (`scripts/check_td_regression.py`); stats shift with wins/losses using patterns measured 2020-25 (`engine/game_flow.json`); one-at-a-time positions (QB, K, P, LS) share games via a depth chart.
- Awards (`engine/awards.py`): formula scores over many simulated seasons plus voter noise; weights checked against 2018-24 winners.
- Backtest (2018-25, tuned only on 2012-17): Brier 0.2191, 64.8% winners picked.

## API endpoints
- GET /api/health, /api/season, /api/teams/{abbr}, /api/teams/{abbr}/roster, /api/teams/{abbr}/drives, /api/bracket, /api/backtest, /api/leaders
- POST /api/whatif
- POST /api/sim/season, /api/sim/game, /api/sim/team (interactive single simulations)

## Running it
- Backend: `cd backend && .venv/bin/uvicorn app.main:app --reload` (port 8000). Tests: `.venv/bin/python -m pytest -q`.
- Frontend: `cd frontend && npm run dev` (port 3000). After clearing `.next`, run `npx next typegen` once (typed routes).
- Refresh data: `cd backend && .venv/bin/python -m scripts.precompute --refresh`, then commit `backend/data/*.json` and push (Render redeploys). See `DEPLOY.md` for first-time deployment.
- The project lives in `~/Projects/nfl-sim` (moved off the iCloud-synced Desktop, which caused "Operation timed out" file errors). `~/Desktop/nfl-sim` is only a shortcut.

## Gotchas
- Next.js keeps visited pages alive in the background, so client state persists; every page's content is wrapped in `components/ResetOnLeave.tsx` to reset on leave.
- Uncached fetches must sit inside `<Suspense>` (cacheComponents); `useSearchParams`/`usePathname` need one too.
- Run a production build next to a dev server with `NEXT_DIST_DIR=.next-build npx next build`.
- Vercel's free plan rejects commits from bot accounts; the refresh workflow commits as the repo owner.
- Render's free plan sleeps after ~15 min idle (first request takes 30-60 s): open the site before presenting.

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
