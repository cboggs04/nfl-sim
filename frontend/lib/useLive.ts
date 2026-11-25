"use client";

import { useEffect, useState } from "react";
import { getLive } from "./api";
import type { LiveGame, LiveResponse } from "./types";

const BEFORE_KICKOFF = 30 * 60_000; // start checking half an hour before kickoff
const AFTER_KICKOFF = 5 * 3600_000; // a game is over within ~4 hours; allow for long ones
const POLL_LIVE = 30_000; // while a game is on (the API refreshes ESPN every 20 s)
const POLL_DEMO = 5_000; // demo games run ~5x real speed
const POLL_IDLE = 120_000; // inside the window but nothing on yet

/** Is any of these kickoffs close enough to now that the game could be on? An unknown kickoff counts as "maybe". */
export function inLiveWindow(kickoffs: (string | null | undefined)[], now = Date.now()): boolean {
  return kickoffs.some((k) => {
    if (!k) return true;
    const t = Date.parse(k);
    return Number.isNaN(t) || (now >= t - BEFORE_KICKOFF && now <= t + AFTER_KICKOFF);
  });
}

/** Add ?demo=1 to a page's URL to see made-up live games (for presenting when nothing is on). */
export function demoRequested(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("demo") === "1";
}

export interface LiveState {
  games: Record<string, LiveGame>; // by our game_id
  source: LiveResponse["source"] | null;
  week: number | null;
  updatedAt: number | null;
}

const EMPTY: LiveState = { games: {}, source: null, week: null, updatedAt: null };

/**
 * Polls /api/live while any of `kickoffs` is near now (or always in demo mode): every 30 s while a game is on,
 * every 2 minutes otherwise, and never while the tab is hidden. Outside the window it makes no requests at all,
 * except one when `once` is set (a finished week, for its records and game leaders). `week` picks a week's scoreboard.
 */
export function useLive(kickoffs: (string | null | undefined)[], enabled = true, opts: { week?: number; once?: boolean } = {}): LiveState {
  const [state, setState] = useState<LiveState>(EMPTY);
  const key = kickoffs.join(",");
  const { week, once = false } = opts;

  useEffect(() => {
    if (!enabled) return;
    const demo = demoRequested();
    const list = key ? key.split(",") : [];
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    let fetched = false;

    const schedule = (ms: number) => {
      clearTimeout(timer);
      if (!stopped) timer = setTimeout(tick, ms);
    };

    async function tick() {
      if (document.hidden) return; // resumes on visibilitychange
      if (!demo && !(once && !fetched) && !inLiveWindow(list.map((k) => k || null))) {
        schedule(60_000); // check the clock again in a minute; no request
        return;
      }
      try {
        const res = await getLive(demo, week);
        if (stopped) return;
        fetched = true;
        const games: Record<string, LiveGame> = {};
        for (const g of res.games) if (g.game_id) games[g.game_id] = g;
        setState({ games, source: res.source, week: res.week, updatedAt: Date.now() });
        schedule(demo ? POLL_DEMO : res.games.some((g) => g.state === "in") ? POLL_LIVE : POLL_IDLE);
      } catch {
        schedule(POLL_IDLE); // server asleep or offline: try again later
      }
    }

    const onVisible = () => {
      if (!document.hidden) tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    tick();
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [key, enabled, week, once]);

  return state;
}

/** "Q3 4:12" style status for a live game, from ESPN's detail with a fallback. */
export function liveStatus(g: LiveGame): string {
  if (g.state === "post") return g.period > 4 ? "Final/OT" : "Final";
  if (g.state === "pre") return g.detail || "Pregame";
  if (/half/i.test(g.detail)) return "Halftime";
  if (/^end/i.test(g.detail)) return g.detail; // "End of 3rd Quarter"
  return g.period > 4 ? `OT ${g.clock}` : `Q${g.period} ${g.clock}`;
}
