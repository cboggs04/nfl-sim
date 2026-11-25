"use client";

import { useEffect, useRef, useState } from "react";
import GameDetailPanel from "@/components/GameDetailPanel";
import { LiveDot } from "@/components/LiveSchedule";
import { pct } from "@/components/ProbCell";
import TeamLogo from "@/components/TeamLogo";
import { teamInfo } from "@/lib/teams";
import { kickoffDay, kickoffDayKey, kickoffTime } from "@/lib/time";
import type { GameLeader, GamesResponse, LiveGame, ScoreGame, TeamOdds } from "@/lib/types";
import { liveStatus, useLive } from "@/lib/useLive";

type Status = "upcoming" | "live" | "final";

/** A game with the scoreboard feed folded in: the feed's score wins until nflverse records the result. */
interface Shown {
  g: ScoreGame;
  feed: LiveGame | null; // ESPN scoreboard entry (records, TV, leaders; score and clock while live)
  status: Status;
  homeScore: number | null;
  awayScore: number | null;
  pHome: number; // live in-game probability while on, else the model's pregame one
}

function combine(g: ScoreGame, feed: LiveGame | undefined): Shown {
  const f = feed ?? null;
  if (g.played || !f || f.state === "pre") {
    return { g, feed: f, status: g.played ? "final" : "upcoming", homeScore: g.home_score, awayScore: g.away_score, pHome: g.p_home };
  }
  return { g, feed: f, status: f.state === "post" ? "final" : "live", homeScore: f.home_score, awayScore: f.away_score, pHome: f.p_home_live ?? g.p_home };
}

const recordOf = (o: TeamOdds | undefined) => (o ? `${o.record.wins}-${o.record.losses}${o.record.ties ? `-${o.record.ties}` : ""}` : null);

function TeamRow({ abbr, record, score, state, hasBall }: { abbr: string; record: string | null; score: number | null; state: "won" | "lost" | "none"; hasBall: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <TeamLogo abbr={abbr} size={28} />
      <div className={`min-w-0 flex-1 truncate ${state === "lost" ? "text-muted" : "text-strong"}`}>
        <span className="font-semibold sm:hidden">{teamInfo(abbr).name.split(" ").pop()}</span>
        <span className="hidden font-semibold sm:inline">{teamInfo(abbr).name}</span>
        {record && <span className="ml-2 text-xs text-muted tabular-nums">{record}</span>}
      </div>
      {hasBall && (
        <span className="text-[10px] text-accent-ink" title="Has the ball">
          ◆<span className="sr-only">has the ball</span>
        </span>
      )}
      <span className={`font-display w-9 text-right text-[1.7rem] leading-none tabular-nums ${state === "lost" ? "text-muted" : "text-strong"}`}>{score ?? ""}</span>
      <span className={`w-2 text-xs text-strong ${state === "won" ? "" : "invisible"}`} aria-hidden>
        ◂
      </span>
    </div>
  );
}

function OddsBar({ away, home, pHome, label }: { away: string; home: string; pHome: number; label: string }) {
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
      <div className="mt-1 flex h-1.5 gap-0.5 overflow-hidden rounded-full" role="img" aria-label={`${label}: ${away} ${pct(1 - pHome)}, ${home} ${pct(pHome)}`}>
        <div className="h-full rounded-l-full transition-[width] duration-700" style={{ width: `${(1 - pHome) * 100}%`, backgroundColor: teamInfo(away).primary }} />
        <div className="h-full flex-1 rounded-r-full" style={{ backgroundColor: teamInfo(home).primary }} />
      </div>
    </div>
  );
}

