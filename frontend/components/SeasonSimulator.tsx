"use client";

import { useMemo, useState } from "react";
import SectionNav from "@/components/SectionNav";
import { PositionSections, type View } from "@/components/PlayerTables";
import TeamLogo from "@/components/TeamLogo";
import { simulateTeam } from "@/lib/api";
import { UNITS } from "@/lib/roster";
import { teamInfo } from "@/lib/teams";
import type { SimTeamResult, TeamRoster } from "@/lib/types";

type Mode = "rest" | "full";

/**
 * A simulator for one team with two modes: play out the rest of the season from now (keeping results so far),
 * or replay the entire season from Week 1 as if none of it had happened. Either way the team's game results
 * drive its players' stats, shown in the same tables as the Roster tab.
 */
export default function SeasonSimulator({
  roster,
  color,
  wins,
  losses,
  ties,
  likelyWins,
}: {
  roster: TeamRoster;
  color: string;
  wins: number;
  losses: number;
  ties: number;
  likelyWins: number; // the single most common win total in the big Monte Carlo
}) {
  const [mode, setMode] = useState<Mode>("rest");
  const [result, setResult] = useState<{ mode: Mode; data: SimTeamResult } | null>(null);
  const [history, setHistory] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unit, setUnit] = useState<string>(UNITS[0].key); // Offense first
  const [picked, setPicked] = useState<View>("current"); // what you chose; a fresh simulation shows itself until you choose again
  const [pickedSince, setPickedSince] = useState(false);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const data = await simulateTeam(roster.team, mode);
      setResult({ mode, data });
      setPickedSince(false);
      const w = data.games.filter((g) => g.win).length;
      setHistory((h) => [(mode === "rest" ? wins : 0) + w, ...h].slice(0, 8));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  const total = roster.team_games_played + roster.games_remaining;
  const modes: { key: Mode; title: string; blurb: string }[] = [
    {
      key: "rest",
      title: "Rest of season",
      blurb: `Keep the real results so far (${wins}-${losses}${ties ? `-${ties}` : ""}) and play out the ${roster.games_remaining} games still to come.`,
    },
    {
      key: "full",
      title: "Full season",
      blurb: `Ignore what has happened and replay all ${total} games from Week 1, using today's team ratings and every player's current per-game rates.`,
    },
  ];

  const sim = result?.data ?? null;
  const simWins = sim ? sim.games.filter((g) => g.win).length : 0;
  const simLosses = sim ? sim.games.length - simWins : 0;
  const finalWins = result?.mode === "rest" ? wins + simWins : simWins;
  const finalLosses = result?.mode === "rest" ? losses + simLosses : simLosses;
  const finalRecord = `${finalWins}-${finalLosses}${result?.mode === "rest" && ties ? `-${ties}` : ""}`;
  const diff = finalWins - likelyWins;
  const realPlayed = result?.mode === "full" ? (sim?.games.filter((g) => g.played) ?? []) : [];
  const realWins = realPlayed.filter((g) => g.actual_win).length;
  const flipped = realPlayed.filter((g) => g.actual_win !== null && g.actual_win !== g.win).length;

  const view: View = result && !pickedSince ? "simulated" : picked === "simulated" && !result ? "current" : picked;
  const views: { key: View; label: string; disabled?: boolean }[] = [
    { key: "current", label: "So far" },
    { key: "projected", label: "Projected final" },
    { key: "simulated", label: "Simulated season", disabled: !result },
  ];
  const showDelta = view !== "simulated" || result?.mode === "rest";

  const simStats = useMemo(() => new Map(sim?.players.map((p) => [p.id, p.stats])), [sim]);
  const simGp = useMemo(() => new Map(sim?.players.map((p) => [p.id, p.gp])), [sim]);

  return (
    <div className="mt-4">
      {result && (
        <SectionNav
          className="mb-6"
          items={[
            { id: "sim-controls", label: "Simulator" },
            { id: "sim-results", label: "Results" },
            { id: "sim-players", label: "Players" },
          ]}
        />
      )}
      <section id="sim-controls" className="panel scroll-mt-32 p-5 sm:p-6">
        <h2 className="font-display text-4xl text-strong">Season simulator</h2>
        <p className="mt-1 max-w-3xl text-sm text-muted">
          Pick what to simulate, then click the button. Every game is decided by its win probability, and the players&apos; stats
          follow from those results, so a better season for the team means bigger numbers for its players. Run it a few times to
          see how much one season can vary.
        </p>
        <div role="radiogroup" aria-label="What to simulate" className="mt-4 grid gap-3 md:grid-cols-2">
          {modes.map((m) => (
            <button
              key={m.key}
              role="radio"
              aria-checked={mode === m.key}
              onClick={() => setMode(m.key)}
              className={`p-4 text-left ring-1 transition-colors ${mode === m.key ? "bg-accent/15 ring-accent" : "bg-head ring-line hover:bg-hover"}`}
            >
              <div className="font-display text-2xl text-strong">{m.title}</div>
              <div className="mt-1 text-sm text-muted">{m.blurb}</div>
            </button>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button onClick={() => void run()} disabled={loading || (mode === "rest" && roster.games_remaining === 0)} className="btn btn-primary text-xl">
            {loading ? "Simulating…" : sim ? "Simulate again" : mode === "rest" ? "Simulate rest of season" : "Simulate full season"}
          </button>
          {mode === "rest" && roster.games_remaining === 0 && <span className="text-sm text-muted">The season is over. Try the full season.</span>}
        </div>
        {error && (
          <p role="alert" className="mt-3 rounded-md bg-bad/15 px-4 py-2 text-sm text-bad-ink ring-1 ring-bad/40">
            {error}. The server may be waking up: wait a few seconds and try again.
          </p>
        )}
      </section>

      {sim && result && (
        <div id="sim-results" className="mt-6 scroll-mt-32" aria-live="polite">
          <section className="panel p-5 sm:p-6">
            <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
              <h3 className="font-display text-3xl text-strong">{result.mode === "rest" ? "Rest of season" : "Full season"}</h3>
              <span className="font-display text-7xl text-strong tabular-nums">{finalRecord}</span>
              <span className="text-sm text-muted">
                {result.mode === "rest"
                  ? `final record: ${wins}-${losses} so far + ${simWins}-${simLosses} simulated`
                  : realPlayed.length > 0
                    ? `Real record so far is ${realWins}-${realPlayed.length - realWins}; ${flipped} of those ${realPlayed.length} games came out differently here.`
                    : "simulated final record"}
                {" · "}
                {diff === 0
                  ? "exactly the most likely finish"
                  : `${Math.abs(diff)} ${Math.abs(diff) === 1 ? "win" : "wins"} ${diff > 0 ? "better" : "worse"} than the most likely finish`}
              </span>
            </div>
            <ul className="mt-4 flex flex-wrap gap-2">
              {sim.games.map((g) => {
                const differs = g.played && g.actual_win !== null && g.actual_win !== g.win;
                return (
                  <li
                    key={g.game_id}
                    className={`flex items-center gap-2 rounded bg-head py-1.5 pr-3 pl-1.5 text-xs ring-1 ${differs ? "ring-accent" : "ring-line"}`}
                    title={`Week ${g.week}: ${g.neutral || g.home ? "vs" : "@"} ${teamInfo(g.opponent).name} (${Math.round(g.p_win * 100)}% to win)${
                      g.played ? ` · really ${g.actual_win === null ? "tied" : g.actual_win ? "a win" : "a loss"}` : ""
                    }`}
                  >
                    <span className={`font-display inline-flex h-8 w-8 items-center justify-center rounded text-lg text-white ${g.win ? "bg-good" : "bg-bad"}`} aria-label={g.win ? "Win" : "Loss"}>
                      {g.win ? "W" : "L"}
                    </span>
                    <span className="font-semibold text-muted tabular-nums">Wk {g.week}</span>
                    <TeamLogo abbr={g.opponent} size={30} />
                    {g.played && g.actual_win !== null && (
                      <span className="text-[10px] text-muted" title="What really happened">
                        real: <b className={g.actual_win ? "text-good-ink" : "text-bad-ink"}>{g.actual_win ? "W" : "L"}</b>
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
            {result.mode === "full" && realPlayed.length > 0 && <p className="mt-3 text-xs text-muted">Games with a gold outline went differently than they really did.</p>}
            {history.length > 1 && (
              <p className="mt-3 text-sm text-muted">
                Your runs so far (wins): <span className="font-semibold text-strong tabular-nums">{history.join(", ")}</span>
              </p>
            )}
          </section>
        </div>
      )}

      {/* Players appear only once a season has been simulated. */}
      {result && (
        <>
          <h3 id="sim-players" className="font-display mt-8 scroll-mt-32 text-4xl text-strong">Roster &amp; player stats</h3>
          <div className="mt-3 flex flex-wrap items-center gap-2" role="group" aria-label="Which numbers to show">
            {views.map((v) => (
              <button
                key={v.key}
                disabled={v.disabled}
                aria-pressed={view === v.key}
                onClick={() => {
                  setPicked(v.key);
                  setPickedSince(true);
                }}
                className={`btn btn-sm text-lg ${view === v.key ? "btn-primary" : "btn-ghost"}`}
              >
                {v.label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-sm text-muted">
            {view === "current" && `Regular-season totals after ${roster.team_games_played} games.`}
            {view === "projected" &&
              `Each player's current total plus his per-game rate (blended with last season) × the chance he plays × ${roster.games_remaining} remaining games. Small gray numbers show what's still to come.`}
            {view === "simulated" &&
              (result?.mode === "rest"
                ? "Season totals: stats so far plus the simulated games. Small gray numbers show what was added."
                : "Season totals from the replayed season alone. Injured players are treated as healthy for a replay.")}
          </p>
          <div className="mt-3 flex gap-2" role="group" aria-label="Filter by unit">
            {UNITS.map((u) => u.key).map((u) => (
              <button key={u} onClick={() => setUnit(u)} aria-pressed={unit === u} className={`btn btn-sm text-lg ${unit === u ? "btn-primary" : "btn-ghost"}`}>
                {u}
              </button>
            ))}
          </div>
          <PositionSections roster={roster} color={color} unit={unit} view={view} simStats={simStats} simGp={simGp} showDelta={showDelta} />
        </>
      )}
    </div>
  );
}
