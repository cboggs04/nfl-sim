"use client";

import Link from "next/link";
import { useState } from "react";
import { LiveDot } from "@/components/LiveSchedule";
import { pct } from "@/components/ProbCell";
import TeamLogo from "@/components/TeamLogo";
import { teamInfo } from "@/lib/teams";
import { kickoffDay, kickoffDayKey, kickoffTime } from "@/lib/time";
import type { GamesResponse, LiveGame, ScoreGame } from "@/lib/types";
import { liveStatus, useLive } from "@/lib/useLive";

type Status = "upcoming" | "live" | "final";

/** A game with its live data folded in: the live feed wins until nflverse records the result. */
interface Shown {
  g: ScoreGame;
  live: LiveGame | null;
  status: Status;
  homeScore: number | null;
  awayScore: number | null;
  pHome: number; // live in-game probability while on, else the model's pregame one
}

function combine(g: ScoreGame, live: LiveGame | undefined): Shown {
  if (g.played || !live || live.state === "pre") {
    return { g, live: null, status: g.played ? "final" : "upcoming", homeScore: g.home_score, awayScore: g.away_score, pHome: g.p_home };
  }
  return {
    g,
    live,
    status: live.state === "post" ? "final" : "live",
    homeScore: live.home_score,
    awayScore: live.away_score,
    pHome: live.p_home_live ?? g.p_home,
  };
}

function TeamLine({ abbr, score, won, hasBall, lost }: { abbr: string; score: number | null; won: boolean; lost: boolean; hasBall: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <TeamLogo abbr={abbr} size={32} />
      <Link href={`/teams/${abbr}`} className={`min-w-0 flex-1 truncate font-semibold hover:text-accent-ink ${lost ? "text-muted" : "text-strong"}`}>
        <span className="sm:hidden">{abbr}</span>
        <span className="hidden sm:inline">{teamInfo(abbr).name}</span>
      </Link>
      {hasBall && (
        <span className="text-xs text-accent-ink" title="Has the ball" aria-label="Has the ball">
          ●
        </span>
      )}
      <span className={`font-display w-10 text-right text-3xl tabular-nums ${won ? "text-strong" : "text-muted"}`}>{score ?? ""}</span>
    </div>
  );
}

function GameCard({ s }: { s: Shown }) {
  const { g, live, status, homeScore, awayScore, pHome } = s;
  const done = status === "final";
  const homeWon = done && homeScore != null && awayScore != null && homeScore > awayScore;
  const awayWon = done && homeScore != null && awayScore != null && awayScore > homeScore;
  const fav = g.p_home >= 0.5 ? g.home : g.away;
  const favP = Math.max(g.p_home, 1 - g.p_home);
  const pickRight = done && homeScore !== awayScore ? (fav === g.home ? homeWon : awayWon) : null;
  const ot = (live && live.period > 4) || g.overtime;

  return (
    <article className={`panel flex flex-col gap-3 p-4 ${status === "live" ? "ring-1 ring-bad/40" : ""}`}>
      <div className="flex items-center justify-between text-xs font-semibold tracking-widest uppercase">
        {status === "live" && live ? (
          <span className="inline-flex items-center gap-1.5 text-bad-ink">
            <LiveDot /> {liveStatus(live)}
          </span>
        ) : status === "final" ? (
          <span className="text-strong">
            Final{ot ? "/OT" : ""}
            {live && <span className="ml-2 font-normal tracking-normal text-muted normal-case">(not yet in the model)</span>}
          </span>
        ) : (
          <span className="text-muted">{g.kickoff ? kickoffTime(g.kickoff) : "Time TBD"}</span>
        )}
        {g.neutral && <span className="text-muted normal-case">Neutral site</span>}
      </div>

      <div className="flex flex-col gap-2">
        <TeamLine abbr={g.away} score={awayScore} won={awayWon} lost={homeWon} hasBall={status === "live" && live?.possession === g.away} />
        <TeamLine abbr={g.home} score={homeScore} won={homeWon} lost={awayWon} hasBall={status === "live" && live?.possession === g.home} />
      </div>

      {status === "live" && live?.down_distance && (
        <div className="text-xs text-muted">
          {live.possession} ball · {live.down_distance}
          {live.red_zone && <span className="ml-2 rounded bg-bad/15 px-1.5 py-0.5 font-semibold text-bad-ink">Red zone</span>}
        </div>
      )}

      <WinBar away={g.away} home={g.home} pHome={status === "final" ? g.p_home : pHome} label={status === "live" ? "Live win probability" : status === "final" ? "Model before kickoff" : "Model win probability"} />

      {status === "live" && (
        <div className="text-xs text-muted">
          Before kickoff: {fav} {pct(favP)}
        </div>
      )}
      {pickRight != null && (
        <div className={`text-xs font-semibold ${pickRight ? "text-good-ink" : "text-bad-ink"}`}>
          {pickRight ? "✓" : "✗"} Model picked {fav} ({pct(favP)})
        </div>
      )}
    </article>
  );
}

