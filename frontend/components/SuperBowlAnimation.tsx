"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import TeamLogo from "@/components/TeamLogo";
import { pointsFor, type GameEvent, type Kind } from "@/lib/superBowlGame";
import { teamInfo } from "@/lib/teams";

export interface SuperBowlResult {
  home: string;
  away: string;
  winner: string;
  events: GameEvent[]; // the drives, from makeGame(): the model picks the winner, everything else is for show
  winnerRecord?: string;
  winnerSeed?: number | null;
  title?: string; // heading, e.g. "WILD CARD" (defaults to SUPER BOWL)
  isSuperBowl?: boolean; // false: the winner "advances" instead of being crowned champion
}

// ---------- the scene ----------
const W = 320; // the little pixel world; scaled up with sharp edges
const H = 180;
const FIELD_TOP = 40;
const GOAL_X = 290; // right end zone starts here
const LOS = 120; // line of scrimmage
const SCRIPT_END = 6.0; // each play script runs 0 to 6 "script seconds"
// Real seconds each kind of drive takes to play out, and to celebrate (a punt barely pauses).
const PLAY_BY: Record<Kind, number> = { TD: 2.5, FG: 2.0, PUNT: 1.6 };
const CELEBRATE_BY: Record<Kind, number> = { TD: 1.1, FG: 0.8, PUNT: 0.25 };

type Key = [number, number, number]; // [seconds, x, y]

/** Position at time t, moving in a straight line between keyframes. */
function at(keys: Key[], t: number): { x: number; y: number; moving: boolean } {
  if (t <= keys[0][0]) return { x: keys[0][1], y: keys[0][2], moving: false };
  for (let i = 1; i < keys.length; i++) {
    const [t1, x1, y1] = keys[i];
    if (t <= t1) {
      const [t0, x0, y0] = keys[i - 1];
      const u = (t - t0) / (t1 - t0);
      return { x: x0 + (x1 - x0) * u, y: y0 + (y1 - y0) * u, moving: Math.abs(x1 - x0) + Math.abs(y1 - y0) > 1 };
    }
  }
  const last = keys[keys.length - 1];
  return { x: last[1], y: last[2], moving: false };
}

interface Script {
  off: Record<string, Key[]>;
  def: Record<string, Key[]>;
  /** Where the ball is at script-time t. */
  ball: (t: number) => { x: number; y: number };
  /** Who ends up holding the ball (spiked in the end zone after a touchdown). Kicks have none. */
  carrier?: string;
}
const at2 = (keys: Key[], t: number) => at(keys, t);

// Play 1: a pass. The offense faces right; the defense faces left.
const PASS_OFF: Record<string, Key[]> = {
  wr1: [[0, -14, 70], [1, LOS - 6, 70], [1.6, LOS - 6, 70], [2.6, 170, 70], [4.2, 226, 94], [5.9, 294, 100], [99, 294, 100]],
  wr2: [[0, -24, 148], [1, LOS - 6, 148], [1.6, LOS - 6, 148], [3.4, 196, 148], [99, 196, 148]],
  qb: [[0, -34, 106], [1, LOS - 14, 106], [1.9, LOS - 14, 106], [2.6, LOS - 26, 106], [99, LOS - 26, 106]],
  rb: [[0, -44, 106], [1, LOS - 22, 106], [1.6, LOS - 22, 106], [2.4, LOS - 4, 118], [99, LOS - 4, 118]],
  ol1: [[0, -30, 96], [1, LOS - 6, 96], [1.6, LOS - 6, 96], [3.5, LOS - 12, 96], [5.5, 170, 96], [99, 170, 96]],
  ol2: [[0, -30, 106], [1, LOS - 6, 106], [1.6, LOS - 6, 106], [3.5, LOS - 12, 106], [5.5, 176, 108], [99, 176, 108]],
  ol3: [[0, -30, 116], [1, LOS - 6, 116], [1.6, LOS - 6, 116], [3.5, LOS - 12, 116], [5.5, 170, 118], [99, 170, 118]],
};
const PASS_DEF: Record<string, Key[]> = {
  dl1: [[0, 350, 96], [1, LOS + 4, 96], [1.6, LOS + 4, 96], [3.3, LOS - 12, 96], [5.5, 200, 98], [99, 200, 98]],
  dl2: [[0, 350, 106], [1, LOS + 4, 106], [1.6, LOS + 4, 106], [3.3, LOS - 16, 106], [5.5, 206, 108], [99, 206, 108]],
  dl3: [[0, 350, 116], [1, LOS + 4, 116], [1.6, LOS + 4, 116], [3.3, LOS - 12, 118], [5.5, 200, 118], [99, 200, 118]],
  lb: [[0, 340, 106], [1, LOS + 16, 106], [1.6, LOS + 16, 106], [3.4, 168, 100], [5.5, 238, 100], [99, 238, 100]],
  cb1: [[0, 360, 70], [1, LOS + 10, 70], [1.6, LOS + 10, 70], [2.2, 150, 72], [2.6, 160, 72], [4.2, 214, 98], [5.9, 280, 104], [99, 280, 104]],
  cb2: [[0, 360, 148], [1, LOS + 10, 148], [1.6, LOS + 10, 148], [3.4, 186, 148], [99, 186, 148]],
  s: [[0, 370, 106], [1, LOS + 44, 106], [1.6, LOS + 44, 106], [4.2, 200, 100], [5.9, 262, 102], [99, 262, 102]],
};
const PASS: Script = {
  off: PASS_OFF,
  def: PASS_DEF,
  ball: (t) => {
    const qb = at2(PASS_OFF.qb, t);
    const wr = at2(PASS_OFF.wr1, t);
    if (t < 1.6) return { x: LOS - 2, y: 106 };
    if (t < 1.9) {
      const u = (t - 1.6) / 0.3; // the snap
      return { x: LOS - 2 + (qb.x + 5 - (LOS - 2)) * u, y: 106 - 4 * u };
    }
    if (t < 3.5) return { x: qb.x + 5, y: qb.y - 6 };
    if (t < 4.2) {
      const u = (t - 3.5) / 0.7; // the throw
      const fromX = LOS - 21;
      return { x: fromX + (228 - fromX) * u, y: 100 + (88 - 100) * u - Math.sin(Math.PI * u) * 30 };
    }
    return { x: wr.x + 4, y: wr.y - 6 };
  },
};

