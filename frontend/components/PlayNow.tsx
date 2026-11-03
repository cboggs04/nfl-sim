"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Headshot from "@/components/Headshot";
import PlayHelp from "@/components/PlayHelp";
import TeamLogo from "@/components/TeamLogo";
import { buildSprites, type Sprites } from "@/lib/pixelSprites";
import { FootballGame, GOAL_L, GOAL_R, WORLD_W, Y_MID, type OppDrive, type Phase } from "@/lib/playNow/engine";
import { teamInfo } from "@/lib/teams";
import type { TeamOdds } from "@/lib/types";

const W = 320; // the little pixel world, drawn small and scaled up with sharp edges
const H = 180;
const FIELD_TOP = 40;

// ---------- pixel drawing helpers ----------
const DIGITS: Record<string, string[]> = {
  "0": ["111", "101", "101", "101", "111"],
  "1": ["010", "110", "010", "010", "111"],
  "2": ["111", "001", "111", "100", "111"],
  "3": ["111", "001", "111", "001", "111"],
  "4": ["101", "101", "111", "001", "001"],
  "5": ["111", "100", "111", "001", "111"],
  "6": ["111", "100", "111", "101", "111"],
  "7": ["111", "001", "010", "010", "010"],
  "8": ["111", "101", "111", "101", "111"],
  "9": ["111", "101", "111", "001", "111"],
};

function drawDigits(g: CanvasRenderingContext2D, text: string, x: number, y: number, color: string, scale = 1) {
  g.fillStyle = color;
  let cx = x;
  for (const ch of text) {
    const rows = DIGITS[ch];
    if (rows) rows.forEach((row, ry) => [...row].forEach((on, rx) => on === "1" && g.fillRect(cx + rx * scale, y + ry * scale, scale, scale)));
    cx += 4 * scale;
  }
}

/** The whole field, drawn once: crowd, striped grass, yard lines and numbers, end zones in the teams' colors, goal posts. */
function buildWorld(userColor: string, oppColor: string): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = WORLD_W;
  c.height = H;
  const g = c.getContext("2d")!;
  g.fillStyle = "#0b1226";
  g.fillRect(0, 0, WORLD_W, FIELD_TOP);
  const crowd = ["#3b82f6", "#ef4444", "#f59e0b", "#e5e7eb", "#22c55e", "#a855f7"];
  let seed = 4242;
  const rand = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  for (let i = 0; i < 1100; i++) {
    g.fillStyle = crowd[Math.floor(rand() * crowd.length)];
    g.fillRect(Math.floor(rand() * (WORLD_W - 2)), 4 + Math.floor(rand() * (FIELD_TOP - 10)), 2, 2);
  }
  g.fillStyle = "#1f2937";
  g.fillRect(0, FIELD_TOP - 4, WORLD_W, 4);
  for (let x = GOAL_L; x < GOAL_R; x += 25) {
    g.fillStyle = ((x - GOAL_L) / 25) % 2 ? "#2f8f3a" : "#37a143";
    g.fillRect(x, FIELD_TOP, 25, H - FIELD_TOP);
  }
  g.fillStyle = userColor;
  g.fillRect(0, FIELD_TOP, GOAL_L, H - FIELD_TOP);
  g.fillStyle = oppColor;
  g.fillRect(GOAL_R, FIELD_TOP, WORLD_W - GOAL_R, H - FIELD_TOP);
  g.fillStyle = "rgba(255,255,255,0.85)";
  for (let x = GOAL_L; x <= GOAL_R; x += 25) g.fillRect(x, FIELD_TOP, x % 50 === GOAL_L % 50 ? 2 : 1, H - FIELD_TOP);
  g.fillRect(GOAL_L - 1, FIELD_TOP, 3, H - FIELD_TOP);
  g.fillRect(GOAL_R - 1, FIELD_TOP, 3, H - FIELD_TOP);
  g.fillStyle = "rgba(255,255,255,0.55)";
  for (let yd = 1; yd < 100; yd++) {
    const x = GOAL_L + yd * 5;
    for (const y of [100, 124]) g.fillRect(x, y, 1, 3);
  }
  for (let k = 1; k <= 9; k++) {
    const label = String(k <= 5 ? k * 10 : (10 - k) * 10);
    const x = GOAL_L + k * 50;
    drawDigits(g, label, x - 4 * label.length / 2 + 1, FIELD_TOP + 12, "rgba(255,255,255,0.7)");
    drawDigits(g, label, x - 4 * label.length / 2 + 1, H - 18, "rgba(255,255,255,0.7)");
  }
  g.fillStyle = "rgba(255,255,255,0.18)";
  g.fillRect(0, H - 6, WORLD_W, 6);
  g.fillStyle = "#fde047"; // goal posts at the back of each end zone
  for (const px of [6, WORLD_W - 8]) {
    g.fillRect(px, 92, 2, 30);
    g.fillRect(px - 1, 90, 4, 3);
    g.fillRect(px - 1, 121, 4, 3);
  }
  return c;
}

