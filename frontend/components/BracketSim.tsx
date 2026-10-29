"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import TeamLogo from "@/components/TeamLogo";
import { pct } from "@/components/ProbCell";
import { rollGame, simulateSeason } from "@/lib/api";
import { allMatchups, buildBracket, readyMatchups, type ConferenceBracket, type Matchup } from "@/lib/bracket";
import { teamInfo } from "@/lib/teams";
import type { Conference, SimulatedSeason } from "@/lib/types";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Ctx {
  seeds: Record<Conference, string[]>;
  records: Record<string, string>;
  winners: Record<string, string>;
  probs: Record<string, number>; // matchup id -> P(home wins)
  busy: boolean;
  onPlay: (m: Matchup) => void;
}

const seedLabel = (seeds: Record<Conference, string[]>, team: string) => {
  for (const conf of ["AFC", "NFC"] as const) {
    const i = seeds[conf].indexOf(team);
    if (i >= 0) return i + 1;
  }
  return null;
};

function TeamRow({ team, m, ctx, isHome }: { team: string | null; m: Matchup; ctx: Ctx; isHome: boolean }) {
  if (!team) {
    return <div className="flex h-11 items-center px-3 text-sm text-zinc-400">To be decided</div>;
  }
  const winner = ctx.winners[m.id];
  const p = ctx.probs[m.id] === undefined ? null : isHome ? ctx.probs[m.id] : 1 - ctx.probs[m.id];
  const lost = winner && winner !== team;
  const seed = seedLabel(ctx.seeds, team);
  return (
    <div className={`flex h-11 items-center gap-2 px-3 ${lost ? "opacity-45" : ""}`}>
      <span className="w-4 text-xs text-zinc-400 tabular-nums">{seed}</span>
      <TeamLogo abbr={team} size={26} />
      <span className={`min-w-0 flex-1 truncate text-sm ${winner === team ? "font-semibold" : ""}`}>
        {teamInfo(team).name}
        <span className="ml-1.5 text-xs text-zinc-400">{ctx.records[team]}</span>
      </span>
      {winner === team ? (
        <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400" aria-label="Winner">
          ✓
        </span>
      ) : p !== null ? (
        <span className="text-xs text-zinc-500 tabular-nums dark:text-zinc-400" title="Win probability">
          {pct(p)}
        </span>
      ) : null}
    </div>
  );
}

function MatchupCard({ m, ctx, label }: { m: Matchup; ctx: Ctx; label?: string }) {
  const ready = m.home && m.away && !ctx.winners[m.id];
  return (
    <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900">
      {label && (
        <div className="border-b border-zinc-100 px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-zinc-400 dark:border-zinc-800">
          {label}
        </div>
      )}
      <TeamRow team={m.home} m={m} ctx={ctx} isHome />
      <div className="border-t border-zinc-100 dark:border-zinc-800" />
      <TeamRow team={m.away} m={m} ctx={ctx} isHome={false} />
      {ready && (
        <button
          onClick={() => ctx.onPlay(m)}
          disabled={ctx.busy}
          className="w-full border-t border-zinc-100 bg-sky-50 py-1.5 text-sm font-medium text-sky-700 hover:bg-sky-100 disabled:opacity-50 dark:border-zinc-800 dark:bg-sky-950/40 dark:text-sky-300 dark:hover:bg-sky-950"
        >
          Play game
        </button>
      )}
    </div>
  );
}

function Round({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col">
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{title}</h4>
      <div className="flex flex-1 flex-col justify-center gap-3">{children}</div>
    </div>
  );
}

