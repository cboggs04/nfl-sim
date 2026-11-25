"use client";

import { createContext, useContext } from "react";
import ProbCell, { pct } from "@/components/ProbCell";
import { liveStatus, useLive, type LiveState } from "@/lib/useLive";
import { teamInfo } from "@/lib/teams";
import type { GameView, LiveGame } from "@/lib/types";

const LiveContext = createContext<LiveState | null>(null);

/** Polls live scores for a team's games that haven't been recorded as played yet. Wrap the schedule in it. */
export function LiveProvider({ games, children }: { games: GameView[]; children: React.ReactNode }) {
  const open = games.filter((g) => !g.played);
  const state = useLive(
    open.map((g) => g.kickoff ?? null),
    open.length > 0,
  );
  return <LiveContext.Provider value={state}>{children}</LiveContext.Provider>;
}

function useGame(g: GameView): LiveGame | null {
  const state = useContext(LiveContext);
  const live = state?.games[g.game_id];
  return !g.played && live && live.state !== "pre" ? live : null;
}

/** P(this team wins) from a live game's home-team probability. */
const teamP = (g: GameView, live: LiveGame) => (live.p_home_live == null ? null : g.home ? live.p_home_live : 1 - live.p_home_live);
const scores = (g: GameView, live: LiveGame) => (g.home ? [live.home_score, live.away_score] : [live.away_score, live.home_score]);

export function LiveDot({ className = "" }: { className?: string }) {
  return (
    <span className={`relative inline-flex h-2.5 w-2.5 ${className}`} aria-hidden>
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-bad opacity-60" />
      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-bad" />
    </span>
  );
}

/** The result cell of a schedule row: the live score while the game is on (or a provisional final), else `children`. */
export function LiveResultCell({ g, children }: { g: GameView; children: React.ReactNode }) {
  const live = useGame(g);
  if (!live) return <>{children}</>;
  const [us, them] = scores(g, live);
  const final = live.state === "post";
  const res = us > them ? "W" : us < them ? "L" : "T";
  return (
    <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
      {final ? (
        <span className={`font-display inline-flex h-9 w-9 items-center justify-center rounded text-xl text-white ${res === "W" ? "bg-good" : res === "L" ? "bg-bad" : "bg-zinc-500"}`}>{res}</span>
      ) : (
        <span className="inline-flex items-center gap-1.5 rounded bg-bad/15 px-2 py-1 text-xs font-bold tracking-widest text-bad-ink uppercase ring-1 ring-bad/40">
          <LiveDot /> Live
        </span>
      )}
      <span className="text-base font-semibold whitespace-nowrap tabular-nums">
        {us}–{them}
      </span>
      <span className="text-xs text-muted">
        {liveStatus(live)}
        {live.possession && <> · {live.possession} ball</>}
      </span>
    </span>
  );
}

/** The Win % cell: the live in-game probability while the game is on, else `children` (the pregame one). */
export function LiveProbCell({ g, children }: { g: GameView; children: React.ReactNode }) {
  const live = useGame(g);
  const p = live ? teamP(g, live) : null;
  if (p == null) return <>{children}</>;
  return <ProbCell p={p} narrow />;
}

/** A card above the schedule while one of the team's games is on. */
export function LiveBanner({ games, team }: { games: GameView[]; team: string }) {
  const state = useContext(LiveContext);
  const g = games.find((x) => !x.played && state?.games[x.game_id]?.state === "in");
  if (!g || !state) return null;
  const live = state.games[g.game_id];
  const [us, them] = scores(g, live);
  const p = teamP(g, live);
  const pre = live.p_home_pre == null ? null : g.home ? live.p_home_pre : 1 - live.p_home_pre;
  const color = teamInfo(team).primary;
  return (
    <a href="#schedule" className="panel mt-6 flex flex-wrap items-center justify-between gap-4 p-4 ring-1 ring-bad/40 hover:bg-hover">
      <div className="flex items-center gap-3">
        <span className="inline-flex items-center gap-1.5 text-xs font-bold tracking-widest text-bad-ink uppercase">
          <LiveDot /> Live{state.source === "demo" && " (demo)"}
        </span>
        <span className="font-display text-3xl text-strong tabular-nums">
          {team} {us} <span className="text-muted">–</span> {them} {g.opponent}
        </span>
        <span className="text-sm text-muted">{liveStatus(live)}</span>
      </div>
      {live.down_distance && <span className="text-sm text-muted">{live.possession} ball · {live.down_distance}{live.red_zone && " · red zone"}</span>}
      {p != null && (
        <div className="min-w-48 flex-1 sm:max-w-xs">
          <div className="flex justify-between text-xs font-semibold text-muted">
            <span>Win probability</span>
            <span className="text-strong">
              {pct(p)}
              {pre != null && <span className="font-normal text-muted"> (pregame {pct(pre)})</span>}
            </span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-gauge">
            <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${Math.max(2, p * 100)}%`, backgroundColor: color }} />
          </div>
        </div>
      )}
    </a>
  );
}