// Play 2: a handoff and a run up the middle.
const RUN_OFF: Record<string, Key[]> = {
  qb: [[0, -34, 106], [1, LOS - 14, 106], [2.4, LOS - 14, 106], [99, LOS - 14, 106]],
  rb: [[0, -44, 106], [1, LOS - 26, 118], [1.8, LOS - 26, 118], [2.4, LOS - 12, 110], [3.6, 168, 110], [4.8, 232, 120], [5.9, 294, 108], [99, 294, 108]],
  wr1: [[0, -14, 70], [1, LOS - 6, 70], [1.6, LOS - 6, 70], [4.4, 200, 78], [99, 200, 78]],
  wr2: [[0, -24, 148], [1, LOS - 6, 148], [1.6, LOS - 6, 148], [4.4, 204, 140], [99, 204, 140]],
  ol1: [[0, -30, 96], [1, LOS - 6, 96], [1.6, LOS - 6, 96], [2.6, LOS + 2, 96], [4.6, 188, 98], [99, 188, 98]],
  ol2: [[0, -30, 106], [1, LOS - 6, 106], [1.6, LOS - 6, 106], [2.6, LOS + 2, 106], [4.6, 196, 108], [99, 196, 108]],
  ol3: [[0, -30, 116], [1, LOS - 6, 116], [1.6, LOS - 6, 116], [2.6, LOS + 2, 118], [4.6, 188, 118], [99, 188, 118]],
};
const RUN_DEF: Record<string, Key[]> = {
  dl1: [[0, 350, 96], [1, LOS + 4, 96], [1.6, LOS + 4, 96], [3.0, 150, 100], [5.0, 232, 112], [99, 232, 112]],
  dl2: [[0, 350, 106], [1, LOS + 4, 106], [1.6, LOS + 4, 106], [3.0, 154, 106], [5.0, 238, 116], [99, 238, 116]],
  dl3: [[0, 350, 116], [1, LOS + 4, 116], [1.6, LOS + 4, 116], [3.0, 150, 116], [5.0, 232, 122], [99, 232, 122]],
  lb: [[0, 340, 106], [1, LOS + 16, 106], [1.6, LOS + 16, 106], [3.4, 176, 112], [5.6, 262, 110], [99, 262, 110]],
  cb1: [[0, 360, 70], [1, LOS + 10, 70], [1.6, LOS + 10, 70], [4.6, 214, 96], [99, 214, 96]],
  cb2: [[0, 360, 148], [1, LOS + 10, 148], [1.6, LOS + 10, 148], [4.6, 214, 132], [99, 214, 132]],
  s: [[0, 370, 106], [1, LOS + 44, 106], [1.6, LOS + 44, 106], [4.6, 250, 112], [5.9, 282, 110], [99, 282, 110]],
};
const RUN: Script = {
  off: RUN_OFF,
  def: RUN_DEF,
  ball: (t) => {
    const qb = at2(RUN_OFF.qb, t);
    const rb = at2(RUN_OFF.rb, t);
    if (t < 1.6) return { x: LOS - 2, y: 106 };
    if (t < 1.9) {
      const u = (t - 1.6) / 0.3; // the snap
      return { x: LOS - 2 + (qb.x + 5 - (LOS - 2)) * u, y: 106 - 4 * u };
    }
    if (t < 2.4) return { x: qb.x + 5 + (rb.x - qb.x) * ((t - 1.9) / 0.5) * 0.9, y: qb.y - 6 + (rb.y - qb.y - 0) * ((t - 1.9) / 0.5) }; // the handoff
    return { x: rb.x + 4, y: rb.y - 6 };
  },
};
PASS.carrier = "wr1";
RUN.carrier = "rb";

