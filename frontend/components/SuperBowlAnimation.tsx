"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import TeamLogo from "@/components/TeamLogo";
import { buildSprites } from "@/lib/pixelSprites";
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
  tie?: boolean; // a tied game: "winner" is just the first team and nobody is crowned
  realDrives?: boolean; // the drives are the real ones from the game
  realGame?: boolean; // a game that really happened (regular season): real final score, the plays are made up
}

// ---------- the scene ----------
const W = 320; // the little pixel world; scaled up with sharp edges
const H = 180;
const FIELD_TOP = 40;
const GOAL_X = 290; // right end zone starts here
const SCRIPT_END = 6.0; // each play script runs 0 to 6 "script seconds"
// Real seconds each kind of drive takes to play out, and to celebrate (a punt barely pauses).
const PLAY_BY: Record<Kind, number> = { TD: 2.5, FG: 2.0, PUNT: 1.6, MISSED_FG: 2.0, INT: 2.2, FUMBLE: 2.0, DOWNS: 1.7, SAFETY: 2.5 };
const CELEBRATE_BY: Record<Kind, number> = { TD: 1.1, FG: 0.8, PUNT: 0.55, MISSED_FG: 0.9, INT: 1.0, FUMBLE: 1.0, DOWNS: 0.9, SAFETY: 1.1 };
const SCORING: Kind[] = ["TD", "FG", "SAFETY"];
// What the screen says after a drive that didn't score (and who it hurt).
const NO_SCORE_LABEL: Partial<Record<Kind, string>> = { MISSED_FG: "NO GOOD!", INT: "INTERCEPTED!", FUMBLE: "FUMBLE!", DOWNS: "TURNOVER ON DOWNS" };
const RETURN_LABEL = { pick: "PICK SIX!", fumble: "FUMBLE RETURN TD!", return: "RETURN TOUCHDOWN!" } as const;

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
  /** How long this play takes compared with a normal one (short plays are quick, bombs take longer). */
  dur: number;
  /** Shown instead of "TOUCHDOWN!" for a special kind of score (a pick six). */
  label?: string;
}

const GOAL_LINE_X = 294; // where a runner or receiver ends up, inside the end zone
const GOAL_POST_X = W - 8;
const OFF_LEFT = -50; // where the offense starts, off screen
const OFF_RIGHT = W + 40; // where the defense starts, off screen

/**
 * A passing touchdown from the line of scrimmage `L`. Small `L` is a long bomb, large `L` is a short toss in the red zone.
 * The offense faces right; the defense faces left. Everything is positioned relative to `L` so one recipe makes every length.
 */
function makePass(L: number, dur = 1): Script {
  const D = GOAL_LINE_X - L;
  const mid = L + D * 0.38;
  const far = L + D * 0.72;
  const off: Record<string, Key[]> = {
    wr1: [[0, OFF_LEFT, 70], [1, L - 6, 70], [1.6, L - 6, 70], [2.6, mid, 70], [4.2, far, 94], [5.9, GOAL_LINE_X, 100], [99, GOAL_LINE_X, 100]],
    wr2: [[0, OFF_LEFT, 148], [1, L - 6, 148], [1.6, L - 6, 148], [3.4, L + D * 0.5, 148], [99, L + D * 0.5, 148]],
    qb: [[0, OFF_LEFT, 106], [1, L - 14, 106], [1.9, L - 14, 106], [2.6, L - 26, 106], [99, L - 26, 106]],
    rb: [[0, OFF_LEFT, 106], [1, L - 22, 106], [1.6, L - 22, 106], [2.4, L - 4, 118], [99, L - 4, 118]],
    ol1: [[0, OFF_LEFT, 96], [1, L - 6, 96], [1.6, L - 6, 96], [3.5, L - 12, 96], [5.5, L + D * 0.3, 96], [99, L + D * 0.3, 96]],
    ol2: [[0, OFF_LEFT, 106], [1, L - 6, 106], [1.6, L - 6, 106], [3.5, L - 12, 106], [5.5, L + D * 0.32, 108], [99, L + D * 0.32, 108]],
    ol3: [[0, OFF_LEFT, 116], [1, L - 6, 116], [1.6, L - 6, 116], [3.5, L - 12, 116], [5.5, L + D * 0.3, 118], [99, L + D * 0.3, 118]],
  };
  const deep = Math.min(L + 44, W + 8);
  const def: Record<string, Key[]> = {
    dl1: [[0, OFF_RIGHT, 96], [1, L + 4, 96], [1.6, L + 4, 96], [3.3, L - 12, 96], [5.5, L + D * 0.2, 98], [99, L + D * 0.2, 98]],
    dl2: [[0, OFF_RIGHT, 106], [1, L + 4, 106], [1.6, L + 4, 106], [3.3, L - 16, 106], [5.5, L + D * 0.22, 108], [99, L + D * 0.22, 108]],
    dl3: [[0, OFF_RIGHT, 116], [1, L + 4, 116], [1.6, L + 4, 116], [3.3, L - 12, 118], [5.5, L + D * 0.2, 118], [99, L + D * 0.2, 118]],
    lb: [[0, OFF_RIGHT, 106], [1, L + 16, 106], [1.6, L + 16, 106], [3.4, L + D * 0.32, 100], [5.5, L + D * 0.88, 100], [99, L + D * 0.88, 100]],
    cb1: [[0, OFF_RIGHT, 70], [1, L + 10, 70], [1.6, L + 10, 70], [2.6, mid - 8, 72], [4.2, far - 12, 98], [5.9, 282, 104], [99, 282, 104]],
    cb2: [[0, OFF_RIGHT, 148], [1, L + 10, 148], [1.6, L + 10, 148], [3.4, L + D * 0.5 - 10, 148], [99, L + D * 0.5 - 10, 148]],
    s: [[0, OFF_RIGHT + 20, 106], [1, deep, 106], [1.6, deep, 106], [4.2, L + D * 0.62, 100], [5.9, 264, 102], [99, 264, 102]],
  };
  return {
    off,
    def,
    dur,
    carrier: "wr1",
    ball: (t) => {
      const qb = at(off.qb, t);
      const wr = at(off.wr1, t);
      if (t < 1.6) return { x: L - 2, y: 106 };
      if (t < 1.9) {
        const u = (t - 1.6) / 0.3; // the snap
        return { x: L - 2 + (qb.x + 5 - (L - 2)) * u, y: 106 - 4 * u };
      }
      if (t < 3.5) return { x: qb.x + 5, y: qb.y - 6 };
      if (t < 4.2) {
        const u = (t - 3.5) / 0.7; // the throw
        const fromX = L - 21;
        const toX = far + 2;
        return { x: fromX + (toX - fromX) * u, y: 100 + (88 - 100) * u - Math.sin(Math.PI * u) * (24 + D * 0.1) };
      }
      return { x: wr.x + 4, y: wr.y - 6 };
    },
  };
}

