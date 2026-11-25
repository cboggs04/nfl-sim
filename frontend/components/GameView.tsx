"use client";

import Link from "next/link";
import GameDetailPanel from "@/components/GameDetailPanel";
import { LiveDot } from "@/components/LiveSchedule";
import { pct } from "@/components/ProbCell";
import { combine, OddsBar, recordOf } from "@/components/scoreParts";
import TeamLogo from "@/components/TeamLogo";
import { teamInfo } from "@/lib/teams";
import { kickoffDay, kickoffTime } from "@/lib/time";
import type { ScoreGame, TeamOdds } from "@/lib/types";
import { liveStatus, useDemo, useLive } from "@/lib/useLive";

function Side({ abbr, record, align, dim }: { abbr: string; record: string | null; align: "left" | "right"; dim: boolean }) {
  const info = teamInfo(abbr);
  return (
    <Link
      href={`/teams/${abbr}`}
      className={`group flex min-w-0 flex-col items-center gap-1 text-center sm:flex-row sm:gap-4 ${align === "right" ? "sm:flex-row-reverse sm:text-right" : "sm:text-left"}`}
    >
      <span className="sm:hidden">
        <TeamLogo abbr={abbr} size={44} />
      </span>
      <span className="hidden sm:block">
        <TeamLogo abbr={abbr} size={72} />
      </span>
      <span className="min-w-0">
        <span className={`font-display block truncate text-2xl leading-tight group-hover:text-accent-ink sm:text-3xl ${dim ? "text-muted" : "text-strong"}`}>
          <span className="sm:hidden">{abbr}</span>
          <span className="hidden sm:inline">{info.name}</span>
        </span>
        {record && <span className="block text-xs whitespace-nowrap text-muted tabular-nums sm:text-sm">{record}</span>}
      </span>
    </Link>
  );
}

/** One game's own page: an ESPN-style scoreboard header, then the Summary / Box score / Team stats tabs (or the matchup preview). */
export default function GameView({ game, teams, currentWeek }: { game: ScoreGame; teams: TeamOdds[]; currentWeek: number }) {
  const odds = Object.fromEntries(teams.map((t) => [t.team, t]));
  const demo = useDemo(); // keep ?demo=1 on links, so the demo carries on across pages

  const live = useLive([game.kickoff], true, { week: game.week === currentWeek ? undefined : game.week, once: true });
  const s = combine(game, live.games[game.game_id]);
  const { feed, status, homeScore, awayScore, pHome } = s;
  const done = status === "final";
  const winner = done && homeScore != null && awayScore != null && homeScore !== awayScore ? (homeScore > awayScore ? game.home : game.away) : null;
  const fav = game.p_home >= 0.5 ? game.home : game.away;
  const ot = (feed && feed.period > 4) || game.overtime;
  const back = `/scores?week=${game.week}${demo ? "&demo=1" : ""}`;
  const info = (t: string) => teamInfo(t);

  return (
    <>
      <Link href={back} className="inline-flex items-center gap-2 text-sm font-semibold tracking-widest text-muted uppercase hover:text-strong">
        <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
          <path d="M12.7 5.3a1 1 0 0 1 0 1.4L9.4 10l3.3 3.3a1 1 0 1 1-1.4 1.4l-4-4a1 1 0 0 1 0-1.4l4-4a1 1 0 0 1 1.4 0z" />
        </svg>
        All games · Week {game.week}
      </Link>

      <header
        className="panel relative mt-4 overflow-hidden"
        style={{ backgroundImage: `linear-gradient(100deg, ${info(game.away).primary}26 0%, transparent 38%, transparent 62%, ${info(game.home).primary}26 100%)` }}
      >
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 p-4 sm:gap-6 sm:p-8">
          <Side abbr={game.away} record={feed?.away_record ?? recordOf(odds[game.away])} align="left" dim={winner === game.home} />

          <div className="flex flex-col items-center gap-1 text-center">
            {status === "upcoming" ? (
              <>
                <span className="font-display text-3xl text-strong sm:text-4xl">{game.kickoff ? kickoffTime(game.kickoff) : "TBD"}</span>
                {game.kickoff && <span className="text-xs text-muted sm:text-sm">{kickoffDay(game.kickoff)}</span>}
                {feed?.broadcast && <span className="text-xs text-muted">{feed.broadcast}</span>}
              </>
            ) : (
              <>
                <span className="font-display flex items-baseline gap-3 text-5xl leading-none tabular-nums sm:gap-5 sm:text-7xl">
                  <span className={winner === game.home ? "text-muted" : "text-strong"}>{awayScore}</span>
                  <span className="text-2xl text-muted sm:text-3xl">–</span>
                  <span className={winner === game.away ? "text-muted" : "text-strong"}>{homeScore}</span>
                </span>
                {status === "live" && feed ? (
                  <span className="mt-1 inline-flex items-center gap-1.5 text-xs font-bold tracking-wider text-bad-ink uppercase sm:text-sm">
                    <LiveDot /> {liveStatus(feed)}
                    {live.source === "demo" && " (demo)"}
                  </span>
                ) : (
                  <span className="mt-1 text-xs font-bold tracking-wider text-strong uppercase sm:text-sm">Final{ot ? "/OT" : ""}</span>
                )}
                {winner && (
                  <span className={`text-xs ${winner === fav ? "text-good-ink" : "text-bad-ink"}`}>
                    {winner === fav ? "✓ Model pick" : "✗ Upset"} · model had {fav} {pct(Math.max(game.p_home, 1 - game.p_home))}
                  </span>
                )}
                {done && !game.played && <span className="text-xs text-muted">Not in the model&apos;s standings yet</span>}
              </>
            )}
          </div>

          <Side abbr={game.home} record={feed?.home_record ?? recordOf(odds[game.home])} align="right" dim={winner === game.away} />
        </div>

        <div className="border-t border-line/60 px-4 py-3 sm:px-8">
          {status === "live" && feed?.down_distance && (
            <div className="mb-2 text-center text-xs text-muted">
              <span className="font-semibold text-strong">{feed.possession}</span> ball · {feed.down_distance}
              {feed.red_zone && <span className="ml-2 rounded bg-bad/15 px-1.5 py-0.5 font-semibold text-bad-ink">Red zone</span>}
            </div>
          )}
          <OddsBar
            away={game.away}
            home={game.home}
            pHome={status === "live" ? pHome : game.p_home}
            label={status === "live" ? "Live win probability" : done ? "Model before kickoff" : "Model win probability"}
          />
        </div>
      </header>

      <section className="panel mt-6 overflow-hidden" aria-label="Game details">
        <GameDetailPanel game={game} live={status === "live"} leaders={feed?.leaders ?? []} odds={odds} pHome={pHome} />
      </section>
    </>
  );
}