// Play 3: a field goal from 56 yards-ish out. Kicker and holder behind the line, ball sails through the posts.
const FX = 234;
const FG_OFF: Record<string, Key[]> = {
  ol1: [[0, FX - 70, 96], [1.0, FX - 4, 96], [99, FX - 4, 96]],
  ol2: [[0, FX - 70, 104], [1.0, FX - 4, 104], [99, FX - 4, 104]],
  ol3: [[0, FX - 70, 112], [1.0, FX - 4, 112], [99, FX - 4, 112]],
  wr1: [[0, FX - 70, 88], [1.0, FX - 4, 88], [99, FX - 4, 88]],
  wr2: [[0, FX - 70, 120], [1.0, FX - 4, 120], [99, FX - 4, 120]],
  rb: [[0, FX - 80, 100], [1.0, FX - 12, 124], [99, FX - 12, 124]],
  holder: [[0, FX - 90, 112], [1.0, FX - 17, 112], [99, FX - 17, 112]],
  kicker: [[0, FX - 100, 106], [1.0, FX - 32, 106], [2.0, FX - 32, 106], [2.5, FX - 24, 106], [99, FX - 24, 106]],
};
const FG_DEF: Record<string, Key[]> = {
  dl1: [[0, FX + 110, 96], [1.0, FX + 6, 96], [2.2, FX + 6, 96], [2.7, FX - 6, 100], [99, FX - 6, 100]],
  dl2: [[0, FX + 110, 104], [1.0, FX + 6, 104], [2.2, FX + 6, 104], [2.7, FX - 6, 106], [99, FX - 6, 106]],
  dl3: [[0, FX + 110, 112], [1.0, FX + 6, 112], [2.2, FX + 6, 112], [2.7, FX - 6, 112], [99, FX - 6, 112]],
  lb: [[0, FX + 120, 88], [1.0, FX + 8, 88], [2.4, FX - 2, 92], [99, FX - 2, 92]],
  cb1: [[0, FX + 130, 124], [1.0, FX + 8, 124], [2.4, FX - 2, 120], [99, FX - 2, 120]],
  s: [[0, FX + 150, 106], [1.0, FX + 40, 106], [99, FX + 40, 106]],
};
const GOAL_POST_X = W - 8;
const FG: Script = {
  off: FG_OFF,
  def: FG_DEF,
  ball: (t) => {
    const holder = at2(FG_OFF.holder, t);
    if (t < 1.0) return { x: FX - 3, y: 104 };
    if (t < 1.5) {
      const u = (t - 1.0) / 0.5; // the snap
      return { x: FX - 3 + (holder.x + 1 - (FX - 3)) * u, y: 104 + (109 - 104) * u };
    }
    if (t < 2.4) return { x: holder.x + 1, y: 109 };
    if (t < 4.6) {
      const u = (t - 2.4) / 2.2; // the kick
      const x0 = FX - 19;
      return { x: x0 + (GOAL_POST_X - x0) * u, y: 109 + (106 - 109) * u - Math.sin(Math.PI * u) * 38 };
    }
    return { x: GOAL_POST_X, y: 106 + Math.min(1, (t - 4.6) / 1.2) * 10 };
  },
};