/** A running touchdown: handoff, then up the field. Small `L` is a breakaway; a very large `L` is a goal-line plunge. */
function makeRun(L: number, dur = 1): Script {
  const D = GOAL_LINE_X - L;
  const deep = Math.min(L + 44, W + 8);
  const off: Record<string, Key[]> = {
    qb: [[0, OFF_LEFT, 106], [1, L - 14, 106], [2.4, L - 14, 106], [99, L - 14, 106]],
    rb: [[0, OFF_LEFT, 106], [1, L - 26, 118], [1.8, L - 26, 118], [2.4, L - 12, 110], [3.6, L + D * 0.38, 110], [4.8, L + D * 0.76, 120], [5.9, GOAL_LINE_X, 108], [99, GOAL_LINE_X, 108]],
    wr1: [[0, OFF_LEFT, 70], [1, L - 6, 70], [1.6, L - 6, 70], [4.4, L + D * 0.48, 78], [99, L + D * 0.48, 78]],
    wr2: [[0, OFF_LEFT, 148], [1, L - 6, 148], [1.6, L - 6, 148], [4.4, L + D * 0.5, 140], [99, L + D * 0.5, 140]],
    ol1: [[0, OFF_LEFT, 96], [1, L - 6, 96], [1.6, L - 6, 96], [2.6, L + 2, 96], [4.6, L + D * 0.4, 98], [99, L + D * 0.4, 98]],
    ol2: [[0, OFF_LEFT, 106], [1, L - 6, 106], [1.6, L - 6, 106], [2.6, L + 2, 106], [4.6, L + D * 0.43, 108], [99, L + D * 0.43, 108]],
    ol3: [[0, OFF_LEFT, 116], [1, L - 6, 116], [1.6, L - 6, 116], [2.6, L + 2, 118], [4.6, L + D * 0.4, 118], [99, L + D * 0.4, 118]],
  };
  const def: Record<string, Key[]> = {
    dl1: [[0, OFF_RIGHT, 96], [1, L + 4, 96], [1.6, L + 4, 96], [3.0, L + D * 0.1, 100], [5.0, L + D * 0.5, 112], [99, L + D * 0.5, 112]],
    dl2: [[0, OFF_RIGHT, 106], [1, L + 4, 106], [1.6, L + 4, 106], [3.0, L + D * 0.12, 106], [5.0, L + D * 0.55, 116], [99, L + D * 0.55, 116]],
    dl3: [[0, OFF_RIGHT, 116], [1, L + 4, 116], [1.6, L + 4, 116], [3.0, L + D * 0.1, 116], [5.0, L + D * 0.5, 122], [99, L + D * 0.5, 122]],
    lb: [[0, OFF_RIGHT, 106], [1, L + 16, 106], [1.6, L + 16, 106], [3.4, L + D * 0.3, 112], [5.6, L + D * 0.8, 110], [99, L + D * 0.8, 110]],
    cb1: [[0, OFF_RIGHT, 70], [1, L + 10, 70], [1.6, L + 10, 70], [4.6, L + D * 0.62, 96], [99, L + D * 0.62, 96]],
    cb2: [[0, OFF_RIGHT, 148], [1, L + 10, 148], [1.6, L + 10, 148], [4.6, L + D * 0.62, 132], [99, L + D * 0.62, 132]],
    s: [[0, OFF_RIGHT + 20, 106], [1, deep, 106], [1.6, deep, 106], [4.6, L + D * 0.75, 112], [5.9, Math.min(282, GOAL_LINE_X - 4), 110], [99, Math.min(282, GOAL_LINE_X - 4), 110]],
  };
  return {
    off,
    def,
    dur,
    carrier: "rb",
    ball: (t) => {
      const qb = at(off.qb, t);
      const rb = at(off.rb, t);
      if (t < 1.6) return { x: L - 2, y: 106 };
      if (t < 1.9) {
        const u = (t - 1.6) / 0.3; // the snap
        return { x: L - 2 + (qb.x + 5 - (L - 2)) * u, y: 106 - 4 * u };
      }
      if (t < 2.4) {
        const u = (t - 1.9) / 0.5; // the handoff
        return { x: qb.x + 5 + (rb.x - qb.x - 5) * u, y: qb.y - 6 + (rb.y - 6 - (qb.y - 6)) * u };
      }
      return { x: rb.x + 4, y: rb.y - 6 };
    },
  };
}