/** A team's rating on a 0-100 scale: the weakest team in the league is 0 and the strongest is 100 (rounded down, so only one team is a 100). */
const rating100 = (elo: number, range: [number, number]) => Math.floor(Math.max(0, Math.min(100, ((elo - range[0]) / (range[1] - range[0])) * 100)) + 1e-9);

const clock = (secs: number) => `${Math.floor(secs / 60)}:${String(Math.floor(secs % 60)).padStart(2, "0")}`;

// ---------- what the screen shows, read from the game ten times a second ----------
interface Hud {
  phase: Phase;
  half: number;
  clock: string;
  user: number;
  opp: number;
  situation: string;
  message: string;
  selected: "pass" | "run";
  down: number;
  canKick: boolean;
  fgDistance: number;
  oppDrive: OppDrive | null;
  oppProgress: number;
  boost: number; // 0..1: how ready the sprint is
  carrying: boolean;
  stats: FootballGame["stats"];
}

const ordinal = (n: number) => ["", "1ST", "2ND", "3RD", "4TH"][n] ?? `${n}TH`;

function snapshot(g: FootballGame): Hud {
  const carrying = g.phase === "live" && g.ball.holder === g.controlled && (g.caught || g.playKind === "run" || g.pastLine);
  return {
    phase: g.phase,
    half: g.half,
    clock: clock(g.displayClock),
    user: g.score.user,
    opp: g.score.opp,
    situation: `${ordinal(g.down)} & ${g.toGo >= 100 - g.yardLine && g.yardLine >= 90 ? "GOAL" : g.toGo} · ${g.ownerLabel}`,
    message: g.message,
    selected: g.selected,
    down: g.down,
    canKick: g.canKick,
    fgDistance: Math.round(g.fgDistance),
    oppDrive: g.oppDrive,
    oppProgress: Math.min(1, g.oppT / g.oppDurReal),
    boost: g.phase === "live" ? Math.max(0, Math.min(1, 1 - (g.boostReady - g.t) / 2)) : 1,
    carrying,
    stats: { ...g.stats },
  };
}

const RESULT_TEXT: Record<OppDrive["result"], string> = {
  TD: "TOUCHDOWN",
  FG: "FIELD GOAL",
  PUNT: "PUNT",
  INT: "INTERCEPTION",
  DOWNS: "TURNOVER ON DOWNS",
  TIME: "TIME RUNS OUT",
};