function LeaderLines({ leaders }: { leaders: GameLeader[] }) {
  return (
    <ul className="flex flex-col gap-1 text-xs">
      {leaders.map((l) => (
        <li key={l.category} className="flex min-w-0 gap-2">
          <span className="w-9 shrink-0 font-semibold tracking-wider text-muted">{l.category}</span>
          <span className="min-w-0 truncate">
            <span className="font-semibold text-strong">{l.name}</span> <span className="text-muted">{l.team}</span>{" "}
            <span className="text-muted tabular-nums">{l.line}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

function GameRow({ s, odds, open, onToggle }: { s: Shown; odds: Record<string, TeamOdds>; open: boolean; onToggle: () => void }) {
  const { g, feed, status, homeScore, awayScore, pHome } = s;
  const done = status === "final";
  const winner = done && homeScore != null && awayScore != null && homeScore !== awayScore ? (homeScore > awayScore ? g.home : g.away) : null;
  const fav = g.p_home >= 0.5 ? g.home : g.away;
  const ot = (feed && feed.period > 4) || g.overtime;
  const leaders = feed?.leaders ?? [];
  const rowState = (t: string) => (!winner ? "none" : winner === t ? "won" : "lost");
  const panelId = `game-${g.game_id}`;

  const info =
    status === "live" ? (
      <div className="flex flex-col gap-2">
        {feed?.down_distance && (
          <div className="text-xs text-muted">
            <span className="font-semibold text-strong">{feed.possession}</span> · {feed.down_distance}
            {feed.red_zone && <span className="ml-2 rounded bg-bad/15 px-1.5 py-0.5 font-semibold text-bad-ink">Red zone</span>}
          </div>
        )}
        <OddsBar away={g.away} home={g.home} pHome={pHome} label="Live win prob." />
      </div>
    ) : done ? (
      leaders.length > 0 ? (
        <LeaderLines leaders={leaders} />
      ) : (
        <OddsBar away={g.away} home={g.home} pHome={g.p_home} label="Model before kickoff" />
      )
    ) : (
      <div className="flex flex-col gap-2">
        <OddsBar away={g.away} home={g.home} pHome={g.p_home} label="Model win prob." />
        {feed?.venue && <div className="truncate text-xs text-muted">{feed.venue}</div>}
      </div>
    );

  return (
    <article className={`panel overflow-hidden transition-shadow ${status === "live" ? "ring-1 ring-bad/40" : ""} ${open ? "ring-1 ring-accent/50" : ""}`}>
      <button
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panelId}
        className="grid w-full grid-cols-[1fr_auto] items-center gap-x-4 gap-y-3 p-4 text-left hover:bg-hover md:grid-cols-[minmax(0,22rem)_8rem_minmax(0,1fr)_auto]"
      >
        <div className="flex flex-col gap-2">
          <TeamRow abbr={g.away} record={feed?.away_record ?? recordOf(odds[g.away])} score={awayScore} state={rowState(g.away)} hasBall={status === "live" && feed?.possession === g.away} />
          <TeamRow abbr={g.home} record={feed?.home_record ?? recordOf(odds[g.home])} score={homeScore} state={rowState(g.home)} hasBall={status === "live" && feed?.possession === g.home} />
        </div>

        <div className="flex flex-col items-end gap-0.5 text-right text-xs md:items-start md:border-l md:border-line/60 md:pl-4 md:text-left">
          {status === "live" && feed ? (
            <span className="inline-flex items-center gap-1.5 font-bold tracking-wider text-bad-ink uppercase">
              <LiveDot /> {liveStatus(feed)}
            </span>
          ) : done ? (
            <>
              <span className="font-bold tracking-wider text-strong uppercase">Final{ot ? "/OT" : ""}</span>
              {winner && (
                <span className={winner === fav ? "text-good-ink" : "text-bad-ink"} title={`The model gave ${fav} ${pct(Math.max(g.p_home, 1 - g.p_home))} before kickoff`}>
                  {winner === fav ? "✓ Model pick" : "✗ Upset"}
                </span>
              )}
              {!g.played && <span className="text-muted">Not in model yet</span>}
            </>
          ) : (
            <>
              <span className="font-bold text-strong">{g.kickoff ? kickoffTime(g.kickoff) : "TBD"}</span>
              {feed?.broadcast && <span className="text-muted">{feed.broadcast}</span>}
            </>
          )}
        </div>

        <div className="col-span-2 min-w-0 md:col-span-1">{info}</div>

        <svg className={`hidden h-4 w-4 text-muted transition-transform md:block ${open ? "rotate-180" : ""}`} viewBox="0 0 20 20" fill="currentColor" aria-hidden>
          <path d="M5.3 7.3a1 1 0 0 1 1.4 0L10 10.6l3.3-3.3a1 1 0 1 1 1.4 1.4l-4 4a1 1 0 0 1-1.4 0l-4-4a1 1 0 0 1 0-1.4z" />
        </svg>
      </button>
      {open && (
        <div id={panelId} className="border-t border-line/70 bg-background/40">
          <GameDetailPanel game={g} live={status === "live"} leaders={leaders} odds={odds} pHome={pHome} />
        </div>
      )}
    </article>
  );
}

/** "Nov 19–23" for a week's games. */
function weekDates(games: ScoreGame[]) {
  const ks = games.map((g) => g.kickoff).filter((k): k is string => !!k).sort();
  if (!ks.length) return "";
  const f = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric" });
  const a = f.format(new Date(ks[0]));
  const b = f.format(new Date(ks[ks.length - 1]));
  if (a === b) return a;
  return a.split(" ")[0] === b.split(" ")[0] ? `${a}–${b.split(" ")[1]}` : `${a}–${b}`;
}

/** This week's games and scores (live while they're on), ESPN-style, with a week strip and click-to-expand game details. */
export default function ScoresBoard({ data, teams, initialWeek, initialGame }: { data: GamesResponse; teams: TeamOdds[]; initialWeek: number; initialGame?: string }) {
  const weeks = [...new Set(data.games.map((g) => g.week))].sort((a, b) => a - b);
  const [week, setWeekState] = useState(weeks.includes(initialWeek) ? initialWeek : data.current_week);
  const [openId, setOpenId] = useState<string | null>(initialGame ?? null);
  const odds = Object.fromEntries(teams.map((t) => [t.team, t]));
  const stripRef = useRef<HTMLDivElement>(null);

  const syncUrl = (w: number, game: string | null) => {
    const url = new URL(window.location.href);
    url.searchParams.set("week", String(w));
    if (game) url.searchParams.set("game", game);
    else url.searchParams.delete("game");
    window.history.replaceState(null, "", url); // shareable link; Next keeps its router in sync
  };
  const setWeek = (w: number) => {
    setWeekState(w);
    setOpenId(null);
    syncUrl(w, null);
  };
  const toggle = (id: string) => {
    const next = openId === id ? null : id;
    setOpenId(next);
    syncUrl(week, next);
  };

  // Keep the selected week in view in the strip.
  useEffect(() => {
    const el = stripRef.current?.querySelector<HTMLElement>(`[data-week="${week}"]`);
    el?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }, [week]);

  const games = data.games.filter((g) => g.week === week);
  const open = games.filter((g) => !g.played);
  const live = useLive(
    open.map((g) => g.kickoff),
    week <= data.current_week + 1,
    { week: week === data.current_week ? undefined : week, once: true },
  );
  const shown = games.map((g) => combine(g, live.games[g.game_id]));

  // Group by Eastern calendar day, in kickoff order (live games first within a day).
  const days: { key: string; label: string; games: Shown[] }[] = [];
  for (const s of shown) {
    const key = s.g.kickoff ? kickoffDayKey(s.g.kickoff) : "tbd";
    let day = days.find((d) => d.key === key);
    if (!day) days.push((day = { key, label: s.g.kickoff ? kickoffDay(s.g.kickoff) : "Date to be announced", games: [] }));
    day.games.push(s);
  }
  for (const d of days) d.games.sort((x, y) => (x.status === "live" ? 0 : 1) - (y.status === "live" ? 0 : 1) || (x.g.kickoff ?? "").localeCompare(y.g.kickoff ?? ""));

  const nLive = shown.filter((s) => s.status === "live").length;
  const decided = shown.filter((s) => s.status === "final" && s.homeScore !== s.awayScore);
  const right = decided.filter((s) => (s.g.p_home >= 0.5) === ((s.homeScore ?? 0) > (s.awayScore ?? 0))).length;

  return (
    <div>
      <nav aria-label="Weeks" className="panel-flat flex items-stretch overflow-hidden">
        <button className="px-2 text-xl text-muted hover:bg-hover hover:text-strong disabled:opacity-30" onClick={() => setWeek(week - 1)} disabled={week <= weeks[0]} aria-label="Previous week">
          ‹
        </button>
        <div ref={stripRef} className="flex flex-1 snap-x overflow-x-auto [scrollbar-width:none]">
          {weeks.map((w) => {
            const sel = w === week;
            return (
              <button
                key={w}
                data-week={w}
                onClick={() => setWeek(w)}
                aria-current={sel ? "true" : undefined}
                className={`relative flex min-w-24 shrink-0 snap-center flex-col items-center px-3 py-2 ${sel ? "text-strong" : "text-muted hover:bg-hover hover:text-strong"}`}
              >
                <span className="font-display text-lg leading-tight">Week {w}</span>
                <span className="text-[11px]">{weekDates(data.games.filter((g) => g.week === w))}</span>
                {w === data.current_week && !sel && <span className="absolute top-1.5 right-2 h-1.5 w-1.5 rounded-full bg-accent" aria-label="this week" />}
                {sel && <span className="absolute inset-x-3 bottom-0 h-[3px] rounded-t bg-accent" />}
              </button>
            );
          })}
        </div>
        <button className="px-2 text-xl text-muted hover:bg-hover hover:text-strong disabled:opacity-30" onClick={() => setWeek(week + 1)} disabled={week >= weeks[weeks.length - 1]} aria-label="Next week">
          ›
        </button>
      </nav>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm text-muted">
        <span>
          {nLive > 0 && (
            <span className="mr-3 inline-flex items-center gap-1.5 font-semibold text-bad-ink">
              <LiveDot /> {nLive} live{live.source === "demo" && " (demo)"}
            </span>
          )}
          {decided.length > 0 ? (
            <>
              Model picks this week: <span className="font-semibold text-strong">{right}-{decided.length - right}</span>
            </>
          ) : (
            `${games.length} games`
          )}
        </span>
        {week !== data.current_week ? (
          <button className="font-semibold text-accent-ink hover:underline" onClick={() => setWeek(data.current_week)}>
            Back to this week
          </button>
        ) : (
          <span className="hidden sm:inline">Click a game for details</span>
        )}
      </div>

      {days.map((d) => (
        <section key={d.key} className="mt-6">
          <h2 className="mb-2 border-b border-line pb-1.5 text-xs font-semibold tracking-widest text-muted uppercase">{d.label}</h2>
          <div className="flex flex-col gap-3">
            {d.games.map((s) => (
              <GameRow key={s.g.game_id} s={s} odds={odds} open={openId === s.g.game_id} onToggle={() => toggle(s.g.game_id)} />
            ))}
          </div>
        </section>
      ))}

      <p className="mt-10 max-w-3xl text-xs text-muted">
        Scores, records, leaders and box scores come from ESPN&apos;s public feed (live games refresh about every 30 seconds). Win probabilities are this site&apos;s model:
        pregame odds from team ratings, and live odds that move with the score, time left and who has the ball. A finished game counts in the model&apos;s standings once
        the next data refresh records it. Times are Eastern.
      </p>
    </div>
  );
}