/**
 * A "pick six": the opponent's quarterback throws, the scoring team's cornerback intercepts and runs it back.
 * Here `off` is the scoring team's DEFENSE (facing right) and `def` is the other team's offense (facing left).
 */
function makePickSix(L: number, dur = 1, label = "PICK SIX!"): Script {
  const off: Record<string, Key[]> = {
    dl1: [[0, OFF_LEFT, 96], [1, L - 6, 96], [2.0, L - 6, 96], [2.8, L + 4, 100], [99, L + 4, 100]],
    dl2: [[0, OFF_LEFT, 106], [1, L - 6, 106], [2.0, L - 6, 106], [2.8, L + 6, 106], [99, L + 6, 106]],
    dl3: [[0, OFF_LEFT, 116], [1, L - 6, 116], [2.0, L - 6, 116], [2.8, L + 4, 112], [99, L + 4, 112]],
    lb: [[0, OFF_LEFT, 106], [1, L - 20, 106], [99, L - 20, 106]],
    cb1: [[0, OFF_LEFT, 72], [1, L - 34, 72], [3.0, L - 34, 72], [3.4, L - 31, 72], [5.9, GOAL_LINE_X, 100], [99, GOAL_LINE_X, 100]],
    cb2: [[0, OFF_LEFT, 142], [1, L - 34, 142], [99, L - 34, 142]],
    s: [[0, OFF_LEFT, 106], [1, L - 52, 106], [99, L - 52, 106]],
  };
  const def: Record<string, Key[]> = {
    qb: [[0, OFF_RIGHT + 20, 106], [1, L + 16, 106], [2.0, L + 16, 106], [2.6, L + 22, 106], [99, L + 22, 106]],
    ol1: [[0, OFF_RIGHT, 96], [1, L + 6, 96], [99, L + 6, 96]],
    ol2: [[0, OFF_RIGHT, 106], [1, L + 6, 106], [99, L + 6, 106]],
    ol3: [[0, OFF_RIGHT, 116], [1, L + 6, 116], [99, L + 6, 116]],
    wr1: [[0, OFF_RIGHT, 72], [1, L + 6, 72], [1.6, L + 6, 72], [3.0, L - 28, 72], [99, L - 28, 72]],
    wr2: [[0, OFF_RIGHT, 142], [1, L + 6, 142], [99, L + 6, 142]],
    rb: [[0, OFF_RIGHT + 20, 106], [1, L + 30, 118], [99, L + 30, 118]],
  };
  return {
    off,
    def,
    dur,
    label,
    carrier: "cb1",
    ball: (t) => {
      const qb = at(def.qb, t);
      const cb = at(off.cb1, t);
      if (t < 1.6) return { x: L + 1, y: 104 };
      if (t < 1.9) {
        const u = (t - 1.6) / 0.3; // the snap to the other team's quarterback
        return { x: L + 1 + (qb.x - 4 - (L + 1)) * u, y: 104 + (qb.y - 6 - 104) * u };
      }
      if (t < 2.6) return { x: qb.x - 4, y: qb.y - 6 };
      if (t < 3.3) {
        const u = (t - 2.6) / 0.7; // the ill-fated pass
        const fromX = L + 14;
        const toX = L - 31;
        return { x: fromX + (toX - fromX) * u, y: 100 + (72 - 100) * u - Math.sin(Math.PI * u) * 18 };
      }
      return { x: cb.x + 4, y: cb.y - 6 };
    },
  };
}

