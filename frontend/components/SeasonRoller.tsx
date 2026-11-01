"use client";

import TeamLogo from "@/components/TeamLogo";
import { useTeamSim } from "@/components/TeamSim";

export interface RemainingGame {
  game_id: string;
  week: number;
  opponent: string;
  home: boolean;
  neutral: boolean;
  p_win: number;
}

/**
 * Plays out the rest of the season once, using each game's win probability, so you can see how much one
 * realistic season varies. The same button (and the same result) drives the Roster tab's player stats.
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
  const { sim, loading, error, run, history } = useTeamSim();

  if (!games.length) return null;

  const winById = new Map(sim?.games.map((g) => [g.game_id, g.win]));
  const outcomes = sim ? games.map((g) => winById.get(g.game_id) ?? false) : null;
  const simWins = outcomes ? outcomes.filter(Boolean).length : 0;
  const finalWins = wins + simWins;
  const finalLosses = outcomes ? losses + outcomes.length - simWins : 0;
  const recordText = `${finalWins}-${finalLosses}${ties ? `-${ties}` : ""}`;
  const diff = finalWins - likelyWins;

  return (
    <section className="panel mt-6 p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="max-w-2xl">
          <h2 className="font-display text-4xl text-strong">Play out the season</h2>
          <p className="mt-1 text-sm text-muted">
            Each click randomly decides every remaining game using its win probability, and every player&apos;s stats along with it
            (see the Roster tab). Run it a few times to see how much one season can vary.
          </p>
        </div>
        <button onClick={() => void run()} disabled={loading} className="btn btn-primary text-xl">
          {loading ? "Simulating…" : sim ? "Simulate again" : "Simulate one season"}
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-3 rounded-md bg-bad/15 px-4 py-2 text-sm text-bad-ink ring-1 ring-bad/40">
          {error}. Is the API running on port 8000?
        </p>
      )}

      {outcomes && (
        <div className="mt-5" aria-live="polite">
          <div className="flex flex-wrap items-baseline gap-x-4">
            <span className="font-display text-7xl text-strong tabular-nums">{recordText}</span>
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
                className="flex items-center gap-2 rounded bg-head py-1.5 pr-3 pl-1.5 text-xs ring-1 ring-line"
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
              Your runs so far (wins): <span className="font-semibold text-strong tabular-nums">{history.map((h) => h + wins).join(", ")}</span>
            </p>
          )}
        </div>
      )}
    </section>
  );
}
