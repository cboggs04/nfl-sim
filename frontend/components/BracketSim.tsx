"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import TeamLogo from "@/components/TeamLogo";
import { pct } from "@/components/ProbCell";
import { rollGame, simulateSeason } from "@/lib/api";
import { allMatchups, buildBracket, readyMatchups, type Bracket, type Matchup } from "@/lib/bracket";
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
  reg: (id: string) => (el: HTMLElement | null) => void; // lets the bracket measure each card to draw connector lines
}

const seedLabel = (seeds: Record<Conference, string[]>, team: string) => {
  for (const conf of ["AFC", "NFC"] as const) {
    const i = seeds[conf].indexOf(team);
    if (i >= 0) return i + 1;
  }
  return null;
};

const nickname = (team: string) => teamInfo(team).name.split(" ").pop() ?? team;

function TeamRow({ team, m, ctx, isHome }: { team: string | null; m: Matchup; ctx: Ctx; isHome: boolean }) {
  if (!team) {
    return <div className="flex h-[52px] items-center px-3 text-sm text-muted">To be decided</div>;
  }
  const winner = ctx.winners[m.id];
  const p = ctx.probs[m.id] === undefined ? null : isHome ? ctx.probs[m.id] : 1 - ctx.probs[m.id];
  const lost = winner && winner !== team;
  const won = winner === team;
  const seed = seedLabel(ctx.seeds, team);
  return (
    <div
      className={`flex h-[52px] items-center gap-2 pr-2 pl-1.5 transition-opacity ${lost ? "opacity-40 grayscale" : ""}`}
      style={{
        boxShadow: `inset 4px 0 0 ${teamInfo(team).primary}`,
        backgroundImage: won ? `linear-gradient(90deg, ${teamInfo(team).primary}66, transparent 85%)` : undefined,
      }}
      title={`${teamInfo(team).name} (${ctx.records[team]})`}
    >
      <span className="font-display w-4 pl-1 text-lg text-muted tabular-nums">{seed}</span>
      <TeamLogo abbr={team} size={34} />
      <span className="min-w-0 flex-1 leading-tight">
        <span className={`block truncate text-sm ${won ? "font-bold text-strong" : "font-semibold"}`}>{nickname(team)}</span>
        <span className="block text-[11px] text-muted">{ctx.records[team]}</span>
      </span>
      {won ? (
        <span className="font-display text-xl text-good" aria-label="Winner">
          ✓
        </span>
      ) : p !== null ? (
        <span className="font-display text-xl text-muted tabular-nums" title="Win probability">
          {pct(p)}
        </span>
      ) : null}
    </div>
  );
}

function MatchupCard({ m, ctx, label }: { m: Matchup; ctx: Ctx; label?: string }) {
  const ready = m.home && m.away && !ctx.winners[m.id];
  return (
    <div ref={ctx.reg(m.id)} className="panel-flat relative z-10 overflow-hidden">
      {label && (
        <div className="border-b border-line px-3 py-1 text-[10px] font-semibold tracking-widest text-muted uppercase">{label}</div>
      )}
      <TeamRow team={m.home} m={m} ctx={ctx} isHome />
      <div className="border-t border-line" />
      <TeamRow team={m.away} m={m} ctx={ctx} isHome={false} />
      {ready && (
        <button
          onClick={() => ctx.onPlay(m)}
          disabled={ctx.busy}
          className="font-display w-full border-t border-line bg-accent/90 py-1 text-base text-[#1a1200] hover:bg-accent disabled:opacity-40"
        >
          Play game
        </button>
      )}
    </div>
  );
}

/** The 1 seed's first-round bye, drawn as a one-team card so the bracket lines have somewhere to start. */
function ByeCard({ conf, ctx }: { conf: Conference; ctx: Ctx }) {
  const team = ctx.seeds[conf][0];
  const info = teamInfo(team);
  return (
    <div ref={ctx.reg(`${conf}-BYE`)} className="panel-flat relative z-10 overflow-hidden">
      <div className="flex h-[52px] items-center gap-2 pr-2 pl-1.5" style={{ boxShadow: `inset 4px 0 0 ${info.primary}` }} title={`${info.name} (${ctx.records[team]})`}>
        <span className="font-display w-4 pl-1 text-lg text-muted">1</span>
        <TeamLogo abbr={team} size={34} />
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block truncate text-sm font-semibold">{nickname(team)}</span>
          <span className="block text-[11px] text-muted">{ctx.records[team]}</span>
        </span>
        <span className="text-[10px] font-bold tracking-widest text-accent-ink">BYE</span>
      </div>
    </div>
  );
}

