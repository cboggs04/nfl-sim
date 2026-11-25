"use client";

import { pct } from "@/components/ProbCell";
import { teamInfo } from "@/lib/teams";
import type { LiveGame, ScoreGame, TeamOdds } from "@/lib/types";

// Shared by the scores list (ScoresBoard) and a game's own page (GameView).

export type Status = "upcoming" | "live" | "final";

/** A game with the scoreboard feed folded in: the feed's score wins until nflverse records the result. */
export interface Shown {
  g: ScoreGame;
  feed: LiveGame | null; // ESPN scoreboard entry (records, TV, leaders; score and clock while live)
  status: Status;
  homeScore: number | null;
  awayScore: number | null;
  pHome: number; // live in-game probability while on, else the model's pregame one
}

export function combine(g: ScoreGame, feed: LiveGame | undefined): Shown {
  const f = feed ?? null;
  if (g.played || !f || f.state === "pre") {
    return { g, feed: f, status: g.played ? "final" : "upcoming", homeScore: g.home_score, awayScore: g.away_score, pHome: g.p_home };
  }
  return { g, feed: f, status: f.state === "post" ? "final" : "live", homeScore: f.home_score, awayScore: f.away_score, pHome: f.p_home_live ?? g.p_home };
}

export const recordOf = (o: TeamOdds | undefined) => (o ? `${o.record.wins}-${o.record.losses}${o.record.ties ? `-${o.record.ties}` : ""}` : null);

export function OddsBar({ away, home, pHome, label }: { away: string; home: string; pHome: number; label: string }) {
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

