"use client";

import { useCallback, useMemo, useState } from "react";
import SuperBowlAnimation from "@/components/SuperBowlAnimation";
import type { DriveEvent } from "@/lib/types";
import { eventsFromDrives, gameFromScore } from "@/lib/superBowlGame";

/**
 * A Replay button for a regular-season game that has been played. With real drives (from play-by-play) it retells the game
 * as it happened; without them the final score is real and the drives are made up to match it.
 */
export default function GameReplay({
  home,
  away,
  homeScore,
  awayScore,
  week,
  drives,
}: {
  home: string;
  away: string;
  homeScore: number;
  awayScore: number;
  week: number;
  drives?: DriveEvent[];
}) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const result = useMemo(() => {
    const tie = homeScore === awayScore;
    const homeWon = homeScore >= awayScore; // in a tie the home team is just drawn as the first side
    return {
      home,
      away,
      winner: homeWon ? home : away,
      tie,
      events: drives
        ? eventsFromDrives(drives, homeWon)
        : gameFromScore(Math.max(homeScore, awayScore), Math.min(homeScore, awayScore)),
      title: `WEEK ${week}`,
      isSuperBowl: false,
      realGame: true,
      realDrives: !!drives,
    };
  }, [home, away, homeScore, awayScore, week, drives]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="font-display bg-head px-2.5 py-1 text-base text-strong ring-1 ring-line hover:bg-hover"
        aria-label={`Watch the replay of week ${week}: ${away} at ${home}`}
      >
        ▶ Replay
      </button>
      {open && <SuperBowlAnimation result={result} onClose={close} />}
    </>
  );
}
