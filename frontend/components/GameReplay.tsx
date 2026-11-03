"use client";

import { useCallback, useMemo, useState } from "react";
import SuperBowlAnimation from "@/components/SuperBowlAnimation";
import { gameFromScore } from "@/lib/superBowlGame";

/** A Replay button for a regular-season game that has been played. The final score is real; the drives are made up to match it. */
export default function GameReplay({
  home,
  away,
  homeScore,
  awayScore,
  week,
}: {
  home: string;
  away: string;
  homeScore: number;
  awayScore: number;
  week: number;
}) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const result = useMemo(() => {
    const homeWon = homeScore > awayScore;
    return {
      home,
      away,
      winner: homeWon ? home : away,
      events: gameFromScore(Math.max(homeScore, awayScore), Math.min(homeScore, awayScore)),
      title: `WEEK ${week}`,
      isSuperBowl: false,
      realGame: true,
    };
  }, [home, away, homeScore, awayScore, week]);

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