// ---------- the team picker: flip through the teams one at a time ----------
function TeamCarousel({
  label,
  teams,
  value,
  onChange,
  range,
  ranks,
}: {
  label: string;
  teams: TeamOdds[]; // in the order they are browsed
  value: string;
  onChange: (abbr: string) => void;
  range: [number, number]; // lowest and highest rating in the league
  ranks: Record<string, number>;
}) {
  const index = Math.max(0, teams.findIndex((t) => t.team === value));
  const t = teams[index];
  const info = teamInfo(t.team);
  const go = (step: number) => onChange(teams[(index + step + teams.length) % teams.length].team);
  const r100 = rating100(t.elo, range);
  const arrow = (dir: -1 | 1) => (
    <button
      onClick={() => go(dir)}
      aria-label={dir === -1 ? `Previous team (${label})` : `Next team (${label})`}
      className="font-display flex h-14 w-10 shrink-0 items-center justify-center bg-black/35 text-4xl text-white hover:bg-black/55 sm:h-20 sm:w-14"
      style={{ clipPath: dir === -1 ? "polygon(0 50%, 100% 0, 100% 100%)" : "polygon(0 0, 100% 50%, 0 100%)" }}
    >
      <span className="sr-only">{dir === -1 ? "Previous" : "Next"}</span>
    </button>
  );

  return (
    <section
      className="panel overflow-hidden outline-offset-4 focus-visible:outline-2 focus-visible:outline-accent"
      tabIndex={0}
      aria-label={`${label}: ${t.name}. Use the left and right arrow keys to change team.`}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          go(-1);
        } else if (e.key === "ArrowRight") {
          e.preventDefault();
          go(1);
        }
      }}
      style={{ backgroundColor: "var(--card-end)", backgroundImage: `linear-gradient(135deg, ${info.primary}ee 0%, ${info.primary}66 48%, var(--card-end) 100%)` }}
    >
      <div className="flex items-center justify-between px-4 pt-3 text-white">
        <span className="text-xs font-semibold tracking-widest text-white/80 uppercase">{label}</span>
        <span className="font-pixel text-[9px] text-white/80 tabular-nums">
          {index + 1} / {teams.length}
        </span>
      </div>

      <div className="flex items-center gap-1 px-2 pb-4 sm:gap-3 sm:px-4">
        {arrow(-1)}
        <div key={t.team} className="rise min-w-0 flex-1 text-center text-white">
          <div className="flex items-center justify-center gap-4 sm:gap-6">
            <TeamLogo abbr={t.team} size={120} />
            <div className="flex w-28 flex-col items-center gap-1 sm:w-32">
              <Headshot src={t.qb_headshot ?? null} name={t.qb ?? t.name} color="#ffffff" size={96} />
              <div className="text-[9px] font-semibold tracking-widest text-white/70 uppercase">Quarterback</div>
              <div className="font-display text-xl leading-none [text-shadow:0_2px_8px_rgba(0,0,0,.55)]">{t.qb ?? "TBD"}</div>
            </div>
          </div>

          <div className="mt-2 text-xs font-semibold tracking-[0.2em] text-white/75 uppercase">{t.division}</div>
          <h3 className="font-display text-4xl [text-shadow:0_2px_10px_rgba(0,0,0,.55)] sm:text-5xl">{t.name}</h3>

          <div className="mt-2 flex items-end justify-center gap-3">
            <div>
              <div className="text-[10px] font-semibold tracking-widest text-white/70 uppercase">Team rating</div>
              <div className="font-display text-6xl tabular-nums [text-shadow:0_2px_10px_rgba(0,0,0,.55)]">
                {r100}
                <span className="ml-1 text-2xl text-white/70">/100</span>
              </div>
            </div>
            <div className="pb-2 text-left text-xs text-white/80">
              <div className="font-semibold text-white">
                #{ranks[t.team]} of {teams.length}
              </div>
              <div>
                {t.record.wins}-{t.record.losses}
                {t.record.ties ? `-${t.record.ties}` : ""} this season
              </div>
            </div>
          </div>
          <div className="mx-auto mt-2 h-2 max-w-xs overflow-hidden rounded-full bg-black/35" role="img" aria-label={`Rating ${r100} out of 100, ranked ${ranks[t.team]} of ${teams.length}`}>
            <div className="h-full rounded-full bg-white/90" style={{ width: `${Math.max(3, r100)}%` }} />
          </div>
        </div>
        {arrow(1)}
      </div>
    </section>
  );
}

function TeamSelect({ teams, onStart }: { teams: TeamOdds[]; onStart: (user: string, opp: string) => void }) {
  const alphabetical = useMemo(() => [...teams].sort((a, b) => a.name.localeCompare(b.name)), [teams]);
  const byStrength = useMemo(() => [...teams].sort((a, b) => b.elo - a.elo), [teams]);
  const ranks = useMemo(() => Object.fromEntries(byStrength.map((t, i) => [t.team, i + 1])), [byStrength]);
  const range = useMemo<[number, number]>(() => [byStrength[byStrength.length - 1].elo, byStrength[0].elo], [byStrength]);
  const [user, setUser] = useState(byStrength[0].team);
  const [opp, setOpp] = useState(byStrength[1].team);
  const u = teams.find((t) => t.team === user)!;
  const o = teams.find((t) => t.team === opp)!;
  const diff = u.elo - o.elo;
  const diff100 = rating100(u.elo, range) - rating100(o.elo, range);
  const matchup =
    user === opp
      ? "Pick two different teams"
      : Math.abs(diff) < 40
        ? "An even matchup"
        : diff > 0
          ? `You're the favorite (+${diff100} rating points)`
          : `You're the underdog (${diff100} rating points)`;
  const winPct = Math.round(100 / (1 + 10 ** (-diff / 400)));

  return (
    <div>
      <p className="mt-3 max-w-2xl text-sm text-muted">
        Run the offense. Throw to your receivers, scramble, pick your plays and go for the end zone. Between your drives the other team&apos;s
        possessions are simulated from the two teams&apos; ratings, so a stronger team has a real edge. Two short halves, about two minutes each.
      </p>
      <p className="mt-2 rounded-md bg-accent/10 px-3 py-2 text-sm text-accent-ink ring-1 ring-accent/30 md:hidden">You need a keyboard to play this: open it on a computer.</p>
      <p className="mt-4 text-xs text-muted">Flip through the teams with the arrows (or click a card and use ← →).</p>
      <div className="mt-3 grid gap-4 lg:grid-cols-2">
        <TeamCarousel label="Your team (offense)" teams={alphabetical} value={user} onChange={setUser} range={range} ranks={ranks} />
        <TeamCarousel label="Opponent" teams={alphabetical} value={opp} onChange={setOpp} range={range} ranks={ranks} />
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-4">
        <button onClick={() => onStart(user, opp)} disabled={user === opp} className="btn btn-primary text-2xl">
          Kick off
        </button>
        <div>
          <div className="text-sm font-semibold text-strong">{matchup}</div>
          {user !== opp && <div className="text-xs text-muted">The ratings give {u.team} about a {winPct}% chance in a normal game.</div>}
        </div>
      </div>
      <p className="mt-6 text-sm text-muted">
        New to it? Click the <b className="text-strong">?</b> at the top right for the controls and how to play.
      </p>
    </div>
  );
}