function WinBar({ away, home, pHome, label }: { away: string; home: string; pHome: number; label: string }) {
  const a = teamInfo(away).primary;
  const h = teamInfo(home).primary;
  return (
    <div>
      <div className="flex justify-between text-xs text-muted">
        <span>
          {away} <span className="font-semibold text-strong tabular-nums">{pct(1 - pHome)}</span>
        </span>
        <span>{label}</span>
        <span>
          <span className="font-semibold text-strong tabular-nums">{pct(pHome)}</span> {home}
        </span>
      </div>
      <div className="mt-1 flex h-2 overflow-hidden rounded-full bg-gauge" role="img" aria-label={`${label}: ${away} ${pct(1 - pHome)}, ${home} ${pct(pHome)}`}>
        <div className="h-full transition-[width] duration-700" style={{ width: `${(1 - pHome) * 100}%`, backgroundColor: a }} />
        <div className="h-full flex-1" style={{ backgroundColor: h }} />
      </div>
    </div>
  );
}

const btn = "font-display rounded-md px-3 py-1 text-xl ring-1 ring-line hover:bg-hover disabled:opacity-40 disabled:hover:bg-transparent";

/** This week's games and scores (live while they're on), with a week picker for earlier and later weeks. */
export default function ScoresBoard({ data, initialWeek }: { data: GamesResponse; initialWeek: number }) {
  const weeks = [...new Set(data.games.map((g) => g.week))].sort((a, b) => a - b);
  const [week, setWeekState] = useState(weeks.includes(initialWeek) ? initialWeek : data.current_week);
  const setWeek = (w: number) => {
    setWeekState(w);
    const url = new URL(window.location.href);
    url.searchParams.set("week", String(w));
    window.history.replaceState(null, "", url); // shareable link; Next keeps its router in sync
  };

  const games = data.games.filter((g) => g.week === week);
  const open = games.filter((g) => !g.played);
  const live = useLive(
    open.map((g) => g.kickoff),
    open.length > 0 && week <= data.current_week + 1,
  );
  const shown = games.map((g) => combine(g, live.games[g.game_id]));

  // Group by Eastern calendar day, in kickoff order.
  const days: { key: string; label: string; games: Shown[] }[] = [];
  for (const s of shown) {
    const key = s.g.kickoff ? kickoffDayKey(s.g.kickoff) : "tbd";
    let day = days.find((d) => d.key === key);
    if (!day) days.push((day = { key, label: s.g.kickoff ? kickoffDay(s.g.kickoff) : "Date to be announced", games: [] }));
    day.games.push(s);
  }
  for (const d of days) d.games.sort((x, y) => (x.status === "live" ? 0 : 1) - (y.status === "live" ? 0 : 1) || (x.g.kickoff ?? "").localeCompare(y.g.kickoff ?? ""));

  const counts = { live: shown.filter((s) => s.status === "live").length, final: shown.filter((s) => s.status === "final").length };
  const decided = shown.filter((s) => s.status === "final" && s.homeScore !== s.awayScore);
  const right = decided.filter((s) => (s.g.p_home >= 0.5) === ((s.homeScore ?? 0) > (s.awayScore ?? 0))).length;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button className={btn} onClick={() => setWeek(week - 1)} disabled={week <= weeks[0]} aria-label="Previous week">
            ‹
          </button>
          <label className="sr-only" htmlFor="week-select">
            Week
          </label>
          <select
            id="week-select"
            value={week}
            onChange={(e) => setWeek(Number(e.target.value))}
            className="font-display rounded-md bg-panel px-3 py-1 text-2xl text-strong ring-1 ring-line"
          >
            {weeks.map((w) => (
              <option key={w} value={w}>
                Week {w}
                {w === data.current_week ? " (this week)" : ""}
              </option>
            ))}
          </select>
          <button className={btn} onClick={() => setWeek(week + 1)} disabled={week >= weeks[weeks.length - 1]} aria-label="Next week">
            ›
          </button>
          {week !== data.current_week && (
            <button className="ml-1 text-sm font-semibold text-accent-ink hover:underline" onClick={() => setWeek(data.current_week)}>
              This week
            </button>
          )}
        </div>
        <p className="text-sm text-muted">
          {counts.live > 0 && (
            <span className="mr-3 inline-flex items-center gap-1.5 font-semibold text-bad-ink">
              <LiveDot /> {counts.live} live{live.source === "demo" && " (demo)"}
            </span>
          )}
          {decided.length > 0 ? `Model picked ${right} of ${decided.length} winners` : `${games.length} games`}
          {counts.final > 0 && counts.final < games.length && ` · ${games.length - counts.final - counts.live} still to play`}
        </p>
      </div>

      {days.map((d) => (
        <section key={d.key} className="mt-8">
          <h2 className="font-display mb-3 text-3xl text-strong">{d.label}</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {d.games.map((s) => (
              <GameCard key={s.g.game_id} s={s} />
            ))}
          </div>
        </section>
      ))}

      <p className="mt-10 max-w-3xl text-xs text-muted">
        Live scores come from ESPN&apos;s public scoreboard and refresh about every 30 seconds while a game is on. Live win probability starts from the
        model&apos;s pregame odds and moves with the score, the time left and who has the ball. A finished game counts in the model&apos;s standings and odds
        once the next data refresh records it. Times are Eastern.
      </p>
    </div>
  );
}