/** A field goal kicked from line `FX` (small `FX` is a long one). The ball arcs through the posts at the back of the end zone. */
function makeFieldGoal(FX: number, dur = 1, miss = false): Script {
  const off: Record<string, Key[]> = {
    ol1: [[0, OFF_LEFT, 96], [1.0, FX - 4, 96], [99, FX - 4, 96]],
    ol2: [[0, OFF_LEFT, 104], [1.0, FX - 4, 104], [99, FX - 4, 104]],
    ol3: [[0, OFF_LEFT, 112], [1.0, FX - 4, 112], [99, FX - 4, 112]],
    wr1: [[0, OFF_LEFT, 88], [1.0, FX - 4, 88], [99, FX - 4, 88]],
    wr2: [[0, OFF_LEFT, 120], [1.0, FX - 4, 120], [99, FX - 4, 120]],
    rb: [[0, OFF_LEFT, 100], [1.0, FX - 12, 124], [99, FX - 12, 124]],
    holder: [[0, OFF_LEFT, 112], [1.0, FX - 17, 112], [99, FX - 17, 112]],
    kicker: [[0, OFF_LEFT, 106], [1.0, FX - 32, 106], [2.0, FX - 32, 106], [2.5, FX - 24, 106], [99, FX - 24, 106]],
  };
  const def: Record<string, Key[]> = {
    dl1: [[0, OFF_RIGHT, 96], [1.0, FX + 6, 96], [2.2, FX + 6, 96], [2.7, FX - 6, 100], [99, FX - 6, 100]],
    dl2: [[0, OFF_RIGHT, 104], [1.0, FX + 6, 104], [2.2, FX + 6, 104], [2.7, FX - 6, 106], [99, FX - 6, 106]],
    dl3: [[0, OFF_RIGHT, 112], [1.0, FX + 6, 112], [2.2, FX + 6, 112], [2.7, FX - 6, 112], [99, FX - 6, 112]],
    lb: [[0, OFF_RIGHT, 88], [1.0, FX + 8, 88], [2.4, FX - 2, 92], [99, FX - 2, 92]],
    cb1: [[0, OFF_RIGHT, 124], [1.0, FX + 8, 124], [2.4, FX - 2, 120], [99, FX - 2, 120]],
    s: [[0, OFF_RIGHT + 20, 106], [1.0, Math.min(FX + 40, W + 10), 106], [99, Math.min(FX + 40, W + 10), 106]],
  };
  const x0 = FX - 19;
  const height = 16 + (GOAL_POST_X - x0) * 0.16; // longer kicks fly higher
  const endX = miss ? x0 + (GOAL_POST_X - x0) * 0.94 : GOAL_POST_X; // a miss drifts wide of the posts
  const wide = miss ? 15 : 0;
  return {
    off,
    def,
    dur,
    ball: (t) => {
      const holder = at(off.holder, t);
      if (t < 1.0) return { x: FX - 3, y: 104 };
      if (t < 1.5) {
        const u = (t - 1.0) / 0.5; // the snap
        return { x: FX - 3 + (holder.x + 1 - (FX - 3)) * u, y: 104 + (109 - 104) * u };
      }
      if (t < 2.4) return { x: holder.x + 1, y: 109 };
      if (t < 4.6) {
        const u = (t - 2.4) / 2.2; // the kick
        return { x: x0 + (endX - x0) * u, y: 109 + (106 - 109) * u - Math.sin(Math.PI * u) * height + wide * u };
      }
      return { x: endX, y: 106 + wide + Math.min(1, (t - 4.6) / 1.2) * 10 };
    },
  };
}