// ---------- the game ----------
function GameScreen({ user, opp, teams, onExit, paused, onHelp }: { user: TeamOdds; opp: TeamOdds; teams: TeamOdds[]; onExit: () => void; paused: boolean; onHelp: () => void }) {
  void teams;
  const [manualPause, setManualPause] = useState(false); // the Pause button (or Esc)
  const stopped = paused || manualPause; // paused by the help panel or by the player
  const pausedRef = useRef(stopped);
  const [game, setGame] = useState(() => new FootballGame({ abbr: user.team, name: user.name, rating: user.elo }, { abbr: opp.team, name: opp.name, rating: opp.elo }));
  const [hud, setHud] = useState<Hud>(() => snapshot(game));
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const keys = useRef(new Set<string>());
  const uInfo = teamInfo(user.team);
  const oInfo = teamInfo(opp.team);

  const restart = () => {
    const g = new FootballGame({ abbr: user.team, name: user.name, rating: user.elo }, { abbr: opp.team, name: opp.name, rating: opp.elo });
    setGame(g);
    setHud(snapshot(g));
    setManualPause(false);
    keys.current.clear();
  };

  // While paused (help open, or the Pause button) the game stands still and ignores the keyboard.
  useEffect(() => {
    pausedRef.current = stopped;
    if (stopped) {
      keys.current.clear();
      game.setMove(0, 0);
    }
  }, [stopped, game]);

  // Leaving the tab pauses the game so a play isn't lost.
  useEffect(() => {
    const onHide = () => {
      if (document.hidden) setManualPause(true);
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, []);

  // (development only) lets tests look at the game while it is being played
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") (window as unknown as { __pn?: FootballGame }).__pn = game;
  }, [game]);

  // ---- keyboard ----
  useEffect(() => {
    (document.activeElement as HTMLElement | null)?.blur?.();
    const updateMove = () => {
      const k = keys.current;
      const dx = (k.has("right") ? 1 : 0) - (k.has("left") ? 1 : 0);
      const dy = (k.has("down") ? 1 : 0) - (k.has("up") ? 1 : 0);
      game.setMove(dx, dy);
    };
    const dirOf = (code: string) =>
      code === "ArrowLeft" || code === "KeyA" ? "left" : code === "ArrowRight" || code === "KeyD" ? "right" : code === "ArrowUp" || code === "KeyW" ? "up" : code === "ArrowDown" || code === "KeyS" ? "down" : null;
    const onDown = (e: KeyboardEvent) => {
      if (e.code === "Escape" && !paused && !e.repeat) {
        // (when the help is open, Esc closes the help instead)
        e.preventDefault();
        setManualPause((p) => !p);
        return;
      }
      if (pausedRef.current) return;
      if ((e.target as HTMLElement)?.closest?.("select, input, textarea")) return;
      const dir = dirOf(e.code);
      const game_ = game;
      if (dir || ["Space", "Enter", "Digit1", "Digit2", "Digit3", "KeyF", "KeyP"].includes(e.code)) e.preventDefault();
      if (dir) {
        keys.current.add(dir);
        if (game_.phase === "presnap" && !e.repeat) {
          if (dir === "left") game_.press("selectPass");
          if (dir === "right") game_.press("selectRun");
        }
        updateMove();
        return;
      }
      if (e.repeat) return;
      switch (e.code) {
        case "Space":
          game_.press(game_.phase === "live" ? "boost" : "snap");
          break;
        case "Enter":
          game_.press("continue");
          break;
        case "Digit1":
          game_.press("throw1");
          break;
        case "Digit2":
          game_.press("throw2");
          break;
        case "Digit3":
          game_.press("throw3");
          break;
        case "KeyF":
          game_.press("fieldGoal");
          break;
        case "KeyP":
          game_.press("punt");
          break;
        default:
          break;
      }
    };
    const onUp = (e: KeyboardEvent) => {
      const dir = dirOf(e.code);
      if (dir) {
        keys.current.delete(dir);
        updateMove();
      }
    };
    const onBlur = () => {
      keys.current.clear();
      game.setMove(0, 0);
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [game, paused]);

  // ---- the loop: advance the game, draw it, and keep the scoreboard in step ----
  useEffect(() => {
    const canvas = canvasRef.current!;
    const g = canvas.getContext("2d")!;
    g.imageSmoothingEnabled = false;
    const world = buildWorld(uInfo.primary, oInfo.primary);
    const makeSet = (primary: string, secondary: string, skin: string) => ({ R: buildSprites(primary, secondary, false, skin), L: buildSprites(primary, secondary, true, skin) });
    const mine = makeSet(uInfo.primary, uInfo.secondary, "#e0ac69");
    const theirs = makeSet(oInfo.primary, oInfo.secondary, "#8d5524");
    let camX = 0;
    let raf = 0;
    let last = performance.now();
    let sinceHud = 0;

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!pausedRef.current) game.update(dt);

      // camera: follow the ball, or look at the line of scrimmage before the snap
      const holder = game.ball.holder ? game.ent(game.ball.holder) : undefined;
      let focus = game.losX + 36;
      if (game.phase === "live") focus = game.ball.flight ? game.ball.x : (holder?.x ?? game.losX) + 30;
      if (game.phase === "kick" && game.kick) focus = game.kick.x0 + (game.kick.x1 - game.kick.x0) * Math.min(1, game.kick.t / game.kick.dur) + 30;
      if (game.phase === "result" && holder) focus = holder.x + 20;
      const target = Math.max(0, Math.min(WORLD_W - W, focus - W * 0.45));
      camX += (target - camX) * Math.min(1, 5 * dt);

      g.drawImage(world, Math.round(camX), 0, W, H, 0, 0, W, H);
      const sx = (x: number) => Math.round(x - camX);

      // the line of scrimmage and the line to gain
      if (game.phase === "presnap" || game.phase === "live") {
        g.fillStyle = "rgba(96,165,250,0.9)";
        g.fillRect(sx(game.losX), FIELD_TOP, 2, H - FIELD_TOP);
        g.fillStyle = "rgba(250,204,21,0.95)";
        g.fillRect(sx(game.firstDownX), FIELD_TOP, 2, H - FIELD_TOP);
      }

      // route lines for the receivers
      if ((game.phase === "presnap" ? game.selected : game.playKind) === "pass") {
        g.fillStyle = "rgba(255,255,255,0.55)";
        for (const e of game.ents) {
          if (!e.route || e.side !== "off" || (game.phase === "live" && (game.ball.flight || game.caught))) continue;
          let px = e.x;
          let py = e.y;
          for (let i = e.route.i; i < e.route.pts.length; i++) {
            const [tx, ty] = e.route.pts[i];
            const n = Math.max(1, Math.floor(Math.hypot(tx - px, ty - py) / 5));
            for (let k = 1; k <= n; k += 2) g.fillRect(sx(px + ((tx - px) * k) / n), Math.round(py + ((ty - py) * k) / n), 1, 1);
            px = tx;
            py = ty;
          }
        }
      }

      // the players, back to front
      const cheering = game.phase === "result" && game.scoredTD;
      const step = Math.floor(now / 110) % 2 ? "run1" : "run2";
      const ordered = [...game.ents].sort((a, b) => a.y - b.y);
      for (const e of ordered) {
        const set: Sprites = (e.side === "off" ? mine : theirs)[e.face === 1 ? "R" : "L"];
        const sprite = cheering && e.side === "off" ? set.cheer : e.moving ? set[step] : set.stand;
        const bob = cheering && e.side === "off" ? -Math.abs(Math.sin(now / 110)) * 4 : 0;
        const x = sx(e.x);
        const y = Math.round(e.y + bob);
        g.fillStyle = "rgba(0,0,0,0.28)";
        g.fillRect(x - 3, y + 5, 7, 2);
        g.drawImage(sprite, x - 4, y - sprite.height + 6);
      }

      // receiver numbers and a marker over the player you control
      if ((game.phase === "presnap" || game.phase === "live") && (game.phase === "presnap" ? game.selected : game.playKind) === "pass" && !game.caught && !game.ball.flight && !game.pastLine) {
        for (const e of game.ents) {
          if (!e.num) continue;
          const x = sx(e.x) - 3;
          const y = Math.round(e.y) - 22;
          g.fillStyle = "#facc15";
          g.fillRect(x - 2, y - 1, 9, 9);
          drawDigits(g, String(e.num), x + 1, y + 1, "#111827");
        }
      }
      const me = game.ent(game.controlled);
      if (me && (game.phase === "live" || game.phase === "presnap")) {
        const x = sx(me.x);
        const y = Math.round(me.y) - 20;
        g.fillStyle = "#38bdf8";
        g.fillRect(x - 2, y - 4, 5, 1);
        g.fillRect(x - 1, y - 3, 3, 1);
        g.fillRect(x, y - 2, 1, 1);
      }

      // the ball
      let bx = game.ball.x;
      let by = game.ball.y - game.ball.z;
      if (game.phase === "kick" && game.kick) {
        const u = Math.min(1, game.kick.t / game.kick.dur);
        bx = game.kick.x0 + (game.kick.x1 - game.kick.x0) * u;
        by = Y_MID - 6 - Math.sin(Math.PI * u) * (game.kick.type === "fg" ? 46 : 62);
      }
      if (game.ball.flight) {
        g.fillStyle = "rgba(0,0,0,0.25)";
        g.fillRect(sx(game.ball.x) - 2, Math.round(game.ball.y) + 1, 4, 1);
      }
      g.fillStyle = "#7c3f12";
      g.fillRect(sx(bx) - 2, Math.round(by) - 1, 4, 2);
      g.fillStyle = "#e5e7eb";
      g.fillRect(sx(bx), Math.round(by) - 1, 1, 1);

      sinceHud += dt;
      if (sinceHud >= 0.1) {
        sinceHud = 0;
        setHud(snapshot(game));
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [game, uInfo.primary, uInfo.secondary, oInfo.primary, oInfo.secondary]);

  const act = (a: Parameters<FootballGame["press"]>[0]) => {
    game.press(a);
    (document.activeElement as HTMLElement | null)?.blur?.();
    setHud(snapshot(game));
  };

  const d = hud.oppDrive;
  const final = hud.phase === "final";
  const winText = hud.user > hud.opp ? "YOU WIN!" : hud.user < hud.opp ? "YOU LOSE" : "TIE GAME";

  return (
    <div data-phase={hud.phase} data-half={hud.half}>
      <div className="mx-auto max-w-4xl">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="font-pixel text-[10px] text-muted sm:text-xs">{hud.half === 1 ? "1ST HALF" : "2ND HALF"}</div>
          <div className="flex gap-2">
            {!final && (
              <button
                onClick={() => {
                  setManualPause((p) => !p);
                  (document.activeElement as HTMLElement | null)?.blur?.();
                }}
                aria-pressed={manualPause}
                className="font-pixel rounded bg-head px-3 py-2 text-[10px] text-strong ring-1 ring-line hover:bg-hover"
              >
                {manualPause ? "RESUME" : "PAUSE"}
              </button>
            )}
            <button onClick={onExit} className="font-pixel rounded bg-head px-3 py-2 text-[10px] text-strong ring-1 ring-line hover:bg-hover">
              QUIT
            </button>
          </div>
        </div>
        <div className="overflow-hidden rounded-lg border-4 border-white/70 bg-black shadow-2xl shadow-black/40">
          <div className="font-pixel flex items-stretch justify-between bg-[#111827] text-white">
            <div className="flex flex-1 items-center justify-between gap-2 border-b-4 px-3 py-2" style={{ borderColor: uInfo.primary }}>
              <span className="text-[10px] sm:text-sm">{user.team}</span>
              <span className="text-lg text-yellow-300 tabular-nums sm:text-3xl" data-testid="score-user">
                {String(hud.user).padStart(2, "0")}
              </span>
            </div>
            <div className="flex min-w-[8.5rem] flex-col items-center justify-center px-2 text-center">
              <span className="text-sm tabular-nums sm:text-xl" data-testid="clock">
                {hud.clock}
              </span>
              <span className="text-[7px] text-white/70 sm:text-[9px]">{hud.situation}</span>
            </div>
            <div className="flex flex-1 items-center justify-between gap-2 border-b-4 px-3 py-2" style={{ borderColor: oInfo.primary }}>
              <span className="text-lg text-yellow-300 tabular-nums sm:text-3xl" data-testid="score-opp">
                {String(hud.opp).padStart(2, "0")}
              </span>
              <span className="text-[10px] sm:text-sm">{opp.team}</span>
            </div>
          </div>

          <div className="relative">
            <canvas ref={canvasRef} width={W} height={H} className="block w-full" style={{ imageRendering: "pixelated", aspectRatio: `${W} / ${H}` }} />

            {(hud.phase === "result" || hud.phase === "kick") && (hud.message || hud.phase === "kick") && (
              <div className="font-pixel pointer-events-none absolute inset-x-0 top-[28%] flex justify-center px-2">
                <span className="rounded bg-black/70 px-3 py-2 text-center text-[10px] text-yellow-300 [text-shadow:2px_2px_0_#000] sm:text-lg">
                  {hud.phase === "kick" ? "KICK..." : hud.message}
                </span>
              </div>
            )}

            {hud.phase === "presnap" && (
              <div className="pointer-events-none absolute inset-x-0 top-2 flex justify-center">
                <span className="font-pixel rounded bg-black/60 px-2 py-1 text-[8px] text-white sm:text-[10px]">{hud.down === 4 ? "4TH DOWN: CHOOSE" : "PICK A PLAY, THEN SNAP"}</span>
              </div>
            )}

            {manualPause && !final && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-black/75 p-3 text-center" role="status" aria-live="polite">
                <div className="font-pixel text-lg text-yellow-300 sm:text-4xl">PAUSED</div>
                <div className="font-pixel text-[8px] text-white/70 sm:text-[10px]">THE CLOCK IS STOPPED</div>
                <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
                  <button onClick={() => setManualPause(false)} className="btn btn-primary text-lg">
                    Resume
                  </button>
                  <button onClick={onHelp} className="btn btn-ghost text-lg">
                    How to play
                  </button>
                  <button onClick={onExit} className="btn btn-ghost text-lg">
                    Quit game
                  </button>
                </div>
                <div className="font-pixel mt-1 text-[8px] text-white/50">OR PRESS ESC</div>
              </div>
            )}

            {hud.phase === "opp" && d && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/75 p-3 text-center">
                <div className="font-pixel text-[9px] text-white/80 sm:text-xs">{opp.name.toUpperCase()} HAVE THE BALL</div>
                <div className="font-pixel text-[8px] text-white/60 sm:text-[10px]">STARTING AT THEIR {d.start}</div>
                <div className="h-2 w-2/3 overflow-hidden rounded bg-white/15">
                  <div className="h-full bg-yellow-300" style={{ width: `${hud.oppProgress * 100}%` }} />
                </div>
                {hud.oppProgress > 0.6 && (
                  <>
                    <div className="font-pixel rise text-sm text-yellow-300 [text-shadow:2px_2px_0_#000] sm:text-2xl">
                      {RESULT_TEXT[d.result]}
                      {d.pts > 0 ? ` +${d.pts}` : ""}
                    </div>
                    <div className="font-pixel text-[8px] text-white/70 sm:text-[10px]">
                      {d.plays} PLAYS · {d.yards} YARDS · {clock(d.seconds)}
                    </div>
                  </>
                )}
                <div className="font-pixel mt-1 text-[8px] text-white/50">ENTER: SKIP</div>
              </div>
            )}

            {hud.phase === "halftime" && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/80 p-3 text-center">
                <div className="font-pixel text-xs text-yellow-300 sm:text-2xl">HALFTIME</div>
                <div className="font-pixel text-sm text-white sm:text-3xl">
                  {user.team} {hud.user} - {hud.opp} {opp.team}
                </div>
                <button onClick={() => act("continue")} className="btn btn-primary mt-2 text-xl">
                  Start 2nd half
                </button>
                <div className="font-pixel text-[8px] text-white/50">OR PRESS ENTER</div>
              </div>
            )}

            {final && (
              <div className="rise absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/80 p-3 text-center sm:gap-2">
                <div className="font-pixel text-[9px] text-white/70 sm:text-xs">FINAL</div>
                <div className="font-pixel text-base text-white sm:text-4xl">
                  {user.team} {hud.user} - {hud.opp} {opp.team}
                </div>
                <div className={`font-pixel text-sm sm:text-2xl ${hud.user >= hud.opp ? "text-yellow-300" : "text-red-300"}`}>{winText}</div>
                <div className="font-pixel text-[7px] leading-relaxed text-white/70 sm:text-[10px]">
                  PASSING {hud.stats.passComp}/{hud.stats.passAtt}, {hud.stats.passYds} YDS · RUSHING {hud.stats.rushYds} YDS
                  <br />
                  SACKS {hud.stats.sacks} · INTS {hud.stats.ints} · FIRST DOWNS {hud.stats.firstDowns}
                </div>
                <div className="mt-1 flex gap-2">
                  <button onClick={restart} className="btn btn-primary text-lg">
                    Play again
                  </button>
                  <button onClick={onExit} className="btn btn-ghost text-lg">
                    Change teams
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* controls for the moment you're in */}
          <div className="bg-[#111827] px-3 py-3 text-white">
            {hud.phase === "presnap" && hud.down < 4 && (
              <div className="flex flex-wrap items-center justify-center gap-2">
                {(["pass", "run"] as const).map((k) => (
                  <button
                    key={k}
                    onClick={() => act(k === "pass" ? "selectPass" : "selectRun")}
                    aria-pressed={hud.selected === k}
                    className={`font-pixel rounded px-3 py-2 text-[10px] ${hud.selected === k ? "bg-yellow-300 text-black" : "bg-white/15 text-white hover:bg-white/25"}`}
                  >
                    {k === "pass" ? "← PASS" : "RUN →"}
                  </button>
                ))}
                <button onClick={() => act("snap")} className="font-pixel rounded bg-emerald-400 px-4 py-2 text-[10px] text-black hover:bg-emerald-300">
                  SNAP (SPACE)
                </button>
              </div>
            )}
            {hud.phase === "presnap" && hud.down === 4 && (
              <div className="flex flex-wrap items-center justify-center gap-2">
                <button onClick={() => act("snap")} className="font-pixel rounded bg-emerald-400 px-3 py-2 text-[10px] text-black hover:bg-emerald-300">
                  GO FOR IT (SPACE)
                </button>
                <button
                  onClick={() => act("fieldGoal")}
                  disabled={!hud.canKick}
                  className="font-pixel rounded bg-yellow-300 px-3 py-2 text-[10px] text-black hover:bg-yellow-200 disabled:opacity-40"
                >
                  FIELD GOAL (F) {hud.canKick ? `${hud.fgDistance} YD` : "TOO FAR"}
                </button>
                <button onClick={() => act("punt")} className="font-pixel rounded bg-white/20 px-3 py-2 text-[10px] text-white hover:bg-white/30">
                  PUNT (P)
                </button>
              </div>
            )}
            {hud.phase === "live" && (
              <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1">
                <span className="font-pixel text-[8px] text-white/80 sm:text-[10px]">ARROWS MOVE · 1 2 3 THROW</span>
                <span className="font-pixel flex items-center gap-2 text-[8px] text-white/80 sm:text-[10px]">
                  SPRINT (SPACE)
                  <span className="inline-block h-2 w-16 overflow-hidden rounded bg-white/20">
                    <span className={`block h-full ${hud.boost >= 1 ? "bg-emerald-400" : "bg-white/50"}`} style={{ width: `${hud.boost * 100}%` }} />
                  </span>
                </span>
              </div>
            )}
            {hud.phase !== "presnap" && hud.phase !== "live" && <div className="font-pixel h-4 text-center text-[8px] text-white/40">&nbsp;</div>}
          </div>
        </div>
        <p className="mt-2 text-center text-xs text-muted">The other team&apos;s drives are simulated from the two teams&apos; ratings. You play every snap of yours.</p>
      </div>
    </div>
  );
}

export default function PlayNow({ teams }: { teams: TeamOdds[] }) {
  const [setup, setSetup] = useState<{ user: string; opp: string } | null>(null);
  const [help, setHelp] = useState(false);
  const closeHelp = useCallback(() => setHelp(false), []);
  const user = setup ? teams.find((t) => t.team === setup.user) : undefined;
  const opp = setup ? teams.find((t) => t.team === setup.opp) : undefined;

  // "?" opens the help from anywhere on the page (unless you are typing in a field)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "?" || (e.target as HTMLElement)?.closest?.("select, input, textarea")) return;
      e.preventDefault();
      setHelp(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <h1 className="font-display text-5xl text-strong sm:text-8xl">
          Play <span className="text-accent-ink">Now</span>
        </h1>
        <button
          onClick={() => setHelp(true)}
          aria-label="How to play and controls"
          title="How to play and controls"
          className="font-display mt-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent text-3xl text-on-accent shadow-md hover:brightness-110 sm:mt-4 sm:h-14 sm:w-14 sm:text-4xl"
        >
          ?
        </button>
      </div>
      {setup && user && opp ? (
        <GameScreen user={user} opp={opp} teams={teams} onExit={() => setSetup(null)} paused={help} onHelp={() => setHelp(true)} />
      ) : (
        <TeamSelect teams={teams} onStart={(u, o) => setSetup({ user: u, opp: o })} />
      )}
      {help && <PlayHelp onClose={closeHelp} />}
    </div>
  );
}
