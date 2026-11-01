"use client";

import Link from "next/link";
import { useState } from "react";
import { usePlayoffSim } from "@/components/PlayoffSim";
import { pct } from "@/components/ProbCell";
import TeamLogo from "@/components/TeamLogo";
import { teamInfo } from "@/lib/teams";
import type { BracketResponse, Conference, SimulatedSeason, TeamOdds } from "@/lib/types";

const DIVISION_ORDER = ["East", "North", "South", "West"];

const games = (t: TeamOdds) => t.record.wins + t.record.losses + t.record.ties;
const winPct = (t: TeamOdds) => (games(t) ? (t.record.wins + t.record.ties / 2) / games(t) : 0);
const recordText = (t: TeamOdds) => `${t.record.wins}-${t.record.losses}${t.record.ties ? `-${t.record.ties}` : ""}`;

interface SimInfo {
  record: Map<string, { w: number; l: number; t: number }>;
  seed: Map<string, number>;
  winners: Set<string>;
}

function simInfo(sim: SimulatedSeason): SimInfo {
  const seed = new Map<string, number>();
  for (const conf of ["AFC", "NFC"] as const) sim.seeds[conf].forEach((t, i) => seed.set(t, i + 1));
  return {
    record: new Map(sim.standings.map((r) => [r.team, { w: r.wins, l: r.losses, t: r.ties }])),
    seed,
    winners: new Set(sim.division_winners),
  };
}

const simPct = (r: { w: number; l: number; t: number }) => (r.w + r.l + r.t ? (r.w + r.t / 2) / (r.w + r.l + r.t) : 0);