// Play 4: a punt. The ball sails downfield to a returner, who is run down.
const PX = 120;
const PUNT_OFF: Record<string, Key[]> = {
  punter: [[0, PX - 110, 106], [1.0, PX - 34, 106], [2.2, PX - 34, 106], [2.6, PX - 30, 106], [99, PX - 30, 106]],
  ol1: [[0, PX - 70, 98], [1.0, PX - 4, 98], [2.4, PX - 4, 98], [5.0, PX + 60, 100], [99, PX + 60, 100]],
  ol2: [[0, PX - 70, 106], [1.0, PX - 4, 106], [2.4, PX - 4, 106], [5.0, PX + 56, 108], [99, PX + 56, 108]],
  ol3: [[0, PX - 70, 114], [1.0, PX - 4, 114], [2.4, PX - 4, 114], [5.0, PX + 60, 116], [99, PX + 60, 116]],
  wr1: [[0, PX - 70, 66], [1.0, PX - 4, 66], [2.4, PX - 4, 66], [4.4, 236, 72], [5.3, 252, 92], [99, 252, 92]],
  wr2: [[0, PX - 70, 148], [1.0, PX - 4, 148], [2.4, PX - 4, 148], [4.4, 236, 140], [5.3, 254, 122], [99, 254, 122]],
  rb: [[0, PX - 80, 112], [1.0, PX - 24, 122], [99, PX - 24, 122]],
};
const PUNT_DEF: Record<string, Key[]> = {
  returner: [[0, 340, 106], [1.0, 270, 106], [3.0, 270, 106], [4.3, 262, 108], [5.4, 250, 110], [99, 250, 110]],
  dl1: [[0, PX + 130, 98], [1.0, PX + 6, 98], [2.4, PX + 6, 98], [3.2, PX - 16, 100], [99, PX - 16, 100]],
  dl2: [[0, PX + 130, 106], [1.0, PX + 6, 106], [2.4, PX + 6, 106], [3.2, PX - 18, 106], [99, PX - 18, 106]],
  dl3: [[0, PX + 130, 114], [1.0, PX + 6, 114], [2.4, PX + 6, 114], [3.2, PX - 16, 112], [99, PX - 16, 112]],
  cb1: [[0, 340, 66], [1.0, PX + 12, 66], [2.4, PX + 12, 66], [4.4, 228, 72], [5.4, 238, 86], [99, 238, 86]],
  cb2: [[0, 340, 148], [1.0, PX + 12, 148], [2.4, PX + 12, 148], [4.4, 228, 140], [5.4, 240, 124], [99, 240, 124]],
};
const PUNT: Script = {
  off: PUNT_OFF,
  def: PUNT_DEF,
  ball: (t) => {
    const punter = at2(PUNT_OFF.punter, t);
    const ret = at2(PUNT_DEF.returner, t);
    if (t < 1.0) return { x: PX - 3, y: 104 };
    if (t < 1.6) {
      const u = (t - 1.0) / 0.6; // the snap
      return { x: PX - 3 + (punter.x + 5 - (PX - 3)) * u, y: 104 - 4 * u };
    }
    if (t < 2.4) return { x: punter.x + 5, y: punter.y - 6 };
    if (t < 4.4) {
      const u = (t - 2.4) / 2.0; // the punt
      const x0 = PX - 26;
      const x1 = 264;
      return { x: x0 + (x1 - x0) * u, y: 100 + (104 - 100) * u - Math.sin(Math.PI * u) * 64 };
    }
    return { x: ret.x + 4, y: ret.y - 6 };
  },
};

/** Which play to show for a drive: touchdowns are a pass or a run, mixed up from drive to drive. */
function scriptFor(kind: Kind, index: number): Script {
  if (kind === "FG") return FG;
  if (kind === "PUNT") return PUNT;
  return (index * 7 + 3) % 3 === 1 ? RUN : PASS;
}

// 8 pixels wide. h helmet, k skin, j jersey, n numbers, p pants, b boots
const TORSO = ["..hhhh..", ".hhhhhh.", ".hhhhkk.", "..jjjj..", ".jjnnjj.", "jjjnnjjj", ".jjjjjj."];
const LEGS: Record<string, string[]> = {
  stand: ["..pppp..", "..pppp..", "..p..p..", "..b..b.."],
  run1: ["..pppp..", ".pp..pp.", "pp....p.", "b.....b."],
  run2: ["..pppp..", "..pp.pp.", ".pp...pp", ".b....b."],
};
const CHEER = ["j.hhhh.j", "jhhhhhhj", ".hhhhkk.", "..jjjj..", "..jnnj..", "..jnnj..", "..jjjj.."];

type Pose = "stand" | "run1" | "run2" | "cheer";
type Sprites = Record<Pose, HTMLCanvasElement>;

function dist(a: string, b: string) {
  const p = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  const [r1, g1, b1] = p(a);
  const [r2, g2, b2] = p(b);
  return Math.hypot(r1 - r2, g1 - g2, b1 - b2);
}

