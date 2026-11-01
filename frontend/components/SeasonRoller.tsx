"use client";

import { useState } from "react";
import TeamLogo from "@/components/TeamLogo";

export interface RemainingGame {
  game_id: string;
  week: number;
  opponent: string;
  home: boolean;
  neutral: boolean;
  p_win: number;
}

/**
 * Plays out the rest of the season once, using each game's win probability, so you can
 * see how much one realistic season varies. Each click is one random draw; the real
 * model does the same thing 20,000 times.
 */
export default function SeasonRoller({
  games,
  wins,
  losses,
  ties,
  likelyWins,
}: {
  games: RemainingGame[];
  wins: number;
  losses: number;
  ties: number;
  likelyWins: number;
}) {
  // Nothing is rolled on first render (random numbers differ between server and browser).
  const [outcomes, setOutcomes] = useState<boolean[] | null>(null);
  const [history, setHistory] = useState<number[]>([]);

  function roll() {
    const result = games.map((g) => Math.random() < g.p_win);
    setOutcomes(result);
    setHistory((h) => [result.filter(Boolean).length + wins, ...h].slice(0, 8));
  }

  const finalWins = outcomes ? wins + outcomes.filter(Boolean).length : 0;
  const finalLosses = outcomes ? losses + outcomes.filter((w) => !w).length : 0;
  const recordText = `${finalWins}-${finalLosses}${ties ? `-${ties}` : ""}`;
  const diff = finalWins - likelyWins;

  if (!games.length) return null;

  return (
    <section className="panel mt-6 p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="max-w-2xl">
          <h2 className="font-display text-4xl text-white">Play out the season</h2>
          <p className="mt-1 text-sm text-muted">
            Each click randomly decides every remaining game using its win probability. Run it a few times to see how much
            one season can vary.
          </p>
        </div>
        <button onClick={roll} className="btn btn-gold text-xl">
          {outcomes ? "Simulate again" : "Simulate one season"}
        </button>
      </div>

      {outcomes && (
        <div className="mt-5" aria-live="polite">
          <div className="flex flex-wrap items-baseline gap-x-4">
            <span className="font-display text-7xl text-white tabular-nums">{recordText}</span>
            <span className="text-sm text-muted">
              {diff === 0
                ? "exactly the most likely finish"
                : `${Math.abs(diff)} ${Math.abs(diff) === 1 ? "win" : "wins"} ${diff > 0 ? "better" : "worse"} than the most likely finish`}
            </span>
          </div>
          <ul className="mt-4 flex flex-wrap gap-2">
            {games.map((g, i) => (
              <li
                key={g.game_id}
                className="flex items-center gap-2 rounded bg-black/30 py-1.5 pr-3 pl-1.5 text-xs ring-1 ring-line"
                title={`Week ${g.week}: ${g.neutral || g.home ? "vs" : "@"} ${g.opponent} (${Math.round(g.p_win * 100)}% to win)`}
              >
                <span
                  className={`font-display inline-flex h-8 w-8 items-center justify-center rounded text-lg text-white ${
                    outcomes[i] ? "bg-good" : "bg-bad"
                  }`}
                  aria-label={outcomes[i] ? "Win" : "Loss"}
                >
                  {outcomes[i] ? "W" : "L"}
                </span>
                <span className="font-semibold text-muted tabular-nums">Wk {g.week}</span>
                <TeamLogo abbr={g.opponent} size={30} />
              </li>
            ))}
          </ul>
          {history.length > 1 && (
            <p className="mt-4 text-sm text-muted">
              Your runs so far (wins): <span className="font-semibold text-white tabular-nums">{history.join(", ")}</span>
            </p>
          )}
        </div>
      )}
    </section>
  );
}