/** A punt from line `PX` that comes down at `land`; with `fair` the returner just catches it. */
function makePunt(PX: number, land: number, fair: boolean, dur = 1): Script {
  const off: Record<string, Key[]> = {
    punter: [[0, OFF_LEFT, 106], [1.0, PX - 34, 106], [2.2, PX - 34, 106], [2.6, PX - 30, 106], [99, PX - 30, 106]],
    ol1: [[0, OFF_LEFT, 98], [1.0, PX - 4, 98], [2.4, PX - 4, 98], [5.0, PX + 60, 100], [99, PX + 60, 100]],
    ol2: [[0, OFF_LEFT, 106], [1.0, PX - 4, 106], [2.4, PX - 4, 106], [5.0, PX + 56, 108], [99, PX + 56, 108]],
    ol3: [[0, OFF_LEFT, 114], [1.0, PX - 4, 114], [2.4, PX - 4, 114], [5.0, PX + 60, 116], [99, PX + 60, 116]],
    wr1: [[0, OFF_LEFT, 66], [1.0, PX - 4, 66], [2.4, PX - 4, 66], [4.4, land - 28, 72], [5.3, land - 12, 92], [99, land - 12, 92]],
    wr2: [[0, OFF_LEFT, 148], [1.0, PX - 4, 148], [2.4, PX - 4, 148], [4.4, land - 28, 140], [5.3, land - 10, 122], [99, land - 10, 122]],
    rb: [[0, OFF_LEFT, 112], [1.0, PX - 24, 122], [99, PX - 24, 122]],
  };
  const def: Record<string, Key[]> = {
    returner: [[0, OFF_RIGHT + 20, 106], [1.0, land + 8, 106], [3.0, land + 8, 106], [4.3, land, 108], [5.4, fair ? land : land - 14, 110], [99, fair ? land : land - 14, 110]],
    dl1: [[0, OFF_RIGHT, 98], [1.0, PX + 6, 98], [2.4, PX + 6, 98], [3.2, PX - 16, 100], [99, PX - 16, 100]],
    dl2: [[0, OFF_RIGHT, 106], [1.0, PX + 6, 106], [2.4, PX + 6, 106], [3.2, PX - 18, 106], [99, PX - 18, 106]],
    dl3: [[0, OFF_RIGHT, 114], [1.0, PX + 6, 114], [2.4, PX + 6, 114], [3.2, PX - 16, 112], [99, PX - 16, 112]],
    cb1: [[0, OFF_RIGHT, 66], [1.0, PX + 12, 66], [2.4, PX + 12, 66], [4.4, land - 36, 72], [5.4, land - 26, 86], [99, land - 26, 86]],
    cb2: [[0, OFF_RIGHT, 148], [1.0, PX + 12, 148], [2.4, PX + 12, 148], [4.4, land - 36, 140], [5.4, land - 24, 124], [99, land - 24, 124]],
  };
  return {
    off,
    def,
    dur,
    ball: (t) => {
      const punter = at(off.punter, t);
      const ret = at(def.returner, t);
      if (t < 1.0) return { x: PX - 3, y: 104 };
      if (t < 1.6) {
        const u = (t - 1.0) / 0.6; // the snap
        return { x: PX - 3 + (punter.x + 5 - (PX - 3)) * u, y: 104 - 4 * u };
      }
      if (t < 2.4) return { x: punter.x + 5, y: punter.y - 6 };
      if (t < 4.4) {
        const u = (t - 2.4) / 2.0; // the punt
        const x0 = PX - 26;
        return { x: x0 + (land - x0) * u, y: 100 + (104 - 100) * u - Math.sin(Math.PI * u) * 64 };
      }
      return { x: ret.x + 4, y: ret.y - 6 };
    },
  };
}

/** An interception: the same drive as a long pass, but the cornerback picks it off and the receiver is left empty-handed. */
function makeInterception(L: number, dur = 1): Script {
  const base = makePass(L, dur);
  const D = GOAL_LINE_X - L;
  const far = L + D * 0.72;
  const off = { ...base.off, wr1: [[0, OFF_LEFT, 70], [1, L - 6, 70], [1.6, L - 6, 70], [2.6, L + D * 0.38, 70], [4.2, far - 14, 94], [99, far - 14, 94]] as Key[] };
  const cb1: Key[] = [[0, OFF_RIGHT, 70], [1, L + 10, 70], [1.6, L + 10, 70], [2.6, L + D * 0.38 - 8, 72], [4.2, far, 92], [5.9, far - 16, 96], [99, far - 16, 96]];
  const def = { ...base.def, cb1 };
  return {
    off,
    def,
    dur,
    ball: (t) => {
      if (t < 4.2) return base.ball(t);
      const cb = at(cb1, t);
      return { x: cb.x + 4, y: cb.y - 6 };
    },
  };
}

/** A fumble: the runner is hit, the ball comes loose, and a linebacker falls on it. */
function makeFumble(L: number, dur = 1): Script {
  const base = makeRun(L, dur);
  const D = GOAL_LINE_X - L;
  const X = L + D * 0.38;
  const rb: Key[] = [...base.off.rb.slice(0, 5), [99, X, 110]];
  const lb: Key[] = [[0, OFF_RIGHT, 106], [1, L + 16, 106], [1.6, L + 16, 106], [3.4, X + 12, 110], [4.3, X + 3, 112], [99, X + 3, 112]];
  return {
    off: { ...base.off, rb },
    def: { ...base.def, lb },
    dur,
    ball: (t) => {
      if (t < 3.6) return base.ball(t);
      const u = Math.min(1, (t - 3.6) / 0.7); // the ball squirts out, then the linebacker has it
      const l = at(lb, t);
      return t < 4.3 ? { x: X + 2 + u * 6, y: 108 - Math.sin(Math.PI * u) * 12 } : { x: l.x - 1, y: l.y - 6 };
    },
  };
}