function SeedList({ conf, sim, ctx }: { conf: Conference; sim: SimulatedSeason; ctx: Ctx }) {
  return (
    <div>
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Final seeding</h4>
      <ol className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-700">
        {sim.seeds[conf].map((t, i) => (
          <li key={t} className="flex items-center gap-2 border-b border-zinc-100 px-2 py-1.5 last:border-0 dark:border-zinc-800">
            <span className="w-4 text-xs text-zinc-400 tabular-nums">{i + 1}</span>
            <TeamLogo abbr={t} size={22} />
            <span className="flex-1 text-sm font-medium">{t}</span>
            <span className="text-xs text-zinc-500 tabular-nums">{ctx.records[t]}</span>
            <span className="w-7 text-right text-[10px] font-medium text-zinc-400">
              {sim.division_winners.includes(t) ? "DIV" : "WC"}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function ConferenceSection({ conf, b, sim, ctx }: { conf: Conference; b: ConferenceBracket; sim: SimulatedSeason; ctx: Ctx }) {
  return (
    <section className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
      <h3 className="mb-3 text-lg font-semibold">{conf}</h3>
      <div className="grid gap-4 lg:grid-cols-[210px_1fr_1fr_1fr]">
        <SeedList conf={conf} sim={sim} ctx={ctx} />
        <Round title="Wild card">
          {b.wc.map((m) => (
            <MatchupCard key={m.id} m={m} ctx={ctx} />
          ))}
          <p className="text-xs text-zinc-400">#1 seed has a first-round bye</p>
        </Round>
        <Round title="Divisional">
          {b.div.map((m) => (
            <MatchupCard key={m.id} m={m} ctx={ctx} />
          ))}
        </Round>
        <Round title="Conference final">
          <MatchupCard m={b.conf} ctx={ctx} />
        </Round>
      </div>
    </section>
  );
}

export default function BracketSim() {
  const [sim, setSim] = useState<SimulatedSeason | null>(null);
  const [winners, setWinners] = useState<Record<string, string>>({});
  const [probs, setProbs] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [runs, setRuns] = useState(0);
  const requested = useRef(new Set<string>());
  const generation = useRef(0); // bumped on every new season so stale responses are ignored

  const bracket = useMemo(() => (sim ? buildBracket(sim.seeds, winners) : null), [sim, winners]);
  const records = useMemo(() => {
    const r: Record<string, string> = {};
    for (const s of sim?.standings ?? []) r[s.team] = `${s.wins}-${s.losses}${s.ties ? `-${s.ties}` : ""}`;
    return r;
  }, [sim]);

  // Whenever a matchup becomes known, fetch its pre-game win probability.
  useEffect(() => {
    if (!bracket) return;
    const gen = generation.current;
    for (const m of allMatchups(bracket)) {
      if (!m.home || !m.away || probs[m.id] !== undefined || requested.current.has(m.id)) continue;
      requested.current.add(m.id);
      rollGame(m.home, m.away, m.neutral, false)
        .then((r) => gen === generation.current && setProbs((p) => ({ ...p, [m.id]: r.p_home })))
        .catch(() => requested.current.delete(m.id));
    }
  }, [bracket, probs]);

  async function newSeason() {
    setLoading(true);
    setError(null);
    try {
      const result = await simulateSeason();
      generation.current += 1;
      requested.current.clear();
      setWinners({});
      setProbs({});
      setSim(result);
      setRuns((n) => n + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function play(games: Matchup[]) {
    const gen = generation.current;
    const results = await Promise.all(games.map((m) => rollGame(m.home!, m.away!, m.neutral, true)));
    if (gen !== generation.current) return null;
    const next: Record<string, string> = {};
    games.forEach((m, i) => (next[m.id] = results[i].winner!));
    setProbs((p) => ({ ...p, ...Object.fromEntries(games.map((m, i) => [m.id, results[i].p_home])) }));
    return next;
  }

  async function run(mode: "game" | "round" | "all", game?: Matchup) {
    if (!sim || busy) return;
    setBusy(true);
    setError(null);
    try {
      let current = { ...winners };
      do {
        const ready = game ? [game] : readyMatchups(buildBracket(sim.seeds, current), current);
        if (!ready.length) break;
        const next = await play(ready);
        if (!next) return;
        current = { ...current, ...next };
        setWinners(current);
        game = undefined;
        if (mode === "all") await wait(700); // a beat between rounds so it's watchable
      } while (mode === "all");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  const champ = winners["SB"];
  const ctx: Ctx = { seeds: sim?.seeds ?? { AFC: [], NFC: [] }, records, winners, probs, busy, onPlay: (m) => run("game", m) };
  const anyReady = bracket ? readyMatchups(bracket, winners).length > 0 : false;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={newSeason}
          disabled={loading || busy}
          className="rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50"
        >
          {loading ? "Simulating…" : sim ? "Simulate a new season" : "Simulate the rest of the season"}
        </button>
        {sim && (
          <>
            <button
              onClick={() => run("round")}
              disabled={!anyReady || busy}
              className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-700 dark:hover:bg-zinc-800"
            >
              Play next round
            </button>
            <button
              onClick={() => run("all")}
              disabled={!anyReady || busy}
              className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-700 dark:hover:bg-zinc-800"
            >
              Play to the Super Bowl
            </button>
            <span className="text-sm text-zinc-500 dark:text-zinc-400">
              Season #{runs} · {sim.games.filter((g) => !g.played).length} games simulated
            </span>
          </>
        )}
      </div>
      {error && (
        <p role="alert" className="mt-3 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950/50 dark:text-rose-300">
          {error}. Is the API running on port 8000?
        </p>
      )}

      {!sim && !loading && (
        <div className="mt-6 rounded-xl border border-dashed border-zinc-300 p-10 text-center text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
          Click the button to randomly play out every remaining regular-season game. The model uses each game&apos;s win
          probability, applies the real NFL tiebreakers, and sets the playoff bracket.
        </div>
      )}

      {sim && bracket && (
        <div className="mt-6 space-y-5">
          <ConferenceSection conf="AFC" b={bracket.AFC} sim={sim} ctx={ctx} />
          <ConferenceSection conf="NFC" b={bracket.NFC} sim={sim} ctx={ctx} />

          <section
            className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800"
            style={champ ? { backgroundImage: `linear-gradient(120deg, ${teamInfo(champ).primary}33, transparent 60%)` } : undefined}
          >
            <h3 className="mb-3 text-lg font-semibold">Super Bowl</h3>
            <div className="grid items-center gap-4 md:grid-cols-2">
              <div className="max-w-sm">
                <MatchupCard m={bracket.sb} ctx={ctx} label="Neutral site" />
              </div>
              {champ && (
                <div className="flex items-center gap-4" aria-live="polite">
                  <TeamLogo abbr={champ} size={84} />
                  <div>
                    <div className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Super Bowl champions</div>
                    <div className="text-2xl font-semibold">{teamInfo(champ).name}</div>
                    <div className="text-sm text-zinc-500 dark:text-zinc-400">
                      {records[champ]} in the regular season · #{seedLabel(sim.seeds, champ)} seed
                    </div>
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
