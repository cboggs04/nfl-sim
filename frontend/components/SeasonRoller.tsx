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
    <section className="mt-6 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">Play out the rest of the season</h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Each click randomly decides every remaining game using its win probability. Run it a few times to see how much
            one season can vary.
          </p>
        </div>
        <button
          onClick={roll}
          className="rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600"
        >
          {outcomes ? "Simulate again" : "Simulate one season"}
        </button>
      </div>

      {outcomes && (
        <div className="mt-4" aria-live="polite">
          <div className="flex flex-wrap items-baseline gap-x-3">
            <span className="text-3xl font-semibold tabular-nums">{recordText}</span>
            <span className="text-sm text-zinc-500 dark:text-zinc-400">
              {diff === 0
                ? "exactly the most likely finish"
                : `${Math.abs(diff)} ${Math.abs(diff) === 1 ? "win" : "wins"} ${diff > 0 ? "better" : "worse"} than the most likely finish`}
            </span>
          </div>
          <ul className="mt-3 flex flex-wrap gap-2">
            {games.map((g, i) => (
              <li
                key={g.game_id}
                className="flex items-center gap-1.5 rounded-md border border-zinc-200 py-1 pr-2 pl-1.5 text-xs dark:border-zinc-700"
                title={`Week ${g.week}: ${g.neutral || g.home ? "vs" : "@"} ${g.opponent} (${Math.round(g.p_win * 100)}% to win)`}
              >
                <span
                  className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold text-white ${
                    outcomes[i] ? "bg-emerald-600" : "bg-rose-600"
                  }`}
                  aria-label={outcomes[i] ? "Win" : "Loss"}
                >
                  {outcomes[i] ? "W" : "L"}
                </span>
                <span className="text-zinc-500 tabular-nums dark:text-zinc-400">Wk {g.week}</span>
                <TeamLogo abbr={g.opponent} size={20} />
              </li>
            ))}
          </ul>
          {history.length > 1 && (
            <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
              Your runs so far (wins): <span className="tabular-nums text-zinc-700 dark:text-zinc-200">{history.join(", ")}</span>
            </p>
          )}
        </div>
      )}
    </section>
  );
}