function DivisionTable({ name, teams, sim }: { name: string; teams: TeamOdds[]; sim: SimInfo | null }) {
  // Projections: ordered by record, then projected wins (not the full NFL tiebreaker list).
  // Simulated season: the division winner (decided with the real tiebreakers) first, then by simulated record.
  const rows = sim
    ? [...teams].sort(
        (a, b) =>
          Number(sim.winners.has(b.team)) - Number(sim.winners.has(a.team)) ||
          simPct(sim.record.get(b.team)!) - simPct(sim.record.get(a.team)!) ||
          b.exp_wins - a.exp_wins,
      )
    : [...teams].sort((a, b) => winPct(b) - winPct(a) || b.exp_wins - a.exp_wins);
  return (
    <section className="panel-flat overflow-hidden">
      <h4 className="font-display border-b border-line bg-head px-4 py-2 text-2xl text-strong">{name}</h4>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[460px] text-sm">
          <thead className="border-b border-line text-[11px] tracking-widest text-muted uppercase">
            <tr>
              <th className="px-4 py-2 text-left font-semibold">Team</th>
              <th className="px-2 py-2 text-right font-semibold">{sim ? "Final" : "W-L"}</th>
              <th className="px-2 py-2 text-right font-semibold">PCT</th>
              {sim ? (
                <>
                  <th className="px-2 py-2 text-right font-semibold" title="Record before the simulated games">
                    Now
                  </th>
                  <th className="px-2 py-2 text-right font-semibold">Seed</th>
                  <th className="px-3 py-2 text-right font-semibold">Result</th>
                </>
              ) : (
                <>
                  <th className="px-2 py-2 text-right font-semibold" title="Average wins across the simulated seasons">
                    Proj. W
                  </th>
                  <th className="px-2 py-2 text-right font-semibold">Win div.</th>
                  <th className="px-3 py-2 text-right font-semibold">Playoffs</th>
                </>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-line/60">
            {rows.map((t, i) => {
              const r = sim?.record.get(t.team);
              const seed = sim?.seed.get(t.team);
              return (
                <tr key={t.team} className="hover:bg-hover" style={{ boxShadow: `inset 4px 0 0 ${teamInfo(t.team).primary}` }}>
                  <td className="px-4 py-2">
                    <Link href={`/teams/${t.team}`} className="group flex items-center gap-3">
                      <TeamLogo abbr={t.team} size={36} />
                      <span>
                        <span className="block text-base font-semibold text-strong group-hover:text-accent-ink">{teamInfo(t.team).name}</span>
                        {(sim ? sim.winners.has(t.team) : i === 0) && <span className="text-[10px] font-bold tracking-wider text-muted">DIVISION {sim ? "CHAMPION" : "LEADER"}</span>}
                      </span>
                    </Link>
                  </td>
                  <td className="px-2 py-2 text-right text-base font-semibold tabular-nums">{r ? `${r.w}-${r.l}${r.t ? `-${r.t}` : ""}` : recordText(t)}</td>
                  <td className="px-2 py-2 text-right tabular-nums text-muted">{(r ? simPct(r) : winPct(t)).toFixed(3).replace(/^0/, "")}</td>
                  {sim ? (
                    <>
                      <td className="px-2 py-2 text-right tabular-nums text-muted">{recordText(t)}</td>
                      <td className="px-2 py-2 text-right font-display text-xl tabular-nums">{seed ?? "—"}</td>
                      <td className="px-3 py-2 text-right text-xs font-semibold">
                        {seed ? (
                          <span className={sim.winners.has(t.team) ? "text-good-ink" : "text-accent-ink"}>{sim.winners.has(t.team) ? "Division title" : "Wild card"}</span>
                        ) : (
                          <span className="text-muted">Missed playoffs</span>
                        )}
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-2 py-2 text-right tabular-nums">{t.exp_wins.toFixed(1)}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{pct(t.p_division)}</td>
                      <td className="px-3 py-2 text-right font-semibold tabular-nums">{pct(t.p_playoffs)}</td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** Give every team at most one seed: take the single most likely (team, seed) pair, remove both, repeat. */
function assignSeeds(slots: BracketResponse["conferences"][number]["slots"]) {
  const pairs = slots.flatMap((s) => s.teams.map((t) => ({ seed: s.seed, team: t.team, prob: t.prob }))).sort((a, b) => b.prob - a.prob);
  const bySeed = new Map<number, { team: string; prob: number }>();
  const used = new Set<string>();
  for (const p of pairs) {
    if (bySeed.has(p.seed) || used.has(p.team)) continue;
    bySeed.set(p.seed, { team: p.team, prob: p.prob });
    used.add(p.team);
  }
  return slots.map((s) => ({
    seed: s.seed,
    pick: bySeed.get(s.seed) ?? null,
    next: s.teams.find((t) => t.team !== bySeed.get(s.seed)?.team && !used.has(t.team)) ?? null,
  }));
}

function SeedPicture({ conference, slots }: { conference: Conference; slots: BracketResponse["conferences"][number]["slots"] }) {
  return (
    <section className="panel-flat overflow-hidden">
      <h4 className="font-display border-b border-line bg-head px-4 py-2 text-2xl text-strong">Projected playoff seeds</h4>
      <ol className="divide-y divide-line/60">
        {assignSeeds(slots).map(({ seed, pick, next }) =>
          pick ? (
            <li key={seed} className="flex items-center gap-3 px-4 py-2" style={{ boxShadow: `inset 4px 0 0 ${teamInfo(pick.team).primary}` }}>
              <span className="font-display w-5 text-2xl text-muted tabular-nums">{seed}</span>
              <TeamLogo abbr={pick.team} size={36} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-base font-semibold text-strong">{teamInfo(pick.team).name}</div>
                {next && (
                  <div className="text-[11px] text-muted">
                    also in the mix: {next.team} {pct(next.prob)}
                  </div>
                )}
              </div>
              <div className="w-24">
                <div className="h-1.5 overflow-hidden rounded-full bg-gauge" aria-hidden>
                  <div className="h-full rounded-full bg-blue" style={{ width: `${pick.prob * 100}%` }} />
                </div>
              </div>
              <span className="w-10 text-right text-sm font-semibold tabular-nums">{pct(pick.prob)}</span>
            </li>
          ) : null,
        )}
      </ol>
      <p className="px-4 py-2 text-[11px] text-muted">
        Each {conference} team sits at its most likely seed, best matches first, so no team appears twice. The percentage is the chance
        of landing exactly that seed. Seeds 1-4 are division winners, 5-7 wild cards.
      </p>
    </section>
  );
}

function SimSeeds({ conference, sim }: { conference: Conference; sim: SimulatedSeason }) {
  const rec = new Map(sim.standings.map((r) => [r.team, r]));
  return (
    <section className="panel-flat overflow-hidden">
      <h4 className="font-display border-b border-line bg-head px-4 py-2 text-2xl text-strong">Playoff seeds in this simulated season</h4>
      <ol className="divide-y divide-line/60">
        {sim.seeds[conference].map((t, i) => {
          const r = rec.get(t);
          return (
            <li key={t} className="flex items-center gap-3 px-4 py-2" style={{ boxShadow: `inset 4px 0 0 ${teamInfo(t).primary}` }}>
              <span className="font-display w-5 text-2xl text-muted tabular-nums">{i + 1}</span>
              <TeamLogo abbr={t} size={36} />
              <span className="flex-1 truncate text-base font-semibold text-strong">{teamInfo(t).name}</span>
              <span className="text-sm text-muted tabular-nums">{r ? `${r.wins}-${r.losses}${r.ties ? `-${r.ties}` : ""}` : ""}</span>
              <span className="w-8 text-right text-[10px] font-bold tracking-wider text-muted">{sim.division_winners.includes(t) ? "DIV" : "WC"}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/**
 * Division standings for both conferences. Shows the model's projections, or, once you simulate the rest of the
 * season, that simulated season's final standings and playoff seeds (the same season the Bracket tab plays out).
 */
export default function Standings({ teams, bracket }: { teams: TeamOdds[]; bracket: BracketResponse | null }) {
  const { sim, runs, loading, error, newSeason } = usePlayoffSim();
  const [choice, setChoice] = useState<{ runs: number; view: "projected" | "simulated" } | null>(null);
  // A freshly simulated season shows itself until you pick a view again.
  const view = sim && !(choice && choice.runs === runs && choice.view === "projected") ? "simulated" : "projected";
  const info = sim && view === "simulated" ? simInfo(sim) : null;

  return (
    <div className="mt-6">
      <div className="panel flex flex-wrap items-center justify-between gap-4 p-4">
        <div role="group" aria-label="Which standings to show" className="flex flex-wrap gap-2">
          <button aria-pressed={view === "projected"} onClick={() => setChoice({ runs, view: "projected" })} className={`btn btn-sm text-lg ${view === "projected" ? "btn-primary" : "btn-ghost"}`}>
            Model projections
          </button>
          <button
            aria-pressed={view === "simulated"}
            disabled={!sim}
            onClick={() => setChoice({ runs, view: "simulated" })}
            className={`btn btn-sm text-lg ${view === "simulated" ? "btn-primary" : "btn-ghost"}`}
          >
            Simulated season
          </button>
        </div>
        <button onClick={() => void newSeason()} disabled={loading} className="btn btn-primary text-xl">
          {loading ? "Simulating…" : sim ? "Simulate a new season" : "Simulate the rest of the season"}
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-3 rounded-md bg-bad/15 px-4 py-2 text-sm text-bad-ink ring-1 ring-bad/40">
          {error}. Is the API running on port 8000?
        </p>
      )}
      <p className="mt-3 max-w-3xl text-sm text-muted">
        {info
          ? `One simulated rest of season: the real results so far plus every remaining game decided by its win probability, with the real NFL tiebreakers deciding division titles and seeds. This is the same season the Bracket tab plays out (season #${runs}).`
          : "Current records and what the simulated seasons project for each team. Teams are ordered by record, then projected wins. Simulate the rest of the season to see one possible final standing."}
      </p>

      <div className="mt-6 grid gap-8 xl:grid-cols-2">
        {(["AFC", "NFC"] as const).map((conf) => (
          <div key={conf}>
            <h3 className="font-display text-6xl text-strong">{conf}</h3>
            <div className="mt-3 space-y-4">
              {info && sim ? (
                <SimSeeds conference={conf} sim={sim} />
              ) : (
                bracket && <SeedPicture conference={conf} slots={bracket.conferences.find((c) => c.conference === conf)?.slots ?? []} />
              )}
              {DIVISION_ORDER.map((d) => {
                const name = `${conf} ${d}`;
                return <DivisionTable key={name} name={name} teams={teams.filter((t) => t.division === name)} sim={info} />;
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