function SeedList({ conf, sim, ctx }: { conf: Conference; sim: SimulatedSeason; ctx: Ctx }) {
  return (
    <div>
      <h4 className="font-display mb-3 text-2xl text-accent-ink">{conf} final seeding</h4>
      <ol className="panel-flat overflow-hidden">
        {sim.seeds[conf].map((t, i) => (
          <li
            key={t}
            className="flex items-center gap-2.5 border-b border-line/60 px-3 py-1.5 last:border-0"
            style={{ boxShadow: `inset 4px 0 0 ${teamInfo(t).primary}` }}
          >
            <span className="font-display w-5 pl-1 text-xl text-muted tabular-nums">{i + 1}</span>
            <TeamLogo abbr={t} size={30} />
            <span className="flex-1 text-base font-bold">{t}</span>
            <span className="text-sm text-muted tabular-nums">{ctx.records[t]}</span>
            <span className="w-8 text-right text-[10px] font-bold tracking-wider text-muted">
              {sim.division_winners.includes(t) ? "DIV" : "WC"}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

interface Edge {
  from: string;
  to: string;
  active: boolean; // the team really advanced along this line
}

/**
 * Which card feeds which. Once a round is decided the lines follow the real winners (the NFL reseeds,
 * so they can cross); before that they show the usual path, drawn dim.
 */
function bracketEdges(b: Bracket, seeds: Record<Conference, string[]>, winners: Record<string, string>): Edge[] {
  const edges: Edge[] = [];
  const link = (t: Matchup, defaults: string[], cands: string[], won: (id: string) => string | undefined) => {
    if (t.home && t.away) {
      for (const team of [t.home, t.away]) {
        const from = cands.find((id) => won(id) === team);
        if (from) edges.push({ from, to: t.id, active: true });
      }
    } else {
      for (const from of defaults) edges.push({ from, to: t.id, active: false });
    }
  };
  for (const conf of ["AFC", "NFC"] as const) {
    const cb = b[conf];
    const bye = `${conf}-BYE`;
    const won = (id: string) => (id === bye ? seeds[conf][0] : winners[id]);
    const wcIds = cb.wc.map((m) => m.id);
    link(cb.div[0], [bye, wcIds[2]], [bye, ...wcIds], won);
    link(cb.div[1], [wcIds[0], wcIds[1]], [bye, ...wcIds], won);
    link(cb.conf, [cb.div[0].id, cb.div[1].id], cb.div.map((m) => m.id), won);
  }
  link(b.sb, [b.AFC.conf.id, b.NFC.conf.id], [b.AFC.conf.id, b.NFC.conf.id], (id) => winners[id]);
  return edges;
}

function ColumnTitle({ children }: { children: React.ReactNode }) {
  return <h4 className="font-display mb-3 text-center text-xl text-accent-ink">{children}</h4>;
}

function RoundColumn({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col">
      <ColumnTitle>{title}</ColumnTitle>
      <div className="flex flex-1 flex-col justify-around gap-3">{children}</div>
    </div>
  );
}

/** AFC on the left, NFC on the right, both flowing toward the Super Bowl in the middle, joined by lines. */
function BracketView({ bracket, ctx, champ, sim }: { bracket: Bracket; ctx: Ctx; champ: string | undefined; sim: SimulatedSeason }) {
  const wrap = useRef<HTMLDivElement>(null);
  const els = useRef(new Map<string, HTMLElement>());
  const [paths, setPaths] = useState<{ d: string; active: boolean }[]>([]);
  const edges = useMemo(() => bracketEdges(bracket, ctx.seeds, ctx.winners), [bracket, ctx.seeds, ctx.winners]);

  const reg = useMemo(
    () => (id: string) => (el: HTMLElement | null) => {
      if (el) els.current.set(id, el);
      else els.current.delete(id);
    },
    [],
  );
  const c: Ctx = { ...ctx, reg };

  useLayoutEffect(() => {
    const root = wrap.current;
    if (!root) return;
    const measure = () => {
      const base = root.getBoundingClientRect();
      const box = (id: string) => {
        const el = els.current.get(id);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { l: r.left - base.left, r: r.right - base.left, y: (r.top + r.bottom) / 2 - base.top };
      };
      const next: { d: string; active: boolean }[] = [];
      for (const e of edges) {
        const s = box(e.from);
        const t = box(e.to);
        if (!s || !t) continue;
        const [x1, x2] = s.r <= t.l ? [s.r, t.l] : [s.l, t.r];
        const xm = (x1 + x2) / 2;
        next.push({ d: `M${x1} ${s.y}H${xm}V${t.y}H${x2}`, active: e.active });
      }
      setPaths(next.sort((a, b) => Number(a.active) - Number(b.active))); // active lines on top
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(root);
    els.current.forEach((el) => ro.observe(el));
    return () => ro.disconnect();
  }, [edges, bracket]);

  const side = (conf: Conference, flip: boolean) => {
    const cb = bracket[conf];
    const cols = [
      <RoundColumn key="wc" title="Wild card">
        <ByeCard conf={conf} ctx={c} />
        <MatchupCard m={cb.wc[2]} ctx={c} />
        <MatchupCard m={cb.wc[0]} ctx={c} />
        <MatchupCard m={cb.wc[1]} ctx={c} />
      </RoundColumn>,
      <RoundColumn key="div" title="Divisional">
        {cb.div.map((m) => (
          <MatchupCard key={m.id} m={m} ctx={c} />
        ))}
      </RoundColumn>,
      <RoundColumn key="conf" title={`${conf} final`}>
        <MatchupCard m={cb.conf} ctx={c} />
      </RoundColumn>,
    ];
    return flip ? cols.reverse() : cols;
  };

  return (
    <div className="overflow-x-auto pb-2">
      <div className="mb-2 flex min-w-[1280px] items-end justify-between px-1">
        <h3 className="font-display text-7xl text-strong">AFC</h3>
        <h3 className="font-display text-7xl text-strong">NFC</h3>
      </div>
      <div ref={wrap} className="relative grid min-w-[1280px] grid-cols-[repeat(3,minmax(0,1fr))_minmax(0,1.15fr)_repeat(3,minmax(0,1fr))] gap-x-7">
        <svg className="pointer-events-none absolute inset-0 z-0 h-full w-full" aria-hidden>
          {paths.map((p, i) => (
            <path
              key={i}
              d={p.d}
              fill="none"
              strokeWidth={p.active ? 3 : 2}
              strokeLinejoin="round"
              stroke={p.active ? "var(--accent)" : "var(--edge)"}
              strokeDasharray={p.active ? undefined : "5 5"}
            />
          ))}
        </svg>
        {side("AFC", false)}
        <div className="flex min-w-0 flex-col">
          <ColumnTitle>Super Bowl</ColumnTitle>
          <div className="grid flex-1 grid-rows-[1fr_auto_1fr] gap-3">
            <div className="flex flex-col items-center justify-end gap-1 text-center" aria-live="polite">
              {champ && (
                <div className="rise flex flex-col items-center">
                  <TeamLogo abbr={champ} size={150} />
                  <div className="font-display mt-3 text-xl text-accent-ink">Champions</div>
                  <div className="font-display text-3xl text-strong">{nickname(champ)}</div>
                  <div className="text-xs text-muted">
                    {ctx.records[champ]} · #{seedLabel(sim.seeds, champ)} seed
                  </div>
                </div>
              )}
            </div>
            <MatchupCard m={bracket.sb} ctx={c} label="Neutral site" />
            <div />
          </div>
        </div>
        {side("NFC", true)}
      </div>
    </div>
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
  const ctx: Ctx = { seeds: sim?.seeds ?? { AFC: [], NFC: [] }, records, winners, probs, busy, onPlay: (m) => run("game", m), reg: () => () => {} };
  const anyReady = bracket ? readyMatchups(bracket, winners).length > 0 : false;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-4">
        <button onClick={newSeason} disabled={loading || busy} className="btn btn-gold text-xl">
          {loading ? "Simulating…" : sim ? "Simulate a new season" : "Simulate the rest of the season"}
        </button>
        {sim && (
          <>
            <button onClick={() => run("round")} disabled={!anyReady || busy} className="btn btn-ghost text-xl">
              Play next round
            </button>
            <button onClick={() => run("all")} disabled={!anyReady || busy} className="btn btn-ghost text-xl">
              Play to the Super Bowl
            </button>
            <span className="text-sm text-muted">
              Season #{runs} · {sim.games.filter((g) => !g.played).length} games simulated
            </span>
          </>
        )}
      </div>
      {error && (
        <p role="alert" className="mt-4 rounded-md bg-bad/15 px-4 py-2 text-sm text-bad-ink ring-1 ring-bad/40">
          {error}. Is the API running on port 8000?
        </p>
      )}

      {!sim && !loading && (
        <div className="panel mt-8 p-12 text-center text-lg text-muted">
          Click the button to randomly play out every remaining regular-season game. The model uses each game&apos;s win
          probability, applies the real NFL tiebreakers, and sets the playoff bracket.
        </div>
      )}

      {sim && bracket && (
        <div className="mt-8 space-y-8">
          <div className="panel rise p-5 sm:p-6">
            <BracketView bracket={bracket} ctx={ctx} champ={champ} sim={sim} />
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            <SeedList conf="AFC" sim={sim} ctx={ctx} />
            <SeedList conf="NFC" sim={sim} ctx={ctx} />
          </div>
        </div>
      )}
    </div>
  );
}