/** Turnover on downs: a run that is stopped short. */
function makeStuffed(L: number, dur = 1): Script {
  const base = makeRun(L, dur);
  const rb: Key[] = [[0, OFF_LEFT, 106], [1, L - 26, 118], [1.8, L - 26, 118], [2.4, L - 12, 110], [3.4, L + 6, 110], [99, L + 6, 110]];
  const lb: Key[] = [[0, OFF_RIGHT, 106], [1, L + 16, 106], [1.6, L + 16, 106], [3.0, L + 14, 110], [99, L + 14, 110]];
  const dl = (k: Key[]): Key[] => [...k.slice(0, 3), [3.0, L + 8, k[0][2] > 0 ? k[1][2] : 100], [99, L + 8, k[1][2]]];
  return {
    off: { ...base.off, rb },
    def: { ...base.def, lb, dl1: dl(base.def.dl1), dl2: dl(base.def.dl2), dl3: dl(base.def.dl3) },
    dur,
    ball: (t) => {
      if (t < 2.4) return base.ball(t);
      const r = at(rb, t);
      return { x: r.x + 4, y: r.y - 6 };
    },
  };
}

// The menu of plays, from short to long. Several drives in a game never look alike.
const TD_PLAYS: (() => Script)[] = [
  () => makePass(250, 0.8), // a short toss in the red zone
  () => makePass(186), // a medium pass
  () => makePass(96, 1.15), // a bomb
  () => makeRun(274, 0.72), // a goal-line plunge
  () => makeRun(204), // a medium run
  () => makeRun(120, 1.12), // a breakaway
  () => makePickSix(160, 1.1), // an interception returned for a score
];
const OFFENSE_TD_PLAYS = TD_PLAYS.slice(0, 6); // real games only show a pick six when one actually happened
const INT_PLAYS: (() => Script)[] = [() => makeInterception(190), () => makeInterception(130, 1.1)];
const FUMBLE_PLAYS: (() => Script)[] = [() => makeFumble(200), () => makeFumble(150, 1.1)];
const DOWNS_PLAYS: (() => Script)[] = [() => makeStuffed(220), () => makeStuffed(180)];
const MISS_PLAYS: (() => Script)[] = [() => makeFieldGoal(236, 1, true), () => makeFieldGoal(206, 1, true), () => makeFieldGoal(176, 1.1, true)];
const FG_PLAYS: (() => Script)[] = [() => makeFieldGoal(262, 0.8), () => makeFieldGoal(236), () => makeFieldGoal(206), () => makeFieldGoal(176, 1.1)];
const PUNT_PLAYS: (() => Script)[] = [() => makePunt(90, 268, false, 1.05), () => makePunt(130, 282, false), () => makePunt(166, 296, true, 0.9)];

