"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Headshot from "@/components/Headshot";
import PageHeader from "@/components/PageHeader";
import PlayHelp from "@/components/PlayHelp";
import TeamLogo from "@/components/TeamLogo";
import { buildSprites, type Sprites } from "@/lib/pixelSprites";
import { FootballGame, GOAL_L, GOAL_R, PLAYS, ROUTES, WORLD_W, Y_MAX, Y_MID, Y_MIN, type Difficulty, type PlayDef, type OppDrive, type Phase } from "@/lib/playNow/engine";
import { useShortLandscape } from "@/lib/useShortLandscape";
import { colorDistance, JERSEYS, jerseyColors, logoSrc, teamInfo, type Jersey } from "@/lib/teams";
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
  Z: ["111", "001", "010", "100", "111"],
  X: ["101", "101", "010", "101", "101"],
  C: ["111", "100", "100", "100", "111"],
  A: ["010", "101", "111", "101", "101"],
  S: ["111", "100", "111", "001", "111"],
  D: ["110", "101", "101", "101", "110"],
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

/**
 * A team's rating like a Madden overall, from its Elo with FIXED anchors so the number only changes when the team's own Elo does:
 * an average team (1500 Elo) is an 80, and every 100 Elo points is 8 rating points. The best teams land in the mid-90s and the
 * weakest in the mid-60s. Capped at 99 (and 40 at the bottom).
 */
const RATING_AVERAGE = 80;
const RATING_PER_100_ELO = 8;
const RATING_MIN = 40;
const RATING_MAX = 99;
const rating100 = (elo: number) => Math.round(Math.max(RATING_MIN, Math.min(RATING_MAX, RATING_AVERAGE + ((elo - 1500) / 100) * RATING_PER_100_ELO)));

const clock = (secs: number) => `${Math.floor(secs / 60)}:${String(Math.floor(secs % 60)).padStart(2, "0")}`;

// ---------- what the screen shows, read from the game ten times a second ----------
interface Hud {
  phase: Phase;
  half: number;
  quarter: number; // 1..4
  clock: string;
  user: number;
  opp: number;
  situation: string;
  message: string;
  selected: "pass" | "run";
  choice: number; // which of the three plays is picked
  plays: PlayDef[]; // the three on offer
  down: number;
  canKick: boolean;
  fgDistance: number;
  oppDrive: OppDrive | null;
  oppProgress: number;
  boost: number; // 0..1: how ready the sprint is
  carrying: boolean;
  canThrow: boolean; // a pass play where the ball hasn't been thrown yet
  stats: FootballGame["stats"];
}

const ordinal = (n: number) => ["", "1ST", "2ND", "3RD", "4TH"][n] ?? `${n}TH`;