function buildSprites(primary: string, secondary: string, flip: boolean, skin: string): Sprites {
  const accent = dist(primary, secondary) > 110 ? secondary : "#f8fafc"; // pants and numbers need to stand out from the jersey
  const pal: Record<string, string> = { h: primary, j: primary, k: skin, n: accent, p: accent, b: "#111827" };
  const make = (rows: string[]) => {
    const c = document.createElement("canvas");
    c.width = 8;
    c.height = rows.length;
    const g = c.getContext("2d")!;
    rows.forEach((row, y) =>
      [...row].forEach((ch, x) => {
        if (!pal[ch]) return;
        g.fillStyle = pal[ch];
        g.fillRect(flip ? 7 - x : x, y, 1, 1);
      }),
    );
    return c;
  };
  return {
    stand: make([...TORSO, ...LEGS.stand]),
    run1: make([...TORSO, ...LEGS.run1]),
    run2: make([...TORSO, ...LEGS.run2]),
    cheer: make([...CHEER, ...LEGS.stand]),
  };
}

/** The stadium, drawn once: crowd, striped grass, yard lines and two end zones in the teams' colors. */
function buildField(winnerColor: string, loserColor: string): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;
  g.fillStyle = "#0b1226";
  g.fillRect(0, 0, W, FIELD_TOP);
  const crowd = ["#3b82f6", "#ef4444", "#f59e0b", "#e5e7eb", "#22c55e", "#a855f7"];
  let seed = 12345; // a tiny seeded random so the crowd looks scattered but is the same every time
  const rand = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  for (let i = 0; i < 520; i++) {
    g.fillStyle = crowd[Math.floor(rand() * crowd.length)];
    g.fillRect(Math.floor(rand() * (W - 2)), 4 + Math.floor(rand() * (FIELD_TOP - 10)), 2, 2);
  }
  g.fillStyle = "#1f2937";
  g.fillRect(0, FIELD_TOP - 4, W, 4);
  for (let x = 0; x < W; x += 20) {
    g.fillStyle = (x / 20) % 2 ? "#2f8f3a" : "#37a143";
    g.fillRect(x, FIELD_TOP, 20, H - FIELD_TOP);
  }
  g.fillStyle = winnerColor; // the winner scores in the end zone the loser defends, so that one wears the loser's colors
  g.fillRect(0, FIELD_TOP, 30, H - FIELD_TOP);
  g.fillStyle = loserColor;
  g.fillRect(GOAL_X, FIELD_TOP, W - GOAL_X, H - FIELD_TOP);
  g.fillStyle = "rgba(255,255,255,0.85)";
  for (let x = 30; x <= GOAL_X; x += 20) g.fillRect(x, FIELD_TOP, 1, H - FIELD_TOP);
  g.fillRect(GOAL_X, FIELD_TOP, 2, H - FIELD_TOP);
  g.fillRect(30, FIELD_TOP, 2, H - FIELD_TOP);
  for (let x = 40; x < GOAL_X; x += 20) for (const y of [90, 120]) g.fillRect(x, y, 1, 3); // hash marks
  g.fillStyle = "rgba(255,255,255,0.18)";
  g.fillRect(0, H - 6, W, 6);
  // goal posts at the back of each end zone: a yellow crossbar seen from above, with an upright at each end
  g.fillStyle = "#fde047";
  for (const px of [GOAL_POST_X - 1, 6]) {
    g.fillRect(px, 92, 2, 30);
    g.fillRect(px - 1, 90, 4, 3);
    g.fillRect(px - 1, 121, 4, 3);
  }
  return c;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  wobble: number;
}