/** A small seeded random-number generator so a given game always replays with the same plays. */
function seededRandom(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Pick a play for every drive of a game. The same kind of play is never used twice in a row. */
function chooseScripts(events: GameEvent[]): Script[] {
  const seed = events.reduce((n, e, i) => n * 31 + (i + 1) * (e.pts + 7) + (e.team === "W" ? 3 : 5), 17);
  const rand = seededRandom(seed);
  const last: Record<string, number> = {};
  return events.map((e) => {
    if (e.how) return makePickSix(160, 1.1, RETURN_LABEL[e.how]); // a defensive touchdown
    if (e.kind === "SAFETY") return makePickSix(160, 1.1, "SAFETY!");
    const real = e.q !== undefined;
    const menu =
      e.kind === "TD" ? (real ? OFFENSE_TD_PLAYS : TD_PLAYS)
      : e.kind === "FG" ? FG_PLAYS
      : e.kind === "MISSED_FG" ? MISS_PLAYS
      : e.kind === "INT" ? INT_PLAYS
      : e.kind === "FUMBLE" ? FUMBLE_PLAYS
      : e.kind === "DOWNS" ? DOWNS_PLAYS
      : PUNT_PLAYS;
    let i = Math.floor(rand() * menu.length);
    if (i === last[e.kind]) i = (i + 1 + Math.floor(rand() * (menu.length - 1))) % menu.length;
    last[e.kind] = i;
    return menu[i]();
  });
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

  // The plays for this game (a short pass, a long run, a 50-yard field goal...), and how long each one takes. High-scoring games
  // have more drives, so each is played a little faster to keep the whole thing short.
  const scripts = useMemo(() => chooseScripts(events), [events]);
  const scale = events.length > 8 ? 8 / events.length : 1;
  const plays = useMemo(() => events.map((e, i) => PLAY_BY[e.kind] * scale * scripts[i].dur), [events, scripts, scale]);
  const celebs = useMemo(() => events.map((e) => CELEBRATE_BY[e.kind] * scale), [events, scale]);

  // When each drive starts, and when the whole game ends.
  const { starts, total } = useMemo(() => {
    const starts: number[] = [];
    let at = 0;
    events.forEach((_, i) => {
      starts.push(at);
      at += plays[i] + celebs[i];
    });
    return { starts, total: at };
  }, [events, plays, celebs]);
  const FINAL_AT = total + 0.3;

  const [run, setRun] = useState(0); // bumped by Replay
  const [phase, setPhase] = useState<"play" | "result" | "final">("play");
  const [points, setPoints] = useState({ W: 0, L: 0 });
  const [shown, setShown] = useState<GameEvent | null>(null); // the drive whose result graphic is showing
  const [shownLabel, setShownLabel] = useState<string | null>(null); // special headline for the score on screen (e.g. PICK SIX!)
  const [otBanner, setOtBanner] = useState(false); // the "OVERTIME" pop-up when the game goes to overtime
  const [quarter, setQuarter] = useState<number | null>(null); // real games: which quarter the drive on screen is in
  const [punting, setPunting] = useState<GameEvent | null>(null); // set while a punt is in the air, so "PUNT" can be shown
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
    let quarterNow: number | null = null;
    let otStart = 0;
    let puntShown = false;
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
      if ((ev.q ?? null) !== quarterNow) {
        quarterNow = ev.q ?? null;
        setQuarter(quarterNow);
        if (quarterNow !== null && quarterNow > 4) {
          otStart = now;
          setOtBanner(true);
        }
      }
      if (otStart && now - otStart > 2200) {
        otStart = 0;
        setOtBanner(false);
      }
      const play = plays[idx];
      const tl = done ? play + celebs[idx] : t - starts[idx];
      const celebrate = tl >= play;
      const st = celebrate ? SCRIPT_END : (tl / play) * SCRIPT_END; // time inside the play script
      const mirror = ev.team === "L"; // the loser drives right-to-left
      const script = scripts[idx];
      const mx = (x: number) => (mirror ? W - x : x);
      const step = Math.floor(now / 110) % 2 ? "run1" : "run2";
      const offSet = sprites[ev.team][mirror ? "L" : "R"];
      const defSet = sprites[ev.team === "W" ? "L" : "W"][mirror ? "R" : "L"];
      const cheering = celebrate && SCORING.includes(ev.kind);

      // ---- score as of now ----
      let w = 0;
      let l = 0;
      for (let j = 0; j < events.length; j++) {
        if (t < starts[j] + plays[j]) continue;
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

      // ---- the "PUNT" graphic: from the kick until the play is over ----
      const wantPunt = ev.kind === "PUNT" && st >= 2.3 && t < FINAL_AT;
      if (wantPunt !== puntShown) {
        puntShown = wantPunt;
        setPunting(wantPunt ? ev : null);
      }

      // ---- phases ----
      const next = t >= FINAL_AT ? "final" : celebrate ? "result" : "play";
      if (next !== phaseNow || (next === "result" && idx !== lastIdx)) {
        phaseNow = next;
        setPhase(next);
        if (next === "result") {
          lastIdx = idx;
          setShown(ev);
          setShownLabel(script.label ?? null);
          if (ev.kind === "TD") burst(ev.team === "W" ? 26 : 10, ev.team === "W", ev.team === "W" ? 0.7 : 0.5);
          else if (ev.kind === "FG" || ev.kind === "SAFETY") burst(ev.team === "W" ? 12 : 5, ev.team === "W", 0.6);
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
  }, [run, events, scripts, plays, celebs, starts, total, FINAL_AT, win.primary, win.secondary, lose.primary, lose.secondary]);

  const skip = () => {
    startRef.current = Math.min(startRef.current, performance.now() - FINAL_AT * 1000);
  };
  const replay = () => {
    setPhase("play");
    setShown(null);
    setShownLabel(null);
    setPunting(null);
    setOtBanner(false);
    setPoints({ W: 0, L: 0 });
    setRun((r) => r + 1);
  };

  const pointsOf = (team: string) => (team === result.winner ? points.W : points.L);
  const shownTeam = shown ? (shown.team === "W" ? result.winner : loser) : null;
  const finalW = pointsFor(events, "W");
  const champion = result.isSuperBowl ?? true;
  const hadOvertime = events.some((e) => (e.q ?? 0) > 4);

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
            {[result.away].map((team) => (
              <div key={team} className="flex flex-1 items-center justify-between gap-2 border-b-4 px-3 py-2" style={{ borderColor: teamInfo(team).primary }}>
                <span className="text-[10px] sm:text-sm">{team}</span>
                <span className={`text-lg tabular-nums sm:text-3xl ${phase === "result" && shown && shown.pts > 0 && shownTeam === team ? "animate-pulse text-white" : "text-yellow-300"}`}>
                  {String(pointsOf(team)).padStart(2, "0")}
                </span>
              </div>
            ))}
            {quarter && phase !== "final" && (
              <div className={`flex shrink-0 items-center justify-center border-b-4 border-white/70 px-2 text-xs sm:px-5 sm:text-xl ${quarter > 4 ? "text-red-400" : "text-white"}`}>
                {quarter > 4 ? "OT" : `Q${quarter}`}
              </div>
            )}
            {[result.home].map((team) => (
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
            {phase === "result" && shown && shownTeam && shown.kind !== "PUNT" && !punting && !otBanner && (
              <div className="font-pixel pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1 sm:gap-2">
                <span className={`animate-pulse text-2xl [text-shadow:3px_3px_0_#000] sm:text-5xl ${shown.pts > 0 ? "text-yellow-300" : "text-red-400"}`}>
                  {shownLabel ?? NO_SCORE_LABEL[shown.kind] ?? (shown.kind === "TD" ? "TOUCHDOWN!" : "FIELD GOAL!")}
                </span>
                <span className="rounded px-2 py-1 text-[9px] text-white [text-shadow:1px_1px_0_#000] sm:text-sm" style={{ backgroundColor: teamInfo(shownTeam).primary }}>
                  {teamInfo(shownTeam).name.toUpperCase()}
                  {shown.pts > 0 ? ` +${shown.pts}` : ""}
                </span>
                {shown.kind === "TD" && shown.pts === 6 && (
                  <span className="rounded bg-red-600 px-2 py-0.5 text-[8px] text-white [text-shadow:1px_1px_0_#000] sm:text-xs">MISSED PAT</span>
                )}
                {shown.kind === "TD" && shown.pts === 8 && (
                  <span className="rounded bg-emerald-600 px-2 py-0.5 text-[8px] text-white [text-shadow:1px_1px_0_#000] sm:text-xs">TWO-POINT CONVERSION GOOD</span>
                )}
              </div>
            )}
            {otBanner && phase !== "final" && (
              <div className="font-pixel pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/65">
                <span className="rise animate-pulse text-3xl text-red-400 [text-shadow:4px_4px_0_#000] sm:text-6xl">OVERTIME</span>
              </div>
            )}
            {punting && phase !== "final" && (
              <div className="font-pixel pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1 sm:gap-2">
                <span className="text-2xl text-white [text-shadow:3px_3px_0_#000] sm:text-5xl">PUNT</span>
                <span
                  className="rounded px-2 py-1 text-[9px] text-white [text-shadow:1px_1px_0_#000] sm:text-sm"
                  style={{ backgroundColor: teamInfo(punting.team === "W" ? result.winner : loser).primary }}
                >
                  {teamInfo(punting.team === "W" ? result.winner : loser).name.toUpperCase()}
                </span>
              </div>
            )}
            {phase === "final" && (
              <div className="rise absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/60 p-2 text-center sm:gap-2 sm:p-3">
                {result.tie ? (
                  <>
                    <div className="font-pixel text-[9px] text-yellow-300 sm:text-xs">{hadOvertime ? "TIED AFTER OVERTIME" : "TIE GAME"}</div>
                    <div className="flex items-center gap-3">
                      {[result.away, result.home].map((tm) => (
                        <div key={tm}>
                          <div className="sm:hidden">
                            <TeamLogo abbr={tm} size={44} />
                          </div>
                          <div className="hidden sm:block">
                            <TeamLogo abbr={tm} size={80} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="font-pixel hidden text-[8px] text-yellow-300 sm:block sm:text-xs">{champion ? "SUPER BOWL CHAMPIONS" : result.realGame ? "WINNER" : "WINNER: ADVANCES"}</div>
                    <div className="sm:hidden">
                      <TeamLogo abbr={result.winner} size={48} />
                    </div>
                    <div className="hidden sm:block">
                      <TeamLogo abbr={result.winner} size={96} />
                    </div>
                    <div className="font-pixel text-[9px] text-white [text-shadow:2px_2px_0_#000] sm:text-2xl">{win.name.toUpperCase()}</div>
                    <div className="font-pixel text-[7px] text-yellow-300 sm:hidden">{champion ? "CHAMPIONS" : result.realGame ? "WINNER" : "ADVANCES"}</div>
                  </>
                )}
                {result.winnerRecord && (
                  <div className="font-pixel hidden text-[8px] text-white/80 sm:block sm:text-[10px]">
                    {result.winnerRecord} IN THE REGULAR SEASON{result.winnerSeed ? ` · #${result.winnerSeed} SEED` : ""}
                  </div>
                )}
                <div className="font-pixel text-[8px] text-white/80 sm:text-xs">FINAL{hadOvertime ? " (OT)" : ""}: {finalW}-{pointsFor(events, "L")}</div>
                <div className="mt-1 flex gap-2">
                  <button onClick={replay} className="font-pixel rounded bg-yellow-300 px-2 py-1.5 text-[8px] text-black hover:bg-yellow-200 sm:px-3 sm:py-2 sm:text-[10px]">
                    REPLAY
                  </button>
                  <button onClick={onClose} className="font-pixel rounded bg-white/20 px-2 py-1.5 text-[8px] text-white hover:bg-white/30 sm:px-3 sm:py-2 sm:text-[10px]">
                    {result.realGame ? "CLOSE" : "BACK TO BRACKET"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
        <p className="mt-2 text-center text-xs text-white/70">{result.realGame ? (result.realDrives ? "The drives and final score are real; the plays themselves are drawn for fun." : "The final score is real; the plays are made up to match it.") : "The model picks the winner; the plays and the score are just for fun."}</p>
      </div>
      <canvas ref={confettiRef} aria-hidden className="pointer-events-none fixed inset-0 h-full w-full" />
    </div>,
    document.body,
  );
}