function snapshot(g: FootballGame): Hud {
  const carrying = g.phase === "live" && g.ball.holder === g.controlled && (g.caught || g.playKind === "run" || g.pastLine);
  return {
    phase: g.phase,
    half: g.half,
    quarter: g.quarter,
    clock: clock(g.displayClock),
    user: g.score.user,
    opp: g.score.opp,
    situation: `${ordinal(g.down)} & ${g.toGo >= 100 - g.yardLine && g.yardLine >= 90 ? "GOAL" : g.toGo} · ${g.ownerLabel}`,
    message: g.message,
    selected: g.selected,
    choice: g.choice[g.selected],
    plays: g.offered[g.selected].map((i) => PLAYS[g.selected][i]),
    down: g.down,
    canKick: g.canKick,
    fgDistance: Math.round(g.fgDistance),
    oppDrive: g.oppDrive,
    oppProgress: Math.min(1, g.oppT / g.oppDurReal),
    boost: g.phase === "live" ? Math.max(0, Math.min(1, 1 - (g.boostReady - g.t) / 1.8)) : 1,
    carrying,
    canThrow: g.phase === "live" && g.playKind === "pass" && !g.ball.flight && !g.caught && !g.pastLine,
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

const LEVELS: { id: Difficulty; label: string; blurb: string }[] = [
  { id: "rookie", label: "Rookie", blurb: "Receivers get open, the pass rush is slow and the defense misses tackles. Running is easy." },
  { id: "pro", label: "Pro", blurb: "A fair fight: tight coverage, a real pass rush and defenders who tackle." },
  { id: "allstar", label: "All-Star", blurb: "Fast defenders, tight coverage, quick pressure and sure tackles. Good luck." },
];

// ---------- phones and tablets: on-screen controls, played in landscape ----------
function useMedia(query: string, initial = false) {
  const [matches, setMatches] = useState(initial);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const update = () => setMatches(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [query]);
  return matches;
}

/** Full screen and a landscape lock, where the browser allows them (it must run from a tap, like Kick off). */
function enterTouchMode() {
  if (typeof window === "undefined" || !window.matchMedia("(pointer: coarse)").matches) return;
  const orientation = screen.orientation as unknown as { lock?: (o: string) => Promise<void> };
  void document.documentElement
    .requestFullscreen?.()
    .then(() => orientation.lock?.("landscape"))
    .catch(() => {});
}

/** Phones: the play picker is a strip over the top of the field. Tap a play and it tucks away; tap SNAP to run it. */
function TouchPlayPicker({ hud, open, onOpen, onClose, onAction }: { hud: Hud; open: boolean; onOpen: () => void; onClose: () => void; onAction: (a: Parameters<FootballGame["press"]>[0]) => void }) {
  if (!open) {
    return (
      <div className="absolute inset-x-0 flex justify-center" style={{ top: "calc(2.25rem + env(safe-area-inset-top))" }}>
        <button onClick={onOpen} className="font-pixel pointer-events-auto rounded bg-black/70 px-3 py-1.5 text-[8px] text-white ring-1 ring-white/40">
          {hud.selected === "pass" ? "PASS" : "RUN"}: {hud.plays[hud.choice].name.toUpperCase()} ▾
        </button>
      </div>
    );
  }
  const chip = (active: boolean) => `font-pixel pointer-events-auto rounded px-3 py-1 text-[8px] ring-1 ring-white/30 ${active ? "bg-yellow-300 text-black" : "bg-black/70 text-white"}`;
  return (
    <div className="pointer-events-none absolute inset-x-1 flex touch-none flex-col items-center gap-1" style={{ top: "calc(2.25rem + env(safe-area-inset-top))" }}>
      <div className="flex flex-wrap items-center justify-center gap-1.5">
        <button onClick={() => onAction("selectPass")} className={chip(hud.selected === "pass")}>
          ← PASS
        </button>
        <button onClick={() => onAction("selectRun")} className={chip(hud.selected === "run")}>
          RUN →
        </button>
        {hud.down >= 4 && (
          <>
            <button onClick={() => onAction("fieldGoal")} disabled={!hud.canKick} className={`${chip(false)} disabled:opacity-40`}>
              FIELD GOAL {hud.canKick ? `${hud.fgDistance} YD` : "TOO FAR"}
            </button>
            <button onClick={() => onAction("punt")} className={chip(false)}>
              PUNT
            </button>
          </>
        )}
      </div>
      <div className="flex w-full max-w-md justify-center gap-1.5">
        {hud.plays.map((p, i) => (
          <button
            key={p.id}
            onClick={() => {
              onAction(`play${i + 1}` as "play1" | "play2" | "play3");
              onClose();
            }}
            className={`pointer-events-auto flex min-w-0 flex-1 flex-col overflow-hidden rounded text-left ring-2 ${hud.choice === i ? "bg-yellow-300 text-black ring-white" : "bg-black/75 text-white ring-white/25"}`}
          >
            <span className="block h-9 w-full px-1 pt-0.5">
              <PlayArt play={p} />
            </span>
            <span className="font-pixel block truncate px-1.5 pb-1 text-[7px]">{p.name.toUpperCase()}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** A thumb pad on the left (8 directions) and the buttons on the right: snap / sprint, and throws to receivers A, S, D. */
function TouchControls({ hud, onDirs, onAction }: { hud: Hud; onDirs: (dirs: Set<string>) => void; onAction: (a: Parameters<FootballGame["press"]>[0]) => void }) {
  const padRef = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState<{ x: number; y: number } | null>(null);
  const fromPointer = (e: React.PointerEvent) => {
    const r = padRef.current!.getBoundingClientRect();
    const x = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
    const y = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
    const m = Math.hypot(x, y) || 1;
    const k = Math.min(1, m);
    setKnob({ x: (x / m) * k, y: (y / m) * k });
    const t = 0.32;
    const dirs = new Set<string>();
    if (x < -t) dirs.add("left");
    if (x > t) dirs.add("right");
    if (y < -t) dirs.add("up");
    if (y > t) dirs.add("down");
    onDirs(dirs);
  };
  const release = () => {
    setKnob(null);
    onDirs(new Set());
  };
  const tap = (a: Parameters<FootballGame["press"]>[0]) => (e: React.PointerEvent) => {
    e.preventDefault();
    onAction(a);
  };
  const live = hud.phase === "live";
  const playing = hud.phase === "presnap" || live;
  if (!playing) return null;
  return (
    <div className="pointer-events-none absolute inset-0 touch-none select-none" onContextMenu={(e) => e.preventDefault()}>
      <div
        ref={padRef}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          fromPointer(e);
        }}
        onPointerMove={(e) => e.currentTarget.hasPointerCapture(e.pointerId) && fromPointer(e)}
        onPointerUp={release}
        onPointerCancel={release}
        className="pointer-events-auto absolute h-24 w-24 touch-none rounded-full bg-black/30 ring-2 ring-white/50 sm:h-28 sm:w-28"
        style={{ left: "max(0.5rem, env(safe-area-inset-left))", bottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
        aria-label="Move"
      >
        <span className="absolute top-1 left-1/2 -translate-x-1/2 text-[10px] text-white/70">▲</span>
        <span className="absolute bottom-1 left-1/2 -translate-x-1/2 text-[10px] text-white/70">▼</span>
        <span className="absolute top-1/2 left-1.5 -translate-y-1/2 text-[10px] text-white/70">◀</span>
        <span className="absolute top-1/2 right-1.5 -translate-y-1/2 text-[10px] text-white/70">▶</span>
        <span
          className="absolute top-1/2 left-1/2 h-9 w-9 rounded-full bg-white/50 ring-2 ring-white/80"
          style={{ transform: `translate(calc(-50% + ${(knob?.x ?? 0) * 34}%), calc(-50% + ${(knob?.y ?? 0) * 34}%))` }}
        />
      </div>
      <div className="pointer-events-none absolute flex flex-col items-end gap-2" style={{ right: "max(0.5rem, env(safe-area-inset-right))", bottom: "max(0.5rem, env(safe-area-inset-bottom))" }}>
        {hud.canThrow && (
          <div className="flex gap-2">
            {["A", "S", "D"].map((k, i) => (
              <button
                key={k}
                onPointerDown={tap(`throw${i + 1}` as "throw1" | "throw2" | "throw3")}
                className="font-pixel pointer-events-auto flex h-12 w-12 touch-none items-center justify-center rounded-full bg-yellow-300/85 text-sm text-black ring-2 ring-white/80 active:bg-yellow-200"
                aria-label={`Throw to receiver ${k}`}
              >
                {k}
              </button>
            ))}
          </div>
        )}
        <button
          onPointerDown={tap(live ? "boost" : "snap")}
          className={`font-pixel pointer-events-auto flex h-16 w-16 touch-none items-center justify-center rounded-full text-[9px] text-black ring-2 ring-white/80 sm:h-[4.5rem] sm:w-[4.5rem] ${live && hud.boost < 1 ? "bg-white/50" : "bg-emerald-400/90 active:bg-emerald-300"}`}
        >
          {live ? "SPRINT" : "SNAP"}
        </button>
      </div>
    </div>
  );
}

// ---------- the uniform preview: opens over its team card, a pixel player in each uniform, cycle with the arrows ----------
function UniformPicker({ team, teamName, value, onChange, onClose }: { team: string; teamName: string; value: Jersey; onChange: (j: Jersey) => void; onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const idx = JERSEYS.findIndex((j) => j.id === value);
  const colors = jerseyColors(team, value);
  const go = (step: number) => onChange(JERSEYS[(idx + step + JERSEYS.length) % JERSEYS.length].id);

  useEffect(() => {
    boxRef.current?.focus(); // so the arrow keys work for this card (the other card's preview can be open at the same time)
  }, []);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const g = c.getContext("2d")!;
    g.imageSmoothingEnabled = false;
    const set = buildSprites(colors.primary, colors.secondary, false, "#e0ac69");
    const scale = 12;
    g.clearRect(0, 0, c.width, c.height);
    // three poses side by side: standing, running, celebrating
    [set.stand, set.run1, set.cheer].forEach((sprite, i) => {
      const x = 14 + i * (8 * scale + 22);
      const y = c.height - sprite.height * scale - 14;
      g.fillStyle = "rgba(0,0,0,0.25)";
      g.fillRect(x + scale, c.height - 14, 6 * scale, scale / 2);
      g.drawImage(sprite, x, y, 8 * scale, sprite.height * scale);
    });
  }, [colors.primary, colors.secondary]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.code === "ArrowLeft" || e.code === "ArrowUp") go(-1);
    else if (e.code === "ArrowRight" || e.code === "ArrowDown") go(1);
    else if (e.code === "Escape" || e.code === "Enter") onClose();
    else return;
    e.preventDefault();
    e.stopPropagation(); // (the card behind flips teams with the arrow keys; not while this is open)
  };

  return (
    <div
      ref={boxRef}
      tabIndex={-1}
      role="dialog"
      aria-label={`${teamName} uniform`}
      onKeyDown={onKey}
      className="absolute inset-0 z-20 flex flex-col text-white outline-none"
      style={{ backgroundColor: "var(--card-end)", backgroundImage: `linear-gradient(135deg, ${teamInfo(team).primary}ee 0%, ${teamInfo(team).primary}66 48%, var(--card-end) 100%)` }}
    >
      <div className="px-4 pt-3">
        <div className="text-xs font-semibold tracking-widest text-white/70 uppercase">{teamName}</div>
        <h3 className="font-display text-3xl">Uniform</h3>
      </div>
      <div className="mt-2 flex flex-1 items-center gap-2 px-2" style={{ backgroundColor: "#2f9e44", backgroundImage: "repeating-linear-gradient(90deg, rgba(255,255,255,0.07) 0 28px, transparent 28px 56px)" }}>
        <button onClick={() => go(-1)} aria-label="Previous uniform" className="font-display flex h-12 w-10 shrink-0 items-center justify-center bg-black/40 text-2xl text-white hover:bg-black/60">
          ◂
        </button>
        <canvas ref={canvasRef} width={400} height={230} className="min-h-0 min-w-0 flex-1" style={{ imageRendering: "pixelated" }} />
        <button onClick={() => go(1)} aria-label="Next uniform" className="font-display flex h-12 w-10 shrink-0 items-center justify-center bg-black/40 text-2xl text-white hover:bg-black/60">
          ▸
        </button>
      </div>
      <div className="flex flex-col items-center gap-2 px-4 py-3">
        <div className="flex items-center justify-center gap-2" role="radiogroup" aria-label="Uniform">
          {JERSEYS.map((j) => (
            <button
              key={j.id}
              role="radio"
              aria-checked={value === j.id}
              onClick={() => onChange(j.id)}
              className={`rounded-full px-3 py-1 text-sm font-semibold tracking-wide uppercase ring-1 ${value === j.id ? "bg-white text-black ring-white" : "bg-white/10 text-white ring-white/30 hover:bg-white/20"}`}
            >
              {j.label}
            </button>
          ))}
        </div>
        <button onClick={onClose} className="btn btn-primary text-xl">
          Select uniform
        </button>
      </div>
    </div>
  );
}

// ---------- the team picker: flip through the teams one at a time ----------
function TeamCarousel({
  label,
  teams,
  value,
  onChange,
  ranks,
  jersey,
  onJersey,
  arrowsNearVs = false,
}: {
  label: string;
  teams: TeamOdds[]; // in the order they are browsed
  value: string;
  onChange: (abbr: string) => void;
  ranks: Record<string, number>;
  jersey: Jersey;
  onJersey: (j: Jersey) => void;
  arrowsNearVs?: boolean; // desktop: put the arrows on the left edge, next to the VS badge
}) {
  const land = useShortLandscape(); // a phone held sideways: a smaller, tighter card so two fit side by side
  const [picking, setPicking] = useState(false);
  const index = Math.max(0, teams.findIndex((t) => t.team === value));
  const t = teams[index];
  const info = teamInfo(t.team);
  const go = (step: number) => onChange(teams[(index + step + teams.length) % teams.length].team);
  const r100 = rating100(t.elo);
  const arrow = (dir: -1 | 1) => (
    <button
      onClick={() => go(dir)}
      aria-label={dir === -1 ? `Previous team (${label})` : `Next team (${label})`}
      className="flex h-9 w-14 shrink-0 items-center justify-center bg-black/35 hover:bg-black/55 sm:h-12 sm:w-20 land:h-8 land:w-11"
      style={{ clipPath: dir === -1 ? "polygon(50% 0, 100% 100%, 0 100%)" : "polygon(0 0, 100% 0, 50% 100%)" }}
    >
      <span className="sr-only">{dir === -1 ? "Previous" : "Next"}</span>
    </button>
  );

  return (
    <section
      className="panel relative overflow-hidden outline-offset-4 focus-visible:outline-2 focus-visible:outline-accent"
      tabIndex={0}
      aria-label={`${label}: ${t.name}. Use the arrow keys to change team.`}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
          e.preventDefault();
          go(-1);
        } else if (e.key === "ArrowRight" || e.key === "ArrowDown") {
          e.preventDefault();
          go(1);
        }
      }}
      style={{ backgroundColor: "var(--card-end)", backgroundImage: `linear-gradient(135deg, ${info.primary}ee 0%, ${info.primary}66 48%, var(--card-end) 100%)` }}
    >
      {/* a big, faded copy of the team's logo behind the card */}
      <Image
        key={`bg-${t.team}`}
        src={logoSrc(t.team)}
        alt=""
        aria-hidden
        width={520}
        height={520}
        className="pointer-events-none absolute top-1/2 left-1/2 h-[440px] w-[440px] -translate-x-1/2 -translate-y-1/2 -rotate-6 opacity-[0.13] sm:h-[500px] sm:w-[500px] land:h-[280px] land:w-[280px]"
      />
      <div className="relative flex items-center justify-between px-4 pt-3 text-white land:pt-1.5">
        <span className="text-xs font-semibold tracking-widest text-white/80 uppercase">{label}</span>
        <span className="font-pixel text-[9px] text-white/80 tabular-nums">
          {index + 1} / {teams.length}
        </span>
      </div>

      <div className="relative flex items-center gap-1 px-2 pb-4 sm:gap-3 sm:px-4 land:pb-2">
        <div key={t.team} className="rise min-w-0 flex-1 text-center text-white">
          <div className="flex items-center justify-center gap-4 sm:gap-6">
            {land ? (
              <TeamLogo abbr={t.team} size={76} />
            ) : (
              <>
                <div className="sm:hidden">
                  <TeamLogo abbr={t.team} size={128} />
                </div>
                <div className="hidden sm:block">
                  <TeamLogo abbr={t.team} size={132} />
                </div>
              </>
            )}
            <div className="flex w-28 flex-col items-center gap-1 sm:w-32 land:w-24">
              <Headshot src={t.qb_headshot ?? null} name={t.qb ?? t.name} color="#ffffff" size={land ? 52 : 80} />
              <div className="text-[9px] font-semibold tracking-widest text-white/70 uppercase land:hidden">Quarterback</div>
              <div className="font-display flex h-[2em] items-center justify-center text-xl leading-none [text-shadow:0_2px_8px_rgba(0,0,0,.55)] land:h-auto land:text-base">{t.qb ?? "TBD"}</div>
            </div>
          </div>

          <div className="mt-1 text-xs font-semibold tracking-[0.2em] text-white/75 uppercase land:hidden">{t.division}</div>
          <h2 className="font-display flex h-[2em] items-center justify-center text-4xl leading-none [text-shadow:0_2px_10px_rgba(0,0,0,.55)] land:mt-1 land:h-auto land:text-3xl">{t.name}</h2>

          <div className="mt-2 flex items-end justify-center gap-3 land:mt-1">
            <div>
              <div className="text-[10px] font-semibold tracking-widest text-white/70 uppercase">Team rating</div>
              <div className="font-display text-5xl tabular-nums [text-shadow:0_2px_10px_rgba(0,0,0,.55)] land:text-4xl">
                {r100}
                <span className="ml-1 text-2xl text-white/70 land:text-xl">/100</span>
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
          <div className="mx-auto mt-2 h-2 max-w-xs overflow-hidden rounded-full bg-black/35 land:mt-1" role="img" aria-label={`Rating ${r100} out of 100, ranked ${ranks[t.team]} of ${teams.length}`}>
            <div className="h-full rounded-full bg-white/90" style={{ width: `${Math.max(4, ((r100 - 50) / (RATING_MAX - 50)) * 100)}%` }} />
          </div>
          {/* the uniform this team wears: a button that opens a preview you can cycle through */}
          <div className="mt-3 flex justify-center land:mt-1.5">
            <button
              onClick={() => setPicking(true)}
              aria-haspopup="dialog"
              className="flex items-center gap-2 rounded-full bg-black/35 px-3 py-1 text-xs font-semibold tracking-wide text-white uppercase ring-2 ring-white/25 hover:bg-black/55"
            >
              <span className="flex h-4 w-6 overflow-hidden rounded-sm ring-1 ring-black/40" aria-hidden>
                <span className="h-full flex-[3]" style={{ backgroundColor: jerseyColors(t.team, jersey).primary }} />
                <span className="h-full flex-1" style={{ backgroundColor: jerseyColors(t.team, jersey).secondary }} />
              </span>
              Edit uniforms
              <span className="font-normal text-white/70 normal-case">({JERSEYS.find((j) => j.id === jersey)!.label})</span>
            </button>
          </div>
        </div>
        <div className={`flex shrink-0 flex-col gap-24 sm:gap-32 land:gap-14 ${arrowsNearVs ? "lg:order-first land:order-first" : ""}`}>
          {arrow(-1)}
          {arrow(1)}
        </div>
      </div>
      {/* the uniform preview covers this card (and the other team's can be open too) */}
      {picking && <UniformPicker team={t.team} teamName={t.name} value={jersey} onChange={onJersey} onClose={() => setPicking(false)} />}
    </section>
  );
}

function TeamSelect({ teams, initialTeam, onStart }: { teams: TeamOdds[]; initialTeam?: string; onStart: (user: string, opp: string, level: Difficulty, userJersey: Jersey, oppJersey: Jersey) => void }) {
  const alphabetical = useMemo(() => [...teams].sort((a, b) => a.name.localeCompare(b.name)), [teams]);
  const byStrength = useMemo(() => [...teams].sort((a, b) => b.elo - a.elo), [teams]);
  const ranks = useMemo(() => Object.fromEntries(byStrength.map((t, i) => [t.team, i + 1])), [byStrength]);
  const start = teams.find((t) => t.team === initialTeam?.toUpperCase())?.team ?? byStrength[0].team; // (a team page can link here with ?team=)
  const [user, setUser] = useState(start);
  const [opp, setOpp] = useState(byStrength.find((t) => t.team !== start)!.team);
  const [level, setLevel] = useState<Difficulty>("pro");
  const [userJersey, setUserJersey] = useState<Jersey>("home");
  const [oppJersey, setOppJersey] = useState<Jersey>("away");
  const u = teams.find((t) => t.team === user)!;
  const o = teams.find((t) => t.team === opp)!;
  const diff = u.elo - o.elo;
  const diff100 = rating100(u.elo) - rating100(o.elo);
  const matchup =
    user === opp
      ? "Pick two different teams"
      : Math.abs(diff) < 40
        ? "An even matchup"
        : diff > 0
          ? `You're the favorite (+${diff100} rating points)`
          : `You're the underdog (${diff100} rating points)`;
  const winPct = Math.round(100 / (1 + 10 ** (-diff / 400)));
  const clash = colorDistance(jerseyColors(user, userJersey).primary, jerseyColors(opp, oppJersey).primary) < 90;

  return (
    <div className="land:[zoom:0.85]">
      <p className="mt-2 rounded-md bg-accent/10 px-3 py-2 text-sm text-accent-ink ring-1 ring-accent/30 md:hidden land:hidden">On a phone? Turn it sideways: the game plays in landscape with on-screen controls. To hide the Safari address bar on an iPhone, tap Share, then Add to Home Screen, and open the game from there. A keyboard works on a computer.</p>
      <div className="mt-3 grid items-center gap-3 lg:grid-cols-[1fr_auto_1fr] lg:gap-4 land:mt-1 land:grid-cols-[1fr_auto_1fr] land:gap-2">
        <TeamCarousel label="Your team (offense)" teams={alphabetical} value={user} onChange={setUser} ranks={ranks} jersey={userJersey} onJersey={setUserJersey} />
        <div className="flex items-center justify-center" aria-hidden>
          <span
            className="font-display bg-accent px-6 py-2 text-5xl text-on-accent shadow-lg sm:text-6xl lg:px-5 lg:py-8 lg:text-6xl land:px-3 land:py-5 land:text-4xl"
            style={{ clipPath: "polygon(14px 0, 100% 0, calc(100% - 14px) 100%, 0 100%)" }}
          >
            VS
          </span>
        </div>
        <TeamCarousel label="Opponent" teams={alphabetical} value={opp} onChange={setOpp} ranks={ranks} jersey={oppJersey} onJersey={setOppJersey} arrowsNearVs />
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-8 gap-y-3 land:flex-nowrap land:gap-y-1">
        <div>
          <div className="text-xs font-semibold tracking-widest text-muted uppercase">Difficulty</div>
          <div role="radiogroup" aria-label="Difficulty" className="mt-1 flex flex-wrap items-center gap-3">
            <div className="inline-flex overflow-hidden rounded-md ring-1 ring-line">
              {LEVELS.map((l) => (
                <button
                  key={l.id}
                  role="radio"
                  aria-checked={level === l.id}
                  onClick={() => setLevel(l.id)}
                  className={`font-display px-4 py-1.5 text-xl sm:px-5 sm:text-2xl land:py-0.5 land:text-xl ${level === l.id ? "bg-accent text-on-accent" : "bg-head text-strong hover:bg-hover"}`}
                >
                  {l.label}
                </button>
              ))}
            </div>
            <p className="max-w-xs text-sm text-muted land:hidden">{LEVELS.find((l) => l.id === level)!.blurb}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <div>
            <div className="text-sm font-semibold text-strong">{matchup}</div>
            {user !== opp && clash && <div className="text-xs font-semibold text-bad-ink">The two uniforms look alike. Switch one team to a different uniform.</div>}
            {user !== opp && <div className="text-xs text-muted">The ratings give {u.team} about a {winPct}% chance in a normal game.</div>}
          </div>
          <button
            onClick={() => {
              enterTouchMode();
              onStart(user, opp, level, userJersey, oppJersey);
            }}
            disabled={user === opp}
            className="btn btn-primary text-2xl"
          >
            Kick off
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- a tiny diagram of a play (the routes, or where the back runs) ----------
const ART_W = 120;
const ART_H = 66;
const artX = (dx: number) => 22 + dx * 0.62;
const artY = (y: number) => 4 + ((y - Y_MIN) / (Y_MAX - Y_MIN)) * (ART_H - 8);

function PlayArt({ play }: { play: PlayDef }) {
  const lines: [number, number][][] = [];
  if (play.routes) {
    // the three receivers start wide left, wide right and in the slot; routes bend toward the middle
    [72, 154, 134].forEach((sy, i) => {
      const toMid = sy < Y_MID ? 1 : -1;
      let x = i === 2 ? -6 : 0;
      let y = sy;
      const pts: [number, number][] = [[x, y]];
      for (const [dx, dy] of ROUTES[play.routes![i]]) {
        x = (i === 2 ? -6 : 0) + dx;
        y = Math.min(Y_MAX, Math.max(Y_MIN, sy + dy * toMid));
        pts.push([x, y]);
      }
      lines.push(pts);
    });
  } else if (play.path) {
    lines.push(play.path as [number, number][]);
  }
  const markerId = `arr-${play.id}`;
  return (
    <svg viewBox={`0 0 ${ART_W} ${ART_H}`} className="h-full w-full" aria-hidden>
      <defs>
        <marker id={markerId} viewBox="0 0 6 6" refX="5" refY="3" markerWidth="5" markerHeight="5" orient="auto">
          <path d="M0 0 L6 3 L0 6 z" fill="currentColor" />
        </marker>
      </defs>
      <line x1={artX(0)} y1={1} x2={artX(0)} y2={ART_H - 1} stroke="currentColor" strokeOpacity={0.35} strokeDasharray="2 2" />
      {/* the line and the quarterback */}
      {[Y_MID - 10, Y_MID, Y_MID + 10].map((y) => (
        <rect key={y} x={artX(-3)} y={artY(y) - 2} width={4} height={4} fill="currentColor" fillOpacity={0.55} />
      ))}
      <circle cx={artX(-24)} cy={artY(Y_MID)} r={2.4} fill="currentColor" fillOpacity={0.55} />
      {lines.map((pts, i) => (
        <polyline
          key={i}
          points={pts.map(([x, y]) => `${artX(x).toFixed(1)},${artY(y).toFixed(1)}`).join(" ")}
          fill="none"
          stroke="currentColor"
          strokeWidth={play.routes ? 1.7 : 2.4}
          strokeLinejoin="round"
          markerEnd={`url(#${markerId})`}
        />
      ))}
      {play.routes && [72, 154, 134].map((sy, i) => <circle key={sy} cx={artX(i === 2 ? -6 : 0)} cy={artY(sy)} r={2.2} fill="currentColor" />)}
      {play.path && <circle cx={artX(play.path[0][0])} cy={artY(play.path[0][1])} r={2.6} fill="currentColor" />}
    </svg>
  );
}

// ---------- the game ----------
function GameScreen({ user, opp, teams, level, userJersey, oppJersey, onExit, paused, onHelp }: { user: TeamOdds; opp: TeamOdds; teams: TeamOdds[]; level: Difficulty; userJersey: Jersey; oppJersey: Jersey; onExit: () => void; paused: boolean; onHelp: () => void }) {
  void teams;
  const rootRef = useRef<HTMLDivElement>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [manualPause, setManualPause] = useState(false); // the Pause button (or Esc)
  const touch = useMedia("(pointer: coarse)"); // a phone or tablet: on-screen controls, full-viewport layout
  const landscape = useMedia("(orientation: landscape)", true);
  const rotate = touch && !landscape; // held in portrait: ask for landscape and stand still
  const stopped = paused || manualPause || rotate; // paused by the help panel, the player, or a phone held upright
  const pausedRef = useRef(stopped);
  const [game, setGame] = useState(() => new FootballGame({ abbr: user.team, name: user.name, rating: user.elo }, { abbr: opp.team, name: opp.name, rating: opp.elo }, Math.random, level));
  const [hud, setHud] = useState<Hud>(() => snapshot(game));
  const [qBanner, setQBanner] = useState<number | null>(null); // "2ND QUARTER" flashes briefly when a new quarter starts
  const prevQuarter = useRef(1);
  useEffect(() => {
    if (hud.quarter !== prevQuarter.current && hud.phase !== "halftime") {
      setQBanner(hud.quarter);
      const t = setTimeout(() => setQBanner(null), 1600);
      prevQuarter.current = hud.quarter;
      return () => clearTimeout(t);
    }
    prevQuarter.current = hud.quarter;
  }, [hud.quarter, hud.phase]);
  const [pickerOpen, setPickerOpen] = useState(true); // phones: the play strip over the field, tucked away after you pick
  const prevPhase = useRef(hud.phase);
  useEffect(() => {
    if (hud.phase === "presnap" && prevPhase.current !== "presnap") setPickerOpen(true); // every new snap starts with the strip open
    prevPhase.current = hud.phase;
  }, [hud.phase]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const keys = useRef(new Set<string>());
  const uInfo = jerseyColors(user.team, userJersey); // the colors on the field: jersey and trim
  const oInfo = jerseyColors(opp.team, oppJersey);

  const restart = () => {
    const g = new FootballGame({ abbr: user.team, name: user.name, rating: user.elo }, { abbr: opp.team, name: opp.name, rating: opp.elo }, Math.random, level);
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

  // Full screen: the browser's own mode (Esc leaves it), so keep our flag in step with it.
  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === rootRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    };
  }, []);
  const toggleFullscreen = () => {
    (document.activeElement as HTMLElement | null)?.blur?.();
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    else void rootRef.current?.requestFullscreen?.().catch(() => {});
  };

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
      code === "ArrowLeft" ? "left" : code === "ArrowRight" ? "right" : code === "ArrowUp" ? "up" : code === "ArrowDown" ? "down" : null;
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
      if (dir || ["Space", "Enter", "Digit1", "Digit2", "Digit3", "KeyA", "KeyS", "KeyD", "KeyF", "KeyP"].includes(e.code)) e.preventDefault();
      if (dir) {
        keys.current.add(dir);
        if (game_.phase === "presnap" && !e.repeat) {
          if (dir === "left") game_.press("selectPass");
          if (dir === "right") game_.press("selectRun");
          if (dir === "up") game_.press("prevPlay");
          if (dir === "down") game_.press("nextPlay");
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
          game_.press(game_.phase === "presnap" ? "play1" : "throw1");
          break;
        case "KeyA":
          game_.press("throw1");
          break;
        case "Digit2":
          game_.press(game_.phase === "presnap" ? "play2" : "throw2");
          break;
        case "KeyS":
          game_.press("throw2");
          break;
        case "Digit3":
          game_.press(game_.phase === "presnap" ? "play3" : "throw3");
          break;
        case "KeyD":
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

      // a run play shows where the back is headed
      if (game.phase === "presnap" && game.selected === "run" && game.play.path) {
        g.fillStyle = "rgba(250,204,21,0.8)";
        const pts = game.play.path.map(([dx, y]) => [game.losX + dx, y] as [number, number]);
        for (let i = 1; i < pts.length; i++) {
          const [ax, ay] = pts[i - 1];
          const [bx2, by2] = pts[i];
          const n = Math.max(1, Math.floor(Math.hypot(bx2 - ax, by2 - ay) / 5));
          for (let k = 1; k <= n; k += 2) g.fillRect(sx(ax + ((bx2 - ax) * k) / n), Math.round(ay + ((by2 - ay) * k) / n), 1, 1);
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
          drawDigits(g, "ASD"[e.num - 1], x + 1, y + 1, "#111827"); // the key that throws to him
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
  }, [game, level, uInfo.primary, uInfo.secondary, oInfo.primary, oInfo.secondary]);

  const act = (a: Parameters<FootballGame["press"]>[0]) => {
    game.press(a);
    (document.activeElement as HTMLElement | null)?.blur?.();
    setHud(snapshot(game));
  };
  /** The on-screen pad: set the held directions (like holding arrow keys). Before the snap a new direction picks pass/run or a play. */
  const setDirs = (next: Set<string>) => {
    if (pausedRef.current) next = new Set();
    const prev = keys.current;
    if (game.phase === "presnap") {
      if (next.has("left") && !prev.has("left")) game.press("selectPass");
      if (next.has("right") && !prev.has("right")) game.press("selectRun");
      if (next.has("up") && !prev.has("up")) game.press("prevPlay");
      if (next.has("down") && !prev.has("down")) game.press("nextPlay");
    }
    keys.current = next;
    game.setMove((next.has("right") ? 1 : 0) - (next.has("left") ? 1 : 0), (next.has("down") ? 1 : 0) - (next.has("up") ? 1 : 0));
  };
  const touchAct = (a: Parameters<FootballGame["press"]>[0]) => {
    if (!pausedRef.current) act(a);
  };

  const d = hud.oppDrive;
  const final = hud.phase === "final";
  const winText = hud.user > hud.opp ? "YOU WIN!" : hud.user < hud.opp ? "YOU LOSE" : "TIE GAME";

  return (
    <div
      ref={rootRef}
      data-phase={hud.phase}
      data-half={hud.half}
      className={touch ? "fixed inset-0 z-[70] flex flex-col items-center justify-center overflow-hidden" : fullscreen ? "flex h-screen w-screen flex-col items-center justify-center overflow-auto p-3" : ""}
      style={
        touch
          ? { background: "#0b1220" } // the field fills the whole screen, under the notch too; only the buttons keep clear of it
          : fullscreen
            ? { background: "var(--background)" }
            : undefined
      }
    >
      {rotate && (
        <div className="fixed inset-0 z-[90] flex flex-col items-center justify-center gap-4 bg-black/90 p-6 text-center text-white" role="alert">
          <svg viewBox="0 0 64 64" className="h-20 w-20 animate-pulse" fill="none" stroke="currentColor" strokeWidth={3} aria-hidden>
            <rect x="22" y="8" width="20" height="36" rx="4" />
            <path d="M14 50a22 22 0 0 0 36 0M50 50l-1-8m1 8-8-1" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <div className="font-pixel text-sm leading-relaxed text-yellow-300">TURN YOUR PHONE SIDEWAYS</div>
          <div className="text-sm text-white/80">The game plays in landscape. It&apos;s paused until you rotate.</div>
          <button onClick={onExit} className="btn btn-ghost mt-2 text-lg">
            Quit game
          </button>
        </div>
      )}
      {/* the game is as wide as the screen's height allows, so the whole field stays on screen (without scrolling) */}
      <div
        className={`mx-auto w-full ${touch ? "h-full" : ""}`}
        style={{ maxWidth: touch ? "none" : fullscreen ? "calc((100vh - 11rem) * 16 / 9 + 16rem)" : "min(78rem, max(46rem, calc((100vh - 17.5rem) * 16 / 9 + 16rem)))" }}
      >
        {!touch && (
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="font-pixel text-[10px] text-muted sm:text-xs">
            {["1ST", "2ND", "3RD", "4TH"][hud.quarter - 1]} QUARTER · {LEVELS.find((l) => l.id === level)!.label.toUpperCase()}
          </div>
          <div className="flex gap-2">
            {!touch && (
            <button
              onClick={toggleFullscreen}
              aria-pressed={fullscreen}
              className="font-pixel rounded bg-head px-3 py-2 text-[10px] text-strong ring-1 ring-line hover:bg-hover"
            >
              {fullscreen ? "EXIT FULL SCREEN" : "FULL SCREEN"}
            </button>
            )}
            {!final && (
              <button
                onClick={() => {
                  setManualPause((p) => !p);
                  (document.activeElement as HTMLElement | null)?.blur?.();
                }}
                aria-pressed={manualPause}
                className={`font-pixel rounded bg-head text-strong ring-1 ring-line hover:bg-hover ${touch ? "px-2 py-1 text-[8px]" : "px-3 py-2 text-[10px]"}`}
              >
                {manualPause ? "RESUME" : "PAUSE"}
              </button>
            )}
            <button onClick={onExit} className={`font-pixel rounded bg-head text-strong ring-1 ring-line hover:bg-hover ${touch ? "px-2 py-1 text-[8px]" : "px-3 py-2 text-[10px]"}`}>
              QUIT
            </button>
          </div>
        </div>
        )}
        <div className={`grid items-stretch ${touch ? "h-full" : "gap-3 lg:grid-cols-[minmax(0,1fr)_15rem]"}`} style={touch ? { gridTemplateColumns: "minmax(0, 1fr)", gridTemplateRows: "minmax(0, 1fr)" } : undefined}>
        <div className={touch ? "relative h-full overflow-hidden bg-black" : "overflow-hidden rounded-lg border-4 border-white/70 bg-black shadow-2xl shadow-black/40"}>
          <div
            className={`font-pixel flex items-stretch justify-between text-white ${touch ? "absolute inset-x-0 top-0 z-10 bg-[#111827]/85" : "bg-[#111827]"}`}
            style={touch ? { paddingLeft: "env(safe-area-inset-left)", paddingRight: "env(safe-area-inset-right)", paddingTop: "env(safe-area-inset-top)" } : undefined}
          >
            <div className={`flex flex-1 items-center justify-between gap-2 border-b-4 ${touch ? "px-2 py-0.5" : "px-3 py-2"}`} style={{ borderColor: uInfo.primary }}>
              <span className={touch ? "text-[9px]" : "text-[10px] sm:text-sm"}>{user.team}</span>
              <span className={`text-yellow-300 tabular-nums ${touch ? "text-lg" : "text-lg sm:text-3xl"}`} data-testid="score-user">
                {String(hud.user).padStart(2, "0")}
              </span>
            </div>
            <div className={`flex flex-col items-center justify-center px-2 text-center ${touch ? "min-w-[6.5rem]" : "min-w-[8.5rem]"}`}>
              <span className={`tabular-nums ${touch ? "text-sm" : "text-sm sm:text-xl"}`} data-testid="clock">
                {touch ? `Q${hud.quarter}  ${hud.clock}` : hud.clock}
              </span>
              <span className="text-[7px] text-white/70 sm:text-[9px]">{hud.situation}</span>
            </div>
            <div className={`flex flex-1 items-center justify-between gap-2 border-b-4 ${touch ? "px-2 py-0.5" : "px-3 py-2"}`} style={{ borderColor: oInfo.primary }}>
              <span className={`text-yellow-300 tabular-nums ${touch ? "text-lg" : "text-lg sm:text-3xl"}`} data-testid="score-opp">
                {String(hud.opp).padStart(2, "0")}
              </span>
              <span className={touch ? "text-[9px]" : "text-[10px] sm:text-sm"}>{opp.team}</span>
            </div>
          </div>

          <div className={touch ? "absolute inset-0" : "relative"}>
            {/* on a phone the field fills the screen: the picture is scaled to cover it, trimming a little crowd from the top */}
            <canvas
              ref={canvasRef}
              width={W}
              height={H}
              className={touch ? "block h-full w-full object-cover" : "block w-full"}
              style={touch ? { imageRendering: "pixelated", objectPosition: "50% 80%" } : { imageRendering: "pixelated", aspectRatio: `${W} / ${H}` }}
            />
            {touch && (
              <div className="absolute z-10 flex gap-1" style={{ top: "calc(2.25rem + env(safe-area-inset-top))", right: "max(0.25rem, env(safe-area-inset-right))" }}>
                {!final && (
                  <button
                    onClick={() => {
                      setManualPause((p) => !p);
                      (document.activeElement as HTMLElement | null)?.blur?.();
                    }}
                    className="font-pixel rounded bg-black/60 px-2 py-1 text-[8px] text-white ring-1 ring-white/30"
                  >
                    {manualPause ? "RESUME" : "PAUSE"}
                  </button>
                )}
                <button onClick={onExit} className="font-pixel rounded bg-black/60 px-2 py-1 text-[8px] text-white ring-1 ring-white/30">
                  QUIT
                </button>
              </div>
            )}
            {touch && !manualPause && !rotate && <TouchControls hud={hud} onDirs={setDirs} onAction={touchAct} />}
            {touch && !manualPause && !rotate && hud.phase === "presnap" && (
              <TouchPlayPicker hud={hud} open={pickerOpen} onOpen={() => setPickerOpen(true)} onClose={() => setPickerOpen(false)} onAction={touchAct} />
            )}

            {(hud.phase === "result" || hud.phase === "kick") && (hud.message || hud.phase === "kick") && (
              <div className="font-pixel pointer-events-none absolute inset-x-0 top-[28%] flex justify-center px-2">
                <span className="rounded bg-black/70 px-3 py-2 text-center text-[10px] text-yellow-300 [text-shadow:2px_2px_0_#000] sm:text-lg">
                  {hud.phase === "kick" ? "KICK..." : hud.message}
                </span>
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
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/75 p-3 text-center" onClick={touch ? () => act("continue") : undefined}>
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
                <div className="font-pixel mt-1 text-[8px] text-white/50">{touch ? "TAP TO SKIP" : "ENTER: SKIP"}</div>
              </div>
            )}

            {qBanner && hud.phase !== "halftime" && !final && (
              <div className="font-pixel pointer-events-none absolute inset-x-0 top-[38%] flex justify-center">
                <span className="rise rounded bg-black/70 px-4 py-2 text-xs text-yellow-300 [text-shadow:2px_2px_0_#000] sm:text-2xl">{["1ST", "2ND", "3RD", "4TH"][qBanner - 1]} QUARTER</span>
              </div>
            )}

            {hud.phase === "halftime" && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/80 p-3 text-center">
                <div className="font-pixel text-xs text-yellow-300 sm:text-2xl">HALFTIME</div>
                <div className="font-pixel text-sm text-white sm:text-3xl">
                  {user.team} {hud.user} - {hud.opp} {opp.team}
                </div>
                <button onClick={() => act("continue")} className="btn btn-primary mt-2 text-xl">
                  Start 3rd quarter
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

        </div>
        {/* the play picker and snap controls: a column beside the field, so the whole field stays on screen */}
        {!touch && (
        <aside className="relative min-h-[26rem] lg:min-h-0">
          <div className={`flex flex-col rounded-lg bg-[#111827] text-white ${touch ? "absolute inset-0 p-1.5" : "p-2.5 lg:absolute lg:inset-0"}`}>
            {/* the pre-snap controls and the live hints share one spot, so nothing moves when the play starts */}
            <div className={`flex min-h-0 flex-1 flex-col gap-2 ${hud.phase === "presnap" ? "" : "invisible"}`} aria-hidden={hud.phase !== "presnap"}>
              <div className="font-pixel text-center text-[7px] leading-snug text-white/70 sm:text-[8px]">
                {hud.down >= 4 ? "4TH DOWN: GO FOR IT WITH A PLAY, OR KICK" : touch ? "TAP A PLAY, THEN SNAP" : "PICK A PLAY (1 2 3 OR ↑ ↓), THEN SNAP"}
              </div>
              <div className={`grid min-h-0 flex-1 gap-1.5 ${touch ? "grid-cols-1 grid-rows-3" : "grid-cols-3 gap-2 lg:grid-cols-1 lg:grid-rows-3"}`}>
                {hud.plays.map((p, i) => (
                  <button
                    key={p.id}
                    onClick={() => act(`play${i + 1}` as "play1" | "play2" | "play3")}
                    aria-pressed={hud.choice === i}
                    className={`flex min-h-0 min-w-0 flex-col overflow-hidden rounded text-left ring-2 ${hud.choice === i ? "bg-yellow-300 text-black ring-white" : "bg-white/10 text-white ring-white/15 hover:bg-white/20"}`}
                  >
                    <span className={`block min-h-0 w-full px-1 pt-1 ${touch ? "h-auto flex-1" : "h-14 lg:h-auto lg:flex-1"}`}>
                      <PlayArt play={p} />
                    </span>
                    <span className="flex items-center gap-1.5 px-1.5 pb-1.5">
                      <span className={`font-pixel flex h-5 w-5 shrink-0 items-center justify-center rounded text-[9px] ${hud.choice === i ? "bg-black text-yellow-300" : "bg-white/20"}`}>{i + 1}</span>
                      <span className="min-w-0">
                        <span className="font-pixel block truncate text-[7px] sm:text-[9px]">{p.name.toUpperCase()}</span>
                        <span className={`hidden h-[1.5rem] overflow-hidden text-[9px] leading-tight ${touch ? "" : "lg:block"} ${hud.choice === i ? "text-black/70" : "text-white/60"}`}>{p.blurb}</span>
                      </span>
                    </span>
                  </button>
                ))}
              </div>
              {hud.down < 4 && (
                <div className="flex flex-col gap-2">
                  <div className="grid grid-cols-2 gap-2">
                    {(["pass", "run"] as const).map((k) => (
                      <button
                        key={k}
                        onClick={() => act(k === "pass" ? "selectPass" : "selectRun")}
                        aria-pressed={hud.selected === k}
                        className={`font-pixel rounded px-2 py-2 text-[9px] ${hud.selected === k ? "bg-yellow-300 text-black" : "bg-white/15 text-white hover:bg-white/25"}`}
                      >
                        {k === "pass" ? "← PASS" : "RUN →"}
                      </button>
                    ))}
                  </div>
                  <button onClick={() => act("snap")} className="font-pixel rounded bg-emerald-400 px-3 py-2 text-[10px] text-black hover:bg-emerald-300">
                    SNAP (SPACE)
                  </button>
                </div>
              )}
              {hud.down >= 4 && (
                <div className="flex flex-col gap-2">
                  <button onClick={() => act("snap")} className="font-pixel rounded bg-emerald-400 px-2 py-2 text-[9px] text-black hover:bg-emerald-300">
                    GO FOR IT (SPACE)
                  </button>
                  <button
                    onClick={() => act("fieldGoal")}
                    disabled={!hud.canKick}
                    className="font-pixel rounded bg-yellow-300 px-2 py-2 text-[9px] text-black hover:bg-yellow-200 disabled:opacity-40"
                  >
                    FIELD GOAL (F) {hud.canKick ? `${hud.fgDistance} YD` : "TOO FAR"}
                  </button>
                  <button onClick={() => act("punt")} className="font-pixel rounded bg-white/20 px-2 py-2 text-[9px] text-white hover:bg-white/30">
                    PUNT (P)
                  </button>
                </div>
              )}
            </div>
            <div className={`absolute inset-0 flex flex-col items-center justify-center gap-4 p-3 text-center ${hud.phase === "live" ? "" : "invisible"}`}>
              {!touch && (
                <span className="font-pixel text-[8px] leading-relaxed text-white/80 sm:text-[10px]">
                  ARROWS MOVE
                  <br />A S D THROW
                </span>
              )}
              <span className="font-pixel flex flex-col items-center gap-2 text-[8px] text-white/80 sm:text-[10px]">
                {touch ? "SPRINT" : "SPRINT (SPACE)"}
                <span className="inline-block h-2 w-24 overflow-hidden rounded bg-white/20">
                  <span className={`block h-full ${hud.boost >= 1 ? "bg-emerald-400" : "bg-white/50"}`} style={{ width: `${hud.boost * 100}%` }} />
                </span>
              </span>
            </div>
          </div>
        </aside>
        )}
        </div>
        {!touch && <p className="mt-2 text-center text-xs text-muted">The other team&apos;s drives are simulated from the two teams&apos; ratings. You play every snap of yours.</p>}
      </div>
    </div>
  );
}

export default function PlayNow({ teams, initialTeam }: { teams: TeamOdds[]; initialTeam?: string }) {
  const [setup, setSetup] = useState<{ user: string; opp: string; level: Difficulty; userJersey: Jersey; oppJersey: Jersey } | null>(null);
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

  const helpButton = (
    <button
      onClick={() => setHelp(true)}
      aria-label="How to play and controls"
      title="How to play and controls"
      className={`font-display flex shrink-0 items-center justify-center rounded-full bg-accent text-on-accent shadow-md hover:brightness-110 ${setup ? "h-9 w-9 text-2xl sm:h-10 sm:w-10" : "h-9 w-9 text-2xl sm:h-12 sm:w-12 sm:text-4xl land:h-8 land:w-8 land:text-xl"}`}
    >
      ?
    </button>
  );
  return (
    <div>
      {setup ? (
        // while a game is on, the title shrinks to leave more room for the field
        <div className="flex items-start justify-between gap-4">
          <h1 className="font-display text-4xl text-strong sm:text-5xl">
            Play <span className="text-accent-ink">Now</span>
          </h1>
          {helpButton}
        </div>
      ) : (
        <PageHeader
          tight
          title={
            <>
              Play <span className="text-accent-ink">Now</span>
            </>
          }
          subtitle="A pixel-art football game: pick two teams, call the plays and score. Click the ? for the controls."
          action={helpButton}
        />
      )}
      {setup && user && opp ? (
        <GameScreen user={user} opp={opp} teams={teams} level={setup.level} userJersey={setup.userJersey} oppJersey={setup.oppJersey} onExit={() => setSetup(null)} paused={help} onHelp={() => setHelp(true)} />
      ) : (
        <TeamSelect teams={teams} initialTeam={initialTeam} onStart={(u, o, level, userJersey, oppJersey) => setSetup({ user: u, opp: o, level, userJersey, oppJersey })} />
      )}
      {help && <PlayHelp onClose={closeHelp} />}
    </div>
  );
}
