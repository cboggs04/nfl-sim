"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

export interface ModelStats {
  accuracy: number; // share of past winners picked
  brier: number;
  games: number;
  testSeasons: [number, number];
  trainSeasons: [number, number];
  updated?: string; // when the numbers were last refreshed (ISO)
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

/** An "i" button in the top bar that opens a short explanation of the model, with its headline accuracy and a link to the full report. */
export default function AboutModel({ stats }: { stats?: ModelStats }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Esc or a click outside closes it.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  const updated = stats?.updated ? new Date(stats.updated).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }) : null;

  return (
    <div ref={wrapRef} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label="About the model"
        title="About the model"
        className={`flex h-9 w-9 items-center justify-center rounded-full ring-1 ring-line transition-colors hover:bg-hover hover:text-strong ${open ? "bg-hover text-strong" : "text-muted"}`}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
          <circle cx="12" cy="12" r="9.5" />
          <path d="M12 11v6" />
          <circle cx="12" cy="7.5" r="0.6" fill="currentColor" />
        </svg>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="About the model"
          className="panel fixed inset-x-3 top-[calc(4rem+env(safe-area-inset-top))] z-40 max-h-[calc(100dvh-5rem)] overflow-y-auto p-5 shadow-2xl shadow-black/30 sm:absolute sm:inset-x-auto sm:top-full sm:right-0 sm:mt-2 sm:w-[27rem]"
        >
          <h2 className="font-display text-3xl text-strong">About the model</h2>
          <ul className="mt-2 space-y-2 text-sm text-muted">
            <li>
              <b className="text-strong">Ratings.</b> Every team has an Elo rating that moves after each game and fades toward average each offseason. It is adjusted for the
              projected starting quarterback (rated by EPA per dropback) and a home-field edge re-fitted on recent seasons.
            </li>
            <li>
              <b className="text-strong">Odds.</b> The rating gap becomes a win chance for each game. The rest of the schedule is simulated 20,000 times with the real NFL
              tiebreakers, wild cards, seeding and playoffs, and the odds are how often each thing happens.
            </li>
            <li>
              <b className="text-strong">Players.</b> Stat projections blend this season&apos;s per-game rates with last season&apos;s, and awards come from a scoring formula plus voter noise.
            </li>
          </ul>

          {stats && (
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded bg-head px-3 py-2 ring-1 ring-line">
                <div className="font-display text-3xl text-strong">{pct(stats.accuracy)}</div>
                <div className="text-xs text-muted">of winners picked (a coin flip is 50%)</div>
              </div>
              <div className="rounded bg-head px-3 py-2 ring-1 ring-line">
                <div className="font-display text-3xl text-strong">{stats.brier.toFixed(4)}</div>
                <div className="text-xs text-muted">Brier score (lower is better)</div>
              </div>
              <p className="col-span-2 text-xs text-muted">
                Tested on {stats.games.toLocaleString("en-US")} games from {stats.testSeasons[0]} to {stats.testSeasons[1]}, seasons it was never tuned on (it was tuned on{" "}
                {stats.trainSeasons[0]} to {stats.trainSeasons[1]}).
              </p>
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <Link href="/backtest" onClick={() => setOpen(false)} className="text-sm font-semibold text-accent-ink hover:underline">
              See the full accuracy report →
            </Link>
            {updated && <span className="text-xs text-muted">Data as of {updated}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
