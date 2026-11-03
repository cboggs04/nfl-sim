"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { pct } from "@/components/ProbCell";
import Headshot from "@/components/Headshot";
import TeamLogo from "@/components/TeamLogo";
import { getTeam, getTradeCandidates, runWhatIf } from "@/lib/api";
import { teamInfo } from "@/lib/teams";
import type { GameView, SeasonResponse, TeamOdds, TradeCandidate } from "@/lib/types";

const PRESETS = [
  { label: "Big free-agent haul", delta: 50 },
  { label: "Star QB signed", delta: 80 },
  { label: "QB injured", delta: -80 },
  { label: "Rebuilding", delta: -40 },
];

const N_SIMS = 2000;
// A replacement-level backup adds about -30 Elo (QbConfig.prior x elo_per_epa in engine/qb.py).
const BACKUP_ADJ = -30;

interface Swap {
  a: TradeCandidate;
  aTeam: string;
  b: TradeCandidate;
  bTeam: string;
}

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
      {value === 0 ? "—" : `${value > 0 ? "▲" : "▼"} ${Math.abs(value).toFixed(digits)} ${unit}`}
    </span>
  );
}

function TeamSelect({ value, onChange, teams, label }: { value: string; onChange: (t: string) => void; teams: TeamOdds[]; label: string }) {
  return (
    <select
      aria-label={label}
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

export default function WhatIfSandbox({ baseline, initialTeam }: { baseline: TeamOdds[]; initialTeam?: string }) {
  const teams = [...baseline].sort((a, b) => a.name.localeCompare(b.name));
  const base = Object.fromEntries(baseline.map((t) => [t.team, t]));

  const startTeam = teams.find((t) => t.team === initialTeam?.toUpperCase())?.team ?? teams[0].team; // (a team page can link here with ?team=)
  const [boostTeam, setBoostTeam] = useState(startTeam);
  const [delta, setDelta] = useState(50);
  const [adjust, setAdjust] = useState<Record<string, number>>({});

  const [forceTeam, setForceTeam] = useState(startTeam);
  const [games, setGames] = useState<GameView[] | null>(null);
  const [forced, setForced] = useState<Record<string, Forced>>({});

  // trades: one player for another (each team has to get a player back)
  const [tradeFrom, setTradeFrom] = useState(startTeam);
  const [tradeTo, setTradeTo] = useState(teams.find((t) => t.team !== startTeam)!.team);
  const [candFrom, setCandFrom] = useState<TradeCandidate[] | null>(null);
  const [candTo, setCandTo] = useState<TradeCandidate[] | null>(null);
  const [pickFrom, setPickFrom] = useState("");
  const [pickTo, setPickTo] = useState("");
  const [swaps, setSwaps] = useState<Swap[]>([]);

  // (the player lists load when a team is chosen, and for the two starting teams when the page opens)
  async function loadSide(team: string, side: "from" | "to") {
    if (side === "from") {
      setTradeFrom(team);
      setCandFrom(null);
    } else {
      setTradeTo(team);
      setCandTo(null);
    }
    try {
      const c = await getTradeCandidates(team);
      if (side === "from") {
        setCandFrom(c);
        setPickFrom(c[0]?.id ?? "");
      } else {
        setCandTo(c);
        setPickTo(c[0]?.id ?? "");
      }
    } catch {
      if (side === "from") setCandFrom([]);
      else setCandTo([]);
    }
  }
  const secondTeam = teams.find((t) => t.team !== startTeam)!.team;
  useEffect(() => {
    let cancelled = false;
    Promise.all([getTradeCandidates(startTeam), getTradeCandidates(secondTeam)])
      .then(([a, b]) => {
        if (cancelled) return;
        setCandFrom(a);
        setPickFrom(a[0]?.id ?? "");
        setCandTo(b);
        setPickTo(b[0]?.id ?? "");
      })
      .catch(() => {
        if (!cancelled) {
          setCandFrom([]);
          setCandTo([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [startTeam, secondTeam]);
  const playerFrom = candFrom?.find((c) => c.id === pickFrom);
  const playerTo = candTo?.find((c) => c.id === pickTo);
  const trades = swaps.flatMap((w) => [
    { player: w.a, from: w.aTeam, to: w.bTeam },
    { player: w.b, from: w.bTeam, to: w.aTeam },
  ]);

  const [result, setResult] = useState<SeasonResponse | null>(null);
  const [ran, setRan] = useState<{ adjust: Record<string, number>; forced: Record<string, Forced>; trades: { player: TradeCandidate; from: string; to: string }[] } | null>(null); // the changes behind `result`
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const winChance = 1 / (1 + 10 ** (-delta / 400));
  const changes = Object.keys(adjust).length + Object.keys(forced).length + swaps.length;

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
  const firstTeam = startTeam;
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
      const res = await runWhatIf({
        rating_adjustments: adjust,
        trades: trades.map((t) => ({ player_id: t.player.id, from_team: t.from, to_team: t.to })),
        game_overrides: Object.entries(forced).map(([game_id, f]) => ({ game_id, home_win: f.homeWin })),
        n_sims: N_SIMS,
      });
      setResult(res);
      setRan({ adjust: { ...adjust }, forced: { ...forced }, trades });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setAdjust({});
    setForced({});
    setSwaps([]);
    setResult(null);
    setRan(null);
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

  // The teams you touched: boosted/hurt ones, plus any team whose game result you forced.
  const touched = ran ? [...new Set([...Object.keys(ran.adjust), ...Object.values(ran.forced).map((f) => f.team), ...ran.trades.flatMap((t) => [t.from, t.to])])] : [];
  const after = Object.fromEntries((result?.teams ?? []).map((t) => [t.team, t]));
  const describe = (team: string) => {
    const parts: string[] = [];
    if (ran && team in ran.adjust) parts.push(`${signed(ran.adjust[team])} Elo`);
    const sentOut = (result?.trade_effects ?? []).filter((e) => e.from_team === team).map((e) => e.name);
    const gotIn = (result?.trade_effects ?? []).filter((e) => e.to_team === team).map((e) => e.name);
    if (sentOut.length) {
      const net = result?.trade_deltas?.[team] ?? 0;
      parts.push(`sent ${sentOut.join(", ")}, got ${gotIn.join(", ")} (net ${signed(Math.round(net))} Elo)`);
    }
    for (const f of Object.values(ran?.forced ?? {}))
      if (f.team === team) parts.push(`${f.teamWins ? "beat" : "lost to"} ${f.opponent} (wk ${f.week})`);
    return parts.join(" · ");
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[400px_1fr]">
      <div className="min-w-0 space-y-5">
        <section className="panel p-5">
          <h2 className="font-display text-3xl text-strong">1 · Change a team</h2>
          <p className="mt-1 text-xs text-muted">Adjust a team&apos;s Elo rating, the model&apos;s measure of strength.</p>
          <div className="mt-3 flex items-center gap-3">
            <TeamLogo abbr={boostTeam} size={40} />
            <TeamSelect value={boostTeam} onChange={setBoostTeam} teams={teams} label="Team to adjust" />
          </div>
          {base[boostTeam].qb && (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted">
              <span>
                Starting QB: <b className="text-strong">{base[boostTeam].qb}</b> ({signed(Math.round(base[boostTeam].qb_adj ?? 0))} Elo)
              </span>
              <button
                onClick={() => setDelta(Math.max(-150, Math.round(BACKUP_ADJ - (base[boostTeam].qb_adj ?? 0))))}
                className="rounded-full px-3 py-1 font-semibold text-muted ring-1 ring-line hover:bg-hover hover:text-strong"
              >
                If he&apos;s out ({signed(Math.max(-150, Math.round(BACKUP_ADJ - (base[boostTeam].qb_adj ?? 0))))})
              </button>
            </div>
          )}
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
            <TeamSelect value={forceTeam} onChange={(t) => void loadGames(t)} teams={teams} label="Team whose game result to force" />
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

        <section className="panel p-5">
          <h2 className="font-display text-3xl text-strong">3 · Trade players</h2>
          <p className="mt-1 text-xs text-muted">Swap a player from each team and see how both teams&apos; odds change. Each team has to get a player back.</p>
          <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            {([
              { side: "from" as const, team: tradeFrom, cands: candFrom, pick: pickFrom, setPick: setPickFrom, label: "sends" },
              { side: "to" as const, team: tradeTo, cands: candTo, pick: pickTo, setPick: setPickTo, label: "sends" },
            ]).map((col) => (
              <div key={col.side} className="min-w-0">
                <TeamSelect value={col.team} onChange={(t) => void loadSide(t, col.side)} teams={teams} label={col.side === "from" ? "First team in the trade" : "Second team in the trade"} />
                <div className="mt-1 text-[11px] font-semibold tracking-widest text-muted uppercase">{teamInfo(col.team).name.split(" ").pop()} {col.label}</div>
                <ul className="mt-1 max-h-56 space-y-1 overflow-y-auto pr-1" role="radiogroup" aria-label={`Player ${teamInfo(col.team).name} sends`}>
                  {col.cands === null && <li className="py-3 text-center text-sm text-muted">Loading players…</li>}
                  {col.cands?.length === 0 && <li className="py-3 text-center text-sm text-muted">No tradable players found.</li>}
                  {col.cands?.map((c) => (
                    <li key={c.id}>
                      <button
                        role="radio"
                        aria-checked={col.pick === c.id}
                        onClick={() => col.setPick(c.id)}
                        className={`flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm ring-1 ${col.pick === c.id ? "bg-accent/15 ring-accent" : "bg-head ring-transparent hover:bg-hover"}`}
                      >
                        <Headshot src={c.headshot} name={c.name} color={teamInfo(col.team).primary} size={30} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-semibold text-strong">
                            {c.name} <span className="text-xs font-normal text-muted">{c.position}</span>
                          </span>
                          <span className="block text-[11px] text-muted tabular-nums">
                            {c.epa !== null ? `EPA ${c.epa >= 0 ? "+" : "−"}${Math.abs(c.epa).toFixed(1)}${c.epa_per_game !== null ? ` (${c.epa_per_game >= 0 ? "+" : "−"}${Math.abs(c.epa_per_game).toFixed(2)}/g)` : ""}` : "No EPA for this position"}
                          </span>
                        </span>
                        <span className="text-right text-xs font-semibold text-strong tabular-nums" title={c.note}>
                          {Math.round(c.value)}
                          <span className="block text-[10px] font-normal text-muted">Elo</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted">
            <b className="text-strong">Elo</b> is what the player adds to his team&apos;s rating. For quarterbacks it is measured (EPA per dropback). For other positions it is an estimate from his
            production against the league at his position. Offensive linemen, kickers and punters aren&apos;t included.
          </p>
          <button
            onClick={() => {
              if (!playerFrom || !playerTo || tradeFrom === tradeTo) return;
              setSwaps((all) => [...all.filter((w) => w.a.id !== playerFrom.id && w.b.id !== playerTo.id && w.a.id !== playerTo.id && w.b.id !== playerFrom.id), { a: playerFrom, aTeam: tradeFrom, b: playerTo, bTeam: tradeTo }]);
            }}
            disabled={!playerFrom || !playerTo || tradeFrom === tradeTo}
            className="btn btn-ghost btn-sm mt-3 text-lg"
          >
            {tradeFrom === tradeTo ? "Pick two different teams" : "Add trade"}
          </button>
          {swaps.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {swaps.map((w) => (
                <li key={w.a.id + w.b.id} className="flex items-center gap-2 bg-head px-2 py-1.5 text-sm">
                  <TeamLogo abbr={w.aTeam} size={22} />
                  <span className="min-w-0 flex-1 truncate">
                    <b>{w.a.name}</b> <span className="text-muted">⇄</span> <b>{w.b.name}</b>
                  </span>
                  <TeamLogo abbr={w.bTeam} size={22} />
                  <button onClick={() => setSwaps((all) => all.filter((x) => x !== w))} aria-label={`Remove trade of ${w.a.name} for ${w.b.name}`} className="px-1 text-muted hover:text-strong">
                    ✕
                  </button>
                </li>
              ))}
            </ul>
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
            {error}. The server may be waking up: wait a few seconds and try again.
          </p>
        )}
      </div>

      <section aria-live="polite" className="min-w-0">
        {!result ? (
          <div className="panel flex h-full min-h-72 items-center justify-center p-10 text-center text-lg text-muted">
            Make a change on the left and click Run what-if. You&apos;ll see how every team&apos;s odds shift compared with the normal projection.
          </div>
        ) : (
          <div className="space-y-6">
            {touched.length > 0 && (
              <div>
                <h2 className="font-display mb-3 text-3xl text-strong">Your {touched.length === 1 ? "team" : "teams"}</h2>
                <ul className="space-y-3">
                  {touched.map((team) => {
                    const b = base[team];
                    const a = after[team];
                    const info = teamInfo(team);
                    const stats = [
                      { label: "Exp. wins", b: b.exp_wins.toFixed(1), a: a.exp_wins.toFixed(1), d: a.exp_wins - b.exp_wins, unit: "wins", noise: 0.15 },
                      { label: "Win division", b: pct(b.p_division), a: pct(a.p_division), d: (a.p_division - b.p_division) * 100 },
                      { label: "Make playoffs", b: pct(b.p_playoffs), a: pct(a.p_playoffs), d: (a.p_playoffs - b.p_playoffs) * 100 },
                      { label: "Win Super Bowl", b: pct(b.p_super_bowl), a: pct(a.p_super_bowl), d: (a.p_super_bowl - b.p_super_bowl) * 100 },
                    ];
                    return (
                      <li
                        key={team}
                        className="panel flex flex-col gap-4 p-4 sm:flex-row sm:items-center"
                        style={{ backgroundImage: `linear-gradient(110deg, ${info.primary}33, transparent 45%), linear-gradient(180deg, var(--panel-2), var(--panel))` }}
                      >
                        <div className="flex items-center gap-4 sm:w-60">
                          <TeamLogo abbr={team} size={72} />
                          <div className="min-w-0">
                            <div className="font-display text-2xl text-strong">{info.name}</div>
                            <div className="text-xs font-semibold text-accent-ink">{describe(team)}</div>
                          </div>
                        </div>
                        <dl className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-4">
                          {stats.map((st) => (
                            <div key={st.label}>
                              <dt className="text-[11px] font-semibold tracking-widest text-muted uppercase">{st.label}</dt>
                              <dd className="mt-0.5 tabular-nums">
                                <span className="text-sm text-muted">{st.b} → </span>
                                <span className="font-display text-3xl text-strong">{st.a}</span>
                              </dd>
                              <Delta value={st.d} unit={st.unit} noise={st.noise} />
                            </div>
                          ))}
                        </dl>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          <div className="panel-flat overflow-hidden">
            <div className="flex flex-wrap items-end justify-between gap-2 border-b border-line p-4">
              <h2 className="font-display text-3xl text-strong">Biggest changes</h2>
              <p className="text-xs text-muted">
                vs. the normal projection · gray = within simulation noise (about ±1 point at {N_SIMS.toLocaleString("en-US")} runs)
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm md:min-w-[640px]">
                <thead className="border-b border-line bg-head text-xs tracking-widest text-muted uppercase">
                  <tr>
                    <th className="px-2 py-2 text-left font-semibold md:px-3">Team</th>
                    <th className="px-3 py-2 text-right font-semibold">Super Bowl</th>
                    <th className="px-3 py-2 text-right font-semibold">Playoffs</th>
                    <th className="hidden px-3 py-2 text-right font-semibold sm:table-cell">Exp. wins</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/60">
                  {shown.map(({ t, dSb, dPo, dW }) => {
                    const b = base[t.team];
                    const changed = t.team in adjust;
                    return (
                      <tr key={t.team} className="hover:bg-hover">
                        <td className="px-2 py-2 md:px-3" style={{ boxShadow: `inset 4px 0 0 ${teamInfo(t.team).primary}` }}>
                          <div className="flex items-center gap-2 pl-1 md:gap-3">
                            <TeamLogo abbr={t.team} size={34} />
                            <Link href={`/teams/${t.team}`} className="text-sm font-semibold text-strong hover:text-accent-ink hover:underline md:text-base"><span className="md:hidden">{t.name.split(" ").pop()}</span><span className="hidden md:inline">{t.name}</span></Link>
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
                        <td className="hidden px-3 py-2 text-right tabular-nums sm:table-cell">
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
          </div>
        )}
      </section>
    </div>
  );
}
