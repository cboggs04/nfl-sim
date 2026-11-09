# Deploying the NFL Season Simulator

Two pieces: the **API** (Python, on Render) and the **website** (Next.js, on Vercel). Both deploy straight from a
GitHub repository and both have free plans. Do the steps in order.

## 0. Put the code on GitHub (once)

1. Create a new empty repository on github.com (e.g. `nfl-sim`). Do not add a README.
2. In the project folder:
   ```
   git remote add origin https://github.com/<you>/nfl-sim.git
   git push -u origin main
   ```

## 1. Deploy the API on Render

1. render.com > **New > Blueprint** > pick the repo. It reads `render.yaml`.
2. When asked, leave `CORS_ORIGINS` empty for now (you'll fill it in step 3). Create the service.
3. Wait for the first deploy (a few minutes). Open `https://<your-service>.onrender.com/api/health`. You should see
   `{"status":"ok", ...}`. Note the service URL.

## 2. Deploy the website on Vercel

1. vercel.com > **Add New > Project** > import the same repo.
2. Set **Root Directory** to `frontend`.
3. Add the environment variable `NEXT_PUBLIC_API_URL` = your Render URL (e.g. `https://nfl-sim-api.onrender.com`, no trailing slash).
4. Deploy. Note the site URL (e.g. `https://nfl-sim.vercel.app`).

## 3. Let the site talk to the API

In Render > your service > **Environment**, set `CORS_ORIGINS` to your Vercel URL
(e.g. `https://nfl-sim.vercel.app`; separate several with commas). Render restarts the service. Reload the site.

## 4. Keep the data fresh

`.github/workflows/refresh-data.yml` re-runs the simulations after each Sunday slate (1 pm, 4 pm, Sunday night) and after Monday night, and commits the new data, which redeploys the API.
Run it by hand any time: GitHub > **Actions > Refresh data > Run workflow**. (The first run downloads several seasons of
play-by-play and can take 10-20 minutes; later runs only fetch the current season.)

## Before a live demo

- **Wake the API.** Render's free plan puts the API to sleep after ~15 minutes without traffic, and the first request then
  takes 30-60 seconds. Open the site (or `/api/health`) a couple of minutes before you present. A paid plan (about $7/month)
  removes the sleeping.
- **Use the live site, not `npm run dev`.** The production build is much faster than the development server.
- If a page says "Is the API running?", check `/api/health` first, then `CORS_ORIGINS`.

## Updating after a change

Push to `main`. Render and Vercel redeploy automatically.

## Vercel: skip rebuilds when only the data changed (optional)

The weekly refresh only changes `backend/data/*.json`, which the website reads from the API, so rebuilding the site is
wasted work. In Vercel > Project > **Settings > Build and Deployment > Ignored Build Step** (search the page for "Ignored" if it has moved), choose **Custom** and enter:

```
git diff --quiet HEAD^ HEAD -- .
```

Vercel then skips any deploy where nothing inside `frontend/` changed.

Also keep **Settings > Git > Require Verified Commits** switched off, or the data-refresh commits will be rejected.