export default function SuperBowlAnimation({ result, onClose }: { result: SuperBowlResult; onClose: () => void }) {
  const loser = result.winner === result.home ? result.away : result.home;
  const win = teamInfo(result.winner);
  const lose = teamInfo(loser);
  const events = result.events;

  // When each drive starts, and when the whole game ends.
  const { starts, total } = useMemo(() => {
    const starts: number[] = [];
    let at = 0;
    for (const e of events) {
      starts.push(at);
      at += PLAY_BY[e.kind] + CELEBRATE_BY[e.kind];
    }
    return { starts, total: at };
  }, [events]);
  const FINAL_AT = total + 0.3;

  const [run, setRun] = useState(0); // bumped by Replay
  const [phase, setPhase] = useState<"play" | "result" | "final">("play");
  const [points, setPoints] = useState({ W: 0, L: 0 });
  const [shown, setShown] = useState<GameEvent | null>(null); // the drive whose result graphic is showing
  const sceneRef = useRef<HTMLCanvasElement>(null);
  const confettiRef = useRef<HTMLCanvasElement>(null);
  const startRef = useRef(0);
  const closeRef = useRef<HTMLButtonElement>(null);
  const reduceMotion = useRef(typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  // Esc closes; the page behind doesn't scroll while the pop-up is open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  useEffect(() => {
    const scene = sceneRef.current!;
    const confetti = confettiRef.current!;
    const g = scene.getContext("2d")!;
    const cg = confetti.getContext("2d")!;
    g.imageSmoothingEnabled = false;

    // The winner always drives right (toward the loser's end zone), the loser drives left. Sprites face their way.
    const field = buildField(win.primary, lose.primary);
    const sprites = {
      W: { R: buildSprites(win.primary, win.secondary, false, "#e0ac69"), L: buildSprites(win.primary, win.secondary, true, "#e0ac69") },
      L: { R: buildSprites(lose.primary, lose.secondary, false, "#8d5524"), L: buildSprites(lose.primary, lose.secondary, true, "#8d5524") },
    };
    const parts: Particle[] = [];
    const palette = [win.primary, win.secondary, "#ffffff", "#fbbf24"];
    let raf = 0;
    let last = performance.now();
    let phaseNow: "play" | "result" | "final" = "play";
    let lastIdx = -1;
    let pW = 0;
    let pL = 0;
    let finalAt = 0;
    let emitted = 0;

    const sizeConfetti = () => {
      const dpr = window.devicePixelRatio || 1;
      confetti.width = window.innerWidth * dpr;
      confetti.height = window.innerHeight * dpr;
      cg.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    sizeConfetti();
    window.addEventListener("resize", sizeConfetti);

    const burst = (n: number, fromLeft: boolean, speed = 1) => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      for (let i = 0; i < n; i++) {
        const dir = fromLeft ? 1 : -1;
        parts.push({
          x: fromLeft ? vw * 0.08 : vw * 0.92,
          y: vh + 6,
          vx: dir * (60 + Math.random() * 320) * speed,
          vy: -(520 + Math.random() * 520) * speed,
          size: 6 + Math.floor(Math.random() * 3) * 2,
          color: palette[Math.floor(Math.random() * palette.length)],
          wobble: Math.random() * 6,
        });
      }
    };

    startRef.current = performance.now() - (reduceMotion.current ? FINAL_AT * 1000 : 0);

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const t = Math.max(0, (now - startRef.current) / 1000); // (the first frame can read a hair below zero)

      // ---- which drive, and how far into it ----
      const done = t >= total;
      let idx = 0;
      while (idx < events.length - 1 && t >= starts[idx + 1]) idx++;
      const ev = events[idx];
      const play = PLAY_BY[ev.kind];
      const tl = done ? play + CELEBRATE_BY[ev.kind] : t - starts[idx];
      const celebrate = tl >= play;
      const st = celebrate ? SCRIPT_END : (tl / play) * SCRIPT_END; // time inside the play script
      const mirror = ev.team === "L"; // the loser drives right-to-left
      const script = scriptFor(ev.kind, idx);
      const mx = (x: number) => (mirror ? W - x : x);
      const step = Math.floor(now / 110) % 2 ? "run1" : "run2";
      const offSet = sprites[ev.team][mirror ? "L" : "R"];
      const defSet = sprites[ev.team === "W" ? "L" : "W"][mirror ? "R" : "L"];
      const cheering = celebrate && ev.kind !== "PUNT";

      // ---- score as of now ----
      let w = 0;
      let l = 0;
      for (let j = 0; j < events.length; j++) {
        if (t < starts[j] + PLAY_BY[events[j].kind]) continue;
        if (events[j].team === "W") w += events[j].pts;
        else l += events[j].pts;
      }
      if (w !== pW || l !== pL) {
        pW = w;
        pL = l;
        setPoints({ W: w, L: l });
      }

      // ---- draw the game ----
      g.drawImage(field, 0, 0);
      type Item = { x: number; y: number; sprite: HTMLCanvasElement };
      const items: Item[] = [];
      for (const keys of Object.values(script.off)) {
        const p = at(keys, st);
        const bob = cheering ? -Math.abs(Math.sin(now / 110)) * 5 : 0;
        items.push({ x: mx(p.x), y: p.y + bob, sprite: cheering ? offSet.cheer : p.moving ? offSet[step] : offSet.stand });
      }
      for (const keys of Object.values(script.def)) {
        const p = at(keys, st);
        items.push({ x: mx(p.x), y: p.y, sprite: p.moving ? defSet[step] : defSet.stand });
      }
      items.sort((a, b) => a.y - b.y);
      for (const it of items) {
        g.fillStyle = "rgba(0,0,0,0.28)";
        g.fillRect(Math.round(it.x) - 3, Math.round(it.y) + 5, 7, 2);
        g.drawImage(it.sprite, Math.round(it.x) - 4, Math.round(it.y) - it.sprite.height + 6);
      }
      // the ball (spiked in the end zone after a touchdown)
      const b = script.ball(st);
      let bx = mx(b.x);
      let by = b.y;
      if (script.carrier && celebrate) {
        const carrier = at(script.off[script.carrier], st);
        const u = Math.min(1, (tl - play) / 0.45);
        bx = mx(carrier.x + 4) + (mirror ? -u * 6 : u * 6);
        by = carrier.y - 6 + (u < 0.6 ? u * 14 : 8 - Math.abs(Math.sin(u * 9)) * 3);
      }
      g.fillStyle = "#7c3f12";
      g.fillRect(Math.round(bx) - 2, Math.round(by) - 1, 4, 2);
      g.fillStyle = "#e5e7eb";
      g.fillRect(Math.round(bx), Math.round(by) - 1, 1, 1);
      if (celebrate && ev.kind === "TD" && tl < play + 0.25 && !done) {
        g.fillStyle = `rgba(255,255,255,${0.7 * (1 - (tl - play) / 0.25)})`; // flash on a touchdown
        g.fillRect(0, 0, W, H);
      }

      // ---- phases ----
      const next = t >= FINAL_AT ? "final" : celebrate ? "result" : "play";
      if (next !== phaseNow || (next === "result" && idx !== lastIdx)) {
        phaseNow = next;
        setPhase(next);
        if (next === "result") {
          lastIdx = idx;
          setShown(ev);
          if (ev.kind === "TD") burst(ev.team === "W" ? 26 : 10, ev.team === "W", ev.team === "W" ? 0.7 : 0.5);
          else if (ev.kind === "FG") burst(ev.team === "W" ? 12 : 5, ev.team === "W", 0.6);
        }
        if (next === "final") {
          finalAt = now;
          if (!reduceMotion.current) {
            burst(110, true);
            burst(110, false);
          }
          emitted = 0;
        }
      }

      // ---- confetti from the bottom of the screen ----
      cg.clearRect(0, 0, window.innerWidth, window.innerHeight);
      if (phaseNow === "final" && !reduceMotion.current && emitted < 4.5 && now > finalAt) {
        emitted += dt;
        const n = Math.round(90 * dt);
        for (let i = 0; i < n; i++) {
          parts.push({
            x: Math.random() * window.innerWidth,
            y: window.innerHeight + 6,
            vx: (Math.random() - 0.5) * 120,
            vy: -(380 + Math.random() * 380),
            size: 6 + Math.floor(Math.random() * 3) * 2,
            color: palette[Math.floor(Math.random() * palette.length)],
            wobble: Math.random() * 6,
          });
        }
      }
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        p.vy += 760 * dt;
        p.x += (p.vx + Math.sin(now / 160 + p.wobble) * 40) * dt;
        p.y += p.vy * dt;
        if (p.y > window.innerHeight + 20 && p.vy > 0) {
          parts.splice(i, 1);
          continue;
        }
        cg.fillStyle = p.color;
        cg.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", sizeConfetti);
    };
    // `run` restarts the whole thing (Replay)
  }, [run, events, starts, total, FINAL_AT, win.primary, win.secondary, lose.primary, lose.secondary]);

  const skip = () => {
    startRef.current = Math.min(startRef.current, performance.now() - FINAL_AT * 1000);
  };
  const replay = () => {
    setPhase("play");
    setShown(null);
    setPoints({ W: 0, L: 0 });
    setRun((r) => r + 1);
  };

  const pointsOf = (team: string) => (team === result.winner ? points.W : points.L);
  const shownTeam = shown ? (shown.team === "W" ? result.winner : loser) : null;
  const finalW = pointsFor(events, "W");
  const champion = result.isSuperBowl ?? true;

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={`${result.title ?? "Super Bowl"} animation`} className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-3 backdrop-blur-sm sm:p-6">
      <div className="relative w-full max-w-4xl">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="font-pixel text-[10px] leading-relaxed text-white sm:text-xs">{result.title ?? "SUPER BOWL"}</div>
          <div className="flex gap-2">
            {phase !== "final" && (
              <button onClick={skip} className="font-pixel rounded bg-white/15 px-3 py-2 text-[10px] text-white hover:bg-white/25">
                SKIP
              </button>
            )}
            <button ref={closeRef} onClick={onClose} aria-label="Close" className="font-pixel rounded bg-white/15 px-3 py-2 text-[10px] text-white hover:bg-white/25">
              CLOSE X
            </button>
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border-4 border-white/80 bg-black shadow-2xl shadow-black">
          {/* scoreboard: updates with every score */}
          <div className="font-pixel flex items-stretch justify-between bg-[#111827] text-white">
            {[result.away, result.home].map((team) => (
              <div key={team} className="flex flex-1 items-center justify-between gap-2 border-b-4 px-3 py-2" style={{ borderColor: teamInfo(team).primary }}>
                <span className="text-[10px] sm:text-sm">{team}</span>
                <span className={`text-lg tabular-nums sm:text-3xl ${phase === "result" && shown && shown.pts > 0 && shownTeam === team ? "animate-pulse text-white" : "text-yellow-300"}`}>
                  {String(pointsOf(team)).padStart(2, "0")}
                </span>
              </div>
            ))}
          </div>
          <div className="relative">
            <canvas ref={sceneRef} width={W} height={H} className="block w-full" style={{ imageRendering: "pixelated", aspectRatio: `${W} / ${H}` }} />
            {phase === "result" && shown && shownTeam && shown.kind !== "PUNT" && (
              <div className="font-pixel pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1 sm:gap-2">
                <span className="animate-pulse text-2xl text-yellow-300 [text-shadow:3px_3px_0_#000] sm:text-5xl">{shown.kind === "TD" ? "TOUCHDOWN!" : "FIELD GOAL!"}</span>
                <span className="rounded px-2 py-1 text-[9px] text-white [text-shadow:1px_1px_0_#000] sm:text-sm" style={{ backgroundColor: teamInfo(shownTeam).primary }}>
                  {teamInfo(shownTeam).name.toUpperCase()} +{shown.pts}
                </span>
              </div>
            )}
            {phase === "result" && shown?.kind === "PUNT" && shownTeam && (
              <div className="font-pixel pointer-events-none absolute inset-x-0 top-2 flex justify-center">
                <span className="rounded bg-black/60 px-2 py-1 text-[9px] text-white sm:text-sm">{shownTeam} PUNTS</span>
              </div>
            )}
            {phase === "final" && (
              <div className="rise absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/60 p-2 text-center sm:gap-2 sm:p-3">
                <div className="font-pixel hidden text-[8px] text-yellow-300 sm:block sm:text-xs">{champion ? "SUPER BOWL CHAMPIONS" : "WINNER: ADVANCES"}</div>
                <div className="sm:hidden">
                  <TeamLogo abbr={result.winner} size={48} />
                </div>
                <div className="hidden sm:block">
                  <TeamLogo abbr={result.winner} size={96} />
                </div>
                <div className="font-pixel text-[9px] text-white [text-shadow:2px_2px_0_#000] sm:text-2xl">{win.name.toUpperCase()}</div>
                <div className="font-pixel text-[7px] text-yellow-300 sm:hidden">{champion ? "CHAMPIONS" : "ADVANCES"}</div>
                {result.winnerRecord && (
                  <div className="font-pixel hidden text-[8px] text-white/80 sm:block sm:text-[10px]">
                    {result.winnerRecord} IN THE REGULAR SEASON{result.winnerSeed ? ` · #${result.winnerSeed} SEED` : ""}
                  </div>
                )}
                <div className="font-pixel text-[8px] text-white/80 sm:text-xs">FINAL: {finalW}-{pointsFor(events, "L")}</div>
                <div className="mt-1 flex gap-2">
                  <button onClick={replay} className="font-pixel rounded bg-yellow-300 px-2 py-1.5 text-[8px] text-black hover:bg-yellow-200 sm:px-3 sm:py-2 sm:text-[10px]">
                    REPLAY
                  </button>
                  <button onClick={onClose} className="font-pixel rounded bg-white/20 px-2 py-1.5 text-[8px] text-white hover:bg-white/30 sm:px-3 sm:py-2 sm:text-[10px]">
                    BACK TO BRACKET
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
        <p className="mt-2 text-center text-xs text-white/70">The model picks the winner; the plays and the score are just for fun.</p>
      </div>
      <canvas ref={confettiRef} aria-hidden className="pointer-events-none fixed inset-0 h-full w-full" />
    </div>,
    document.body,
  );
}
