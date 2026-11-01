"use client";

import { useEffect, useState } from "react";
import { pct } from "@/components/ProbCell";
import TeamLogo from "@/components/TeamLogo";
import { getTeam, runWhatIf } from "@/lib/api";
import { teamInfo } from "@/lib/teams";
import type { GameView, SeasonResponse, TeamOdds } from "@/lib/types";

const PRESETS = [
  { label: "Big free-agent haul", delta: 50 },
  { label: "Star QB signed", delta: 80 },
  { label: "QB injured", delta: -80 },
  { label: "Rebuilding", delta: -40 },
];

const N_SIMS = 2000;

interface Forced {
  team: string;
  opponent: string;
  week: number;
  teamWins: boolean;
  homeWin: boolean; // what the API needs: did the game's home team win?
}

const signed = (n: number, digits = 0) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toFixed(digits)}`;

function Delta({ value, unit = "pts", digits = 1, noise = 1 }: { value: number; unit?: string; digits?: number; noise?: number }) {
  const small = Math.abs(value) < noise;
  const color = small ? "text-muted" : value > 0 ? "text-good-ink" : "text-bad-ink";
  return (
    <span className={`text-xs font-semibold tabular-nums ${color}`} title={small ? "Within simulation noise" : undefined}>
      {value === 0 ? "—" : `${value > 0 ? "▲" : "▼"} ${Math.abs(value).toFixed(digits)}${unit === "pts" ? "" : ` ${unit}`}`}
    </span>
  );
}

function TeamSelect({ value, onChange, teams }: { value: string; onChange: (t: string) => void; teams: TeamOdds[] }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-md border border-line bg-panel px-3 py-2 text-sm font-semibold text-strong"
    >
      {teams.map((t) => (
        <option key={t.team} value={t.team}>
          {t.name}
        </option>
      ))}
    </select>
  );
}

export default function WhatIfSandbox({ baseline }: { baseline: TeamOdds[] }) {
  const teams = [...baseline].sort((a, b) => a.name.localeCompare(b.name));
  const base = Object.fromEntries(baseline.map((t) => [t.team, t]));

  const [boostTeam, setBoostTeam] = useState(teams[0].team);
  const [delta, setDelta] = useState(50);
  const [adjust, setAdjust] = useState<Record<string, number>>({});

  const [forceTeam, setForceTeam] = useState(teams[0].team);
  const [games, setGames] = useState<GameView[] | null>(null);
  const [forced, setForced] = useState<Record<string, Forced>>({});

  const [result, setResult] = useState<SeasonResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const winChance = 1 / (1 + 10 ** (-delta / 400));
  const changes = Object.keys(adjust).length + Object.keys(forced).length;

  async function loadGames(team: string) {
    setForceTeam(team);
    setGames(null);
    try {
      const t = await getTeam(team);
      setGames(t ? t.games.filter((g) => !g.played) : []);
    } catch {
      setGames([]);
    }
  }
  // Show the first team's remaining games when the page opens.
  const firstTeam = teams[0].team;
  useEffect(() => {
    let cancelled = false;
    getTeam(firstTeam)
      .then((t) => !cancelled && setGames(t ? t.games.filter((g) => !g.played) : []))
      .catch(() => !cancelled && setGames([]));
    return () => {
      cancelled = true;
    };
  }, [firstTeam]);

  function setForce(g: GameView, teamWins: boolean | null) {
    setForced((f) => {
      const next = { ...f };
      if (teamWins === null) delete next[g.game_id];
      else next[g.game_id] = { team: forceTeam, opponent: g.opponent, week: g.week, teamWins, homeWin: g.home ? teamWins : !teamWins };
      return next;
    });
  }

  async function run() {
    setLoading(true);
    setError(null);
    try {
      setResult(
        await runWhatIf({
          rating_adjustments: adjust,
          game_overrides: Object.entries(forced).map(([game_id, f]) => ({ game_id, home_win: f.homeWin })),
          n_sims: N_SIMS,
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setAdjust({});
    setForced({});
    setResult(null);
    setError(null);
  }

  const rows = (result?.teams ?? [])
    .map((t) => ({
      t,
      dSb: (t.p_super_bowl - base[t.team].p_super_bowl) * 100,
      dPo: (t.p_playoffs - base[t.team].p_playoffs) * 100,
      dW: t.exp_wins - base[t.team].exp_wins,
    }))
    .sort((a, b) => Math.abs(b.dSb) + Math.abs(b.dPo) / 4 - (Math.abs(a.dSb) + Math.abs(a.dPo) / 4));
  const shown = showAll ? rows : rows.slice(0, 10);

  return (
    <div className="grid gap-6 lg:grid-cols-[400px_1fr]">
      <div className="space-y-5">
        <section className="panel p-5">
          <h2 className="font-display text-3xl text-strong">1 · Change a team</h2>
          <p className="mt-1 text-xs text-muted">Adjust a team&apos;s Elo rating, the model&apos;s measure of strength.</p>
          <div className="mt-3 flex items-center gap-3">
            <TeamLogo abbr={boostTeam} size={40} />
            <TeamSelect value={boostTeam} onChange={setBoostTeam} teams={teams} />
          </div>
          <div className="mt-4 flex items-baseline justify-between">
            <span className="font-display text-5xl text-strong tabular-nums">{signed(delta)}</span>
            <span className="text-xs text-muted">Elo points</span>
          </div>
          <input
            type="range"
            min={-150}
            max={150}
            step={5}
            value={delta}
            onChange={(e) => setDelta(Number(e.target.value))}
            aria-label="Elo adjustment"
            className="mt-2 w-full accent-accent"
          />
          <p className="mt-1 text-xs text-muted">
            {signed(delta)} Elo ≈ {Math.round(winChance * 100)}% to beat an equal team on a neutral field (50% normally).
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <button key={p.label} onClick={() => setDelta(p.delta)} className="rounded-full px-3 py-1 text-xs font-semibold text-muted ring-1 ring-line hover:bg-hover hover:text-strong">
                {p.label} ({signed(p.delta)})
              </button>
            ))}
          </div>
          <button onClick={() => setAdjust((a) => ({ ...a, [boostTeam]: delta }))} disabled={delta === 0} className="btn btn-ghost btn-sm mt-4 text-lg">
            Add change
          </button>
          {Object.keys(adjust).length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {Object.entries(adjust).map(([team, d]) => (
                <li key={team} className="flex items-center gap-2 bg-head px-2 py-1.5 text-sm">
                  <TeamLogo abbr={team} size={26} />
                  <span className="flex-1 font-semibold">{teamInfo(team).name}</span>
                  <span className={`font-semibold tabular-nums ${d > 0 ? "text-good-ink" : "text-bad-ink"}`}>{signed(d)} Elo</span>
                  <button
                    onClick={() => setAdjust((a) => Object.fromEntries(Object.entries(a).filter(([k]) => k !== team)))}
                    aria-label={`Remove change for ${teamInfo(team).name}`}
                    className="px-1 text-muted hover:text-strong"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel p-5">
          <h2 className="font-display text-3xl text-strong">2 · Force a result</h2>
          <p className="mt-1 text-xs text-muted">Pick a team, then decide how its remaining games end.</p>
          <div className="mt-3 flex items-center gap-3">
            <TeamLogo abbr={forceTeam} size={40} />
            <TeamSelect value={forceTeam} onChange={(t) => void loadGames(t)} teams={teams} />
          </div>
          <ul className="mt-3 max-h-72 space-y-1 overflow-y-auto pr-1">
            {games === null && <li className="py-3 text-center text-sm text-muted">Loading schedule…</li>}
            {games?.length === 0 && <li className="py-3 text-center text-sm text-muted">No games left to force.</li>}
            {games?.map((g) => {
              const f = forced[g.game_id];
              const choice = f ? (f.teamWins ? "W" : "L") : null;
              return (
                <li key={g.game_id} className="flex items-center gap-2 bg-head px-2 py-1.5 text-sm">
                  <span className="font-display w-7 text-lg text-muted tabular-nums">{g.week}</span>
                  <TeamLogo abbr={g.opponent} size={26} />
                  <span className="min-w-0 flex-1 truncate">
                    <span className="text-muted">{g.home ? "vs" : "@"}</span> {teamInfo(g.opponent).name.split(" ").pop()}
                    <span className="ml-1 text-xs text-muted">{pct(g.p_win ?? 0.5)}</span>
                  </span>
                  {g.neutral ? (
                    <span className="text-xs text-muted">neutral site</span>
                  ) : (
                    <span className="flex overflow-hidden rounded ring-1 ring-line" role="group" aria-label={`Result for week ${g.week}`}>
                      {(["W", "L"] as const).map((c) => (
                        <button
                          key={c}
                          onClick={() => setForce(g, choice === c ? null : c === "W")}
                          aria-pressed={choice === c}
                          className={`font-display w-8 py-0.5 text-base ${
                            choice === c ? (c === "W" ? "bg-good text-white" : "bg-bad text-white") : "text-muted hover:bg-hover"
                          }`}
                        >
                          {c}
                        </button>
                      ))}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
          {Object.keys(forced).length > 0 && (
            <p className="mt-3 text-xs text-muted">
              Forced: {Object.values(forced).map((f) => `${f.team} ${f.teamWins ? "beat" : "lost to"} ${f.opponent} (wk ${f.week})`).join(" · ")}
            </p>
          )}
        </section>

        <div className="flex flex-wrap items-center gap-3">
          <button onClick={run} disabled={loading || changes === 0} className="btn btn-primary text-xl">
            {loading ? "Simulating…" : "Run what-if"}
          </button>
          <button onClick={reset} disabled={loading || (changes === 0 && !result)} className="btn btn-ghost text-xl">
            Reset
          </button>
          <span className="text-xs text-muted">
            {changes === 0 ? "Add a change first" : `${changes} change${changes === 1 ? "" : "s"} · ${N_SIMS.toLocaleString("en-US")} simulations`}
          </span>
        </div>
        {error && (
          <p role="alert" className="rounded-md bg-bad/15 px-4 py-2 text-sm text-bad-ink ring-1 ring-bad/40">
            {error}. Is the API running on port 8000?
          </p>
        )}
      </div>

      <section aria-live="polite">
        {!result ? (
          <div className="panel flex h-full min-h-72 items-center justify-center p-10 text-center text-lg text-muted">
            Make a change on the left and click Run what-if. You&apos;ll see how every team&apos;s odds shift compared with the normal projection.
          </div>
        ) : (
          <div className="panel-flat overflow-hidden">
            <div className="flex flex-wrap items-end justify-between gap-2 border-b border-line p-4">
              <h2 className="font-display text-3xl text-strong">Biggest changes</h2>
              <p className="text-xs text-muted">
                vs. the normal projection · gray = within simulation noise (about ±1 point at {N_SIMS.toLocaleString("en-US")} runs)
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="border-b border-line bg-head text-xs tracking-widest text-muted uppercase">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold">Team</th>
                    <th className="px-3 py-2 text-right font-semibold">Super Bowl</th>
                    <th className="px-3 py-2 text-right font-semibold">Playoffs</th>
                    <th className="px-3 py-2 text-right font-semibold">Exp. wins</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/60">
                  {shown.map(({ t, dSb, dPo, dW }) => {
                    const b = base[t.team];
                    const changed = t.team in adjust;
                    return (
                      <tr key={t.team} className="hover:bg-hover">
                        <td className="px-3 py-2" style={{ boxShadow: `inset 4px 0 0 ${teamInfo(t.team).primary}` }}>
                          <div className="flex items-center gap-3 pl-1">
                            <TeamLogo abbr={t.team} size={38} />
                            <span className="font-semibold text-strong">{t.name}</span>
                            {changed && <span className="rounded bg-accent px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-on-accent">CHANGED</span>}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          <div className="text-base font-semibold">
                            <span className="font-normal text-muted">{pct(b.p_super_bowl)} → </span>
                            {pct(t.p_super_bowl)}
                          </div>
                          <Delta value={dSb} />
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          <div className="text-base font-semibold">
                            <span className="font-normal text-muted">{pct(b.p_playoffs)} → </span>
                            {pct(t.p_playoffs)}
                          </div>
                          <Delta value={dPo} />
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          <div className="text-base font-semibold">
                            <span className="font-normal text-muted">{b.exp_wins.toFixed(1)} → </span>
                            {t.exp_wins.toFixed(1)}
                          </div>
                          <Delta value={dW} unit="wins" noise={0.15} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="border-t border-line p-3 text-center">
              <button onClick={() => setShowAll((v) => !v)} className="text-sm font-semibold text-accent-ink hover:underline">
                {showAll ? "Show top 10" : "Show all 32 teams"}
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
