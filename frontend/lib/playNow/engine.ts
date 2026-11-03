// The rules and physics of the "Play now" game. Pure TypeScript: no DOM, no React, so it can be tested with bots.
//
// You play OFFENSE only, driving left to right. Between your drives the other team's possessions are simulated from the two
// teams' ratings (simulateOppDrive). The game is two short halves; a half is 10:00 of game clock that runs 5x faster than
// real time while the ball is live, so a half lasts about 90 to 120 real seconds.

export const PX_PER_YD = 5;
export const GOAL_L = 50; // x of the goal line you defend
export const GOAL_R = 550; // x of the goal line you attack
export const WORLD_W = 600;
export const Y_MIN = 64; // the playable lanes of the field
export const Y_MAX = 164;
export const Y_MID = 112;
export const HALF_SECONDS = 600; // game seconds in a half
export const TIME_SCALE = 5; // game seconds per real second while a play is live
const BALL_SPEED = 230; // px/s of a thrown ball

export type Rng = () => number;
export type Phase = "presnap" | "live" | "kick" | "result" | "opp" | "halftime" | "final";
export type PlayKind = "pass" | "run";
export type Action = "snap" | "selectPass" | "selectRun" | "fieldGoal" | "punt" | "throw1" | "throw2" | "throw3" | "boost" | "continue";

export interface TeamRating {
  abbr: string;
  name: string;
  rating: number; // Elo, quarterback included
}

export interface Ent {
  id: string;
  side: "off" | "def";
  role: string; // qb rb wr ol dl lb cb s
  x: number;
  y: number;
  vx: number;
  vy: number;
  speed: number;
  moving: boolean;
  face: 1 | -1;
  route?: { pts: [number, number][]; i: number };
  cover?: string; // the receiver this defender covers
  breakAt: number; // a pass rusher beats his blocker at this time
  err: [number, number]; // how loosely this defender plays his man, in px
  cooldown: number; // time before he can try another tackle
  num?: number; // receiver number shown above the head (1-3)
  blocking?: string; // the defender this lineman or receiver is blocking
  engaged: boolean; // this defender is tied up by a blocker
}

interface Flight {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  t: number;
  dur: number;
  target: string;
  h: number;
  pressured: boolean;
}

export interface Ball {
  x: number;
  y: number;
  z: number; // height above the ground, for the arc
  holder: string | null;
  flight: Flight | null;
}

export interface OppDrive {
  start: number; // the opponent's starting yard line (from their own goal)
  plays: number;
  yards: number;
  seconds: number; // game clock used
  result: "TD" | "FG" | "PUNT" | "INT" | "DOWNS" | "TIME";
  pts: number;
  userStart: number; // where you get the ball next (yards from your own goal)
}

export interface Stats {
  passAtt: number;
  passComp: number;
  passYds: number;
  rushYds: number;
  sacks: number;
  ints: number;
  firstDowns: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);

/** Receiver routes as (dx, dy) offsets from the starting spot, in px. Positive dy runs toward the middle of the field. */
const ROUTES: Record<string, [number, number][]> = {
  go: [[130, 0]],
  post: [[55, 0], [115, 26]],
  corner: [[55, 0], [115, -20]],
  out: [[48, 0], [48, -30]],
  curl: [[62, 0], [48, 8]],
  slant: [[14, 0], [64, 24]],
  drag: [[12, 6], [26, 52]],
  flat: [[8, -14], [44, -36]],
};
const ROUTE_NAMES = Object.keys(ROUTES);

/**
 * One possession of the other team, simulated. Chances come from league-average drive results (about 22% touchdowns,
 * 15% field goals, 2.0 points a drive), shifted by how the two teams compare (`edge`: +1 means you are much stronger) and by
 * where the drive starts. Returns what happened and how much game clock it used.
 */
export function simulateOppDrive(start: number, edge: number, rng: Rng, remaining: number): OppDrive {
  const pTD = clamp(0.2 + 0.003 * (start - 25) - 0.11 * edge, 0.04, 0.55);
  const pFG = clamp(0.14 + 0.0015 * (start - 25) - 0.04 * edge, 0.03, 0.3);
  const pTO = clamp(0.1 + 0.035 * edge, 0.04, 0.2);
  const pDowns = 0.07;
  const r = rng();
  let result: OppDrive["result"];
  if (r < pTD) result = "TD";
  else if (r < pTD + pFG) result = "FG";
  else if (r < pTD + pFG + pTO) result = "INT";
  else if (r < pTD + pFG + pTO + pDowns) result = "DOWNS";
  else result = "PUNT";

  const toGoal = 100 - start;
  let yards: number;
  if (result === "TD") yards = toGoal;
  else if (result === "FG") yards = Math.round(toGoal * (0.55 + rng() * 0.25));
  else if (result === "PUNT") yards = Math.round(4 + rng() * 34);
  else yards = Math.round(4 + rng() * Math.min(40, toGoal - 5));
  yards = clamp(yards, 0, toGoal);
  const plays = Math.max(result === "TD" && yards < 12 ? 1 : 3, Math.round(yards / 5.4) + (result === "PUNT" ? 3 : 1));
  let seconds = Math.round(plays * (19 + rng() * 9));
  let pts = result === "TD" ? 7 : result === "FG" ? 3 : 0;

  if (seconds > remaining) {
    // the half ends mid-drive: it only counts if it had already been scoring quickly enough
    if (rng() > remaining / seconds) {
      result = "TIME";
      pts = 0;
    }
    seconds = remaining;
  }

  let userStart: number;
  if (result === "TD" || result === "FG" || result === "TIME") userStart = 25;
  else if (result === "PUNT") userStart = clamp(Math.round(18 + rng() * 22), 10, 45);
  else userStart = clamp(100 - (start + yards), 8, 88);
  return { start, plays, yards, seconds, result, pts, userStart };
}

export class FootballGame {
  readonly userTeam: TeamRating;
  readonly oppTeam: TeamRating;
  readonly edge: number; // -1 .. 1, how much stronger you are
  private rng: Rng;

  half = 1;
  clock = HALF_SECONDS;
  score = { user: 0, opp: 0 };
  yardLine = 25; // yards from your own goal line
  down = 1;
  toGo = 10;
  phase: Phase = "presnap";
  selected: PlayKind = "pass";
  message = "";
  stats: Stats = { passAtt: 0, passComp: 0, passYds: 0, rushYds: 0, sacks: 0, ints: 0, firstDowns: 0 };

  ents: Ent[] = [];
  ball: Ball = { x: 0, y: 0, z: 0, holder: null, flight: null };
  controlled = "qb";
  playKind: PlayKind = "pass";
  t = 0; // time into the current play
  pastLine = false; // the quarterback has crossed the line of scrimmage, so he can't throw
  caught = false;
  boostUntil = 0;
  boostReady = 0;
  private moveX = 0;
  private moveY = 0;
  private pressured = false;

  // results, kicks and opponent drives
  private resultT = 0;
  private pending: { kind: "next" | "opp"; oppStart?: number } = { kind: "next" };
  kick: { type: "fg" | "punt"; t: number; dur: number; good: boolean; x0: number; x1: number } | null = null;
  oppDrive: OppDrive | null = null;
  oppT = 0;
  readonly oppDurReal = 2.4;
  private clockBeforeOpp = 0;
  /** The score as a touchdown celebration needs it: who just scored. */
  scoredTD = false;

  constructor(user: TeamRating, opp: TeamRating, rng: Rng = Math.random) {
    this.userTeam = user;
    this.oppTeam = opp;
    this.edge = clamp((user.rating - opp.rating) / 200, -1, 1);
    this.rng = rng;
    this.startPresnap();
  }

  // ---------------------------------------------------------------- queries
  get losX() {
    return GOAL_L + this.yardLine * PX_PER_YD;
  }
  get firstDownX() {
    return GOAL_L + Math.min(100, this.yardLine + this.toGo) * PX_PER_YD;
  }
  get fgDistance() {
    return 100 - this.yardLine + 17;
  }
  get canKick() {
    return this.fgDistance <= 62;
  }
  get displayClock() {
    if (this.phase === "opp" && this.oppDrive) {
      const u = Math.min(1, this.oppT / this.oppDurReal);
      return Math.max(0, this.clockBeforeOpp - this.oppDrive.seconds * u);
    }
    return this.clock;
  }
  get ownerLabel() {
    return this.yardLine === 50 ? "MIDFIELD" : this.yardLine < 50 ? `OWN ${this.yardLine}` : `OPP ${100 - this.yardLine}`;
  }
  ent(id: string) {
    return this.ents.find((e) => e.id === id);
  }

  // ---------------------------------------------------------------- input
  setMove(dx: number, dy: number) {
    this.moveX = dx;
    this.moveY = dy;
  }

  press(a: Action) {
    switch (this.phase) {
      case "presnap":
        if (a === "selectPass") this.selected = this.playKind = "pass";
        else if (a === "selectRun") this.selected = this.playKind = "run";
        else if (a === "snap") this.snap();
        else if (a === "fieldGoal" && this.down === 4 && this.canKick) this.startFieldGoal();
        else if (a === "punt" && this.down === 4) this.startPunt();
        break;
      case "live":
        if (a === "throw1" || a === "throw2" || a === "throw3") this.throwTo(`wr${a.slice(-1)}`);
        else if (a === "boost") this.boost();
        break;
      case "opp":
        if (a === "continue") this.oppT = this.oppDurReal; // skip the animation
        break;
      case "halftime":
        if (a === "continue") this.startSecondHalf();
        break;
      default:
        break;
    }
  }

  // ---------------------------------------------------------------- time
  update(dt: number) {
    dt = Math.min(dt, 0.05);
    switch (this.phase) {
      case "live":
        this.updateLive(dt);
        break;
      case "kick":
        if (this.kick) {
          this.kick.t += dt;
          if (this.kick.t >= this.kick.dur) this.finishKick();
        }
        break;
      case "result":
        this.resultT -= dt;
        if (this.resultT <= 0) this.afterResult();
        break;
      case "opp":
        this.oppT += dt;
        if (this.oppT >= this.oppDurReal) this.finishOppDrive();
        break;
      default:
        break;
    }
  }

  // ---------------------------------------------------------------- setting up a play
  private startPresnap() {
    this.phase = "presnap";
    this.t = 0;
    this.caught = false;
    this.pastLine = false;
    this.pressured = false;
    this.scoredTD = false;
    this.kick = null;
    this.playKind = this.selected; // what the field shows (route lines, receiver numbers) follows your choice
    this.buildFormation();
  }

  private mkEnt(id: string, side: "off" | "def", role: string, x: number, y: number, speed: number): Ent {
    return {
      id, side, role, x, y, vx: 0, vy: 0, speed, moving: false, face: side === "off" ? 1 : -1, breakAt: 0, cooldown: 0, engaged: false,
      err: [(this.rng() - 0.35) * 14, (this.rng() - 0.5) * 18],
    };
  }

  private buildFormation() {
    const L = this.losX;
    const dm = 1 - 0.05 * this.edge; // better teams face slower defenders
    const ents: Ent[] = [
      this.mkEnt("ol1", "off", "ol", L - 2, Y_MID - 10, 30),
      this.mkEnt("ol2", "off", "ol", L - 2, Y_MID, 30),
      this.mkEnt("ol3", "off", "ol", L - 2, Y_MID + 10, 30),
      this.mkEnt("qb", "off", "qb", L - 24, Y_MID, 50),
      this.mkEnt("rb", "off", "rb", L - 30, Y_MID + 10, 61),
      this.mkEnt("wr1", "off", "wr", L - 3, 72, 62),
      this.mkEnt("wr2", "off", "wr", L - 3, 154, 62),
      this.mkEnt("wr3", "off", "wr", L - 9, 134, 62),
      this.mkEnt("dl1", "def", "dl", L + 3, Y_MID - 10, 58 * dm),
      this.mkEnt("dl2", "def", "dl", L + 3, Y_MID, 58 * dm),
      this.mkEnt("dl3", "def", "dl", L + 3, Y_MID + 10, 58 * dm),
      this.mkEnt("lb1", "def", "lb", L + 16, 96, 62 * dm),
      this.mkEnt("lb2", "def", "lb", L + 16, 130, 62 * dm),
      this.mkEnt("cb1", "def", "cb", L + 8, 74, 64 * dm),
      this.mkEnt("cb2", "def", "cb", L + 8, 152, 64 * dm),
      this.mkEnt("s", "def", "s", L + 44, Y_MID, 63 * dm),
    ];
    // three different routes for the three receivers
    const names = [...ROUTE_NAMES];
    for (const id of ["wr1", "wr2", "wr3"]) {
      const e = ents.find((x) => x.id === id)!;
      const name = names.splice(Math.floor(this.rng() * names.length), 1)[0];
      const toMid = e.y < Y_MID ? 1 : -1;
      e.route = { pts: ROUTES[name].map(([dx, dy]) => [e.x + dx, clamp(e.y + dy * toMid, Y_MIN, Y_MAX)] as [number, number]), i: 0 };
      e.num = Number(id.slice(-1));
    }
    for (const [ol, dl] of [["ol1", "dl1"], ["ol2", "dl2"], ["ol3", "dl3"]]) ents.find((x) => x.id === ol)!.blocking = dl;
    ents.find((x) => x.id === "cb1")!.cover = "wr1";
    ents.find((x) => x.id === "cb2")!.cover = "wr2";
    ents.find((x) => x.id === "lb2")!.cover = "wr3";
    for (const e of ents) if (e.role === "dl") e.breakAt = (2.2 + this.rng() * 1.7) * (1 + 0.15 * this.edge);
    this.ents = ents;
    this.controlled = "qb";
    this.ball = { x: L - 20, y: Y_MID - 6, z: 0, holder: "qb", flight: null };
  }

  private snap() {
    this.playKind = this.selected;
    this.phase = "live";
    this.t = 0;
    this.stats_playStarted();
    if (this.playKind === "run") {
      this.controlled = "rb";
      this.ball.holder = "rb";
      // on a run the receivers block downfield instead of running routes, and the line holds its men longer
      for (const [wr, d] of [["wr1", "cb1"], ["wr2", "cb2"], ["wr3", "lb2"]]) {
        const e = this.ent(wr)!;
        e.route = undefined;
        e.num = undefined;
        e.blocking = d;
      }
      for (const d of this.ents) {
        if (d.side !== "def" || !["dl", "cb", "lb"].includes(d.role) || d.id === "lb1") continue;
        const held = d.role === "dl" ? 0.6 + this.rng() * 0.7 : d.role === "cb" ? 0.7 + this.rng() * 0.6 : 0.8 + this.rng() * 0.7;
        // some blocks simply fail: the defender beats his man right away and the run is stuffed
        d.breakAt = (this.rng() < 0.35 ? 0.15 + this.rng() * 0.25 : held) * (1 + 0.2 * this.edge);
      }
    } else {
      this.controlled = "qb";
      this.ball.holder = "qb";
    }
  }
  private stats_playStarted() {
    this.boostUntil = 0;
    this.boostReady = 0;
  }

  // ---------------------------------------------------------------- a live play
  private boost() {
    if (this.t >= this.boostReady && this.holder()?.id === this.controlled && (this.caught || this.playKind === "run" || this.pastLine)) {
      this.boostUntil = this.t + 0.7;
      this.boostReady = this.t + 2.0;
    }
  }

  private holder(): Ent | undefined {
    return this.ball.holder ? this.ent(this.ball.holder) : undefined;
  }

  private step(e: Ent, tx: number, ty: number, speed: number, dt: number) {
    const dx = tx - e.x;
    const dy = ty - e.y;
    const d = Math.hypot(dx, dy);
    if (d < 0.5) {
      e.vx = e.vy = 0;
      e.moving = false;
      return;
    }
    const s = Math.min(d, speed * dt);
    e.vx = (dx / d) * speed;
    e.vy = (dy / d) * speed;
    e.x += (dx / d) * s;
    e.y += (dy / d) * s;
    e.moving = true;
    if (Math.abs(dx) > 0.5) e.face = dx > 0 ? 1 : -1;
  }

  private updateLive(dt: number) {
    this.t += dt;
    this.clock = Math.max(0, this.clock - dt * TIME_SCALE);

    this.moveControlled(dt);
    if (this.phase !== "live") return;
    this.updateReceivers(dt);
    this.updateBlockers(dt);
    this.updateDefense(dt);
    this.updateBall(dt);
    if (this.phase !== "live") return;
    this.checkContact(dt);
    if (this.phase !== "live") return;
    const h = this.holder();
    if (h && h.side === "off" && h.x >= GOAL_R) this.endPlay("td", h.x);
  }

  private moveControlled(dt: number) {
    const c = this.ent(this.controlled);
    if (!c) return;
    const carrying = this.ball.holder === c.id;
    const mag = Math.hypot(this.moveX, this.moveY);
    if (mag > 0.01) {
      const boost = carrying && this.t < this.boostUntil ? 1.45 : 1;
      const sp = c.speed * boost * (carrying || c.role === "qb" ? 1 : 0.9);
      c.x += (this.moveX / mag) * sp * dt;
      c.y += (this.moveY / mag) * sp * dt;
      c.vx = (this.moveX / mag) * sp;
      c.vy = (this.moveY / mag) * sp;
      c.moving = true;
      if (Math.abs(this.moveX) > 0.01) c.face = this.moveX > 0 ? 1 : -1;
    } else {
      c.vx = c.vy = 0;
      c.moving = false;
    }
    c.y = clamp(c.y, Y_MIN, Y_MAX);
    c.x = clamp(c.x, 4, WORLD_W - 4);
    if (c.role === "qb") {
      c.x = Math.max(c.x, this.losX - 46);
      if (!this.pastLine && c.x > this.losX + 2) this.pastLine = true;
    }
  }

  private updateReceivers(dt: number) {
    for (const e of this.ents) {
      if (e.side !== "off" || !e.route || e.id === this.controlled) continue;
      const r = e.route;
      if (r.i >= r.pts.length) {
        e.moving = false;
        e.vx = e.vy = 0;
        continue;
      }
      const [tx, ty] = r.pts[r.i];
      this.step(e, tx, ty, e.speed, dt);
      if (dist(e.x, e.y, tx, ty) < 1) r.i++;
    }
  }

  /** Linemen (and, on runs, receivers) latch onto their man and hold him until he beats the block. */
  private updateBlockers(dt: number) {
    for (const b of this.ents) {
      if (b.side !== "off" || !b.blocking) continue;
      if (b.role === "wr" && this.playKind !== "run") continue;
      const target = this.ent(b.blocking);
      if (!target) continue;
      if (this.t >= target.breakAt) {
        b.moving = false;
        b.vx = b.vy = 0;
        continue; // he got off the block
      }
      if (dist(b.x, b.y, target.x, target.y) > 9) {
        this.step(b, target.x - 6, target.y, b.role === "ol" ? 44 : 58, dt);
      } else {
        target.engaged = true;
        b.x = target.x - 6;
        b.y = target.y;
        b.moving = false;
      }
    }
  }

  private updateDefense(dt: number) {
    const carrier = this.holder();
    const post = this.caught || this.playKind === "run" || (carrier && carrier.role !== "qb"); // the ball is being carried downfield
    const flying = this.ball.flight;
    const qb = this.ent("qb");
    for (const d of this.ents) {
      if (d.side !== "def") continue;
      d.cooldown = Math.max(0, d.cooldown - dt);
      if (d.engaged && this.t >= d.breakAt) d.engaged = false;
      if (d.engaged) {
        // tied up by a blocker: on a run he is driven downfield, which opens a lane
        if (this.playKind === "run" && !this.caught) d.x += 4 * dt;
        d.moving = false;
        d.vx = d.vy = 0;
        continue;
      }
      const chase = (sp: number) => {
        if (!carrier) return;
        this.step(d, carrier.x + carrier.vx * 0.22, carrier.y + carrier.vy * 0.22, sp, dt);
      };
      if (this.caught || (carrier && carrier.role !== "qb" && carrier.side === "off")) {
        chase(d.speed);
        continue;
      }
      if (this.playKind === "run") {
        const delay = d.role === "dl" ? 0.4 : d.role === "lb" ? 0.3 : d.role === "s" ? 0.35 : 0.5;
        if (this.t < delay) {
          this.step(d, d.x, d.y, 0, dt);
        } else chase(d.speed);
        continue;
      }
      // a pass play
      if (flying) {
        // everyone near the ball goes for it; the rest keep their coverage
        const near = dist(d.x, d.y, flying.x1, flying.y1) < 60;
        if (near || d.role === "dl") {
          this.step(d, flying.x1, flying.y1, d.role === "dl" ? 26 : d.speed, dt);
          continue;
        }
      }
      if (d.role === "dl") {
        if (this.t < d.breakAt || !qb) this.step(d, d.x, qb ? lerpToward(d.y, qb.y, 6, dt) : d.y, 12, dt);
        else this.step(d, qb.x, qb.y, d.speed, dt);
      } else if (d.role === "lb" && !d.cover) {
        if (this.t < 2.2 || !qb) this.step(d, d.x, qb ? lerpToward(d.y, qb.y, 10, dt) : d.y, 10, dt);
        else this.step(d, qb.x, qb.y, d.speed, dt);
      } else if (d.cover) {
        const r = this.ent(d.cover);
        if (r) this.step(d, r.x + 8 + d.err[0] * (1 - 0.3 * this.edge), r.y + d.err[1] * (1 - 0.3 * this.edge), d.speed, dt);
      } else if (d.role === "s") {
        const deepest = this.ents.filter((e) => e.side === "off" && e.num).sort((a, b) => b.x - a.x)[0];
        if (deepest) this.step(d, deepest.x + 14, deepest.y, d.speed * 0.95, dt);
      }
    }
    void post;
  }

  private updateBall(dt: number) {
    const h = this.holder();
    if (h) {
      this.ball.x = h.x + h.face * 4;
      this.ball.y = h.y - 6;
      this.ball.z = 0;
    }
    const f = this.ball.flight;
    if (!f) return;
    f.t += dt;
    const u = Math.min(1, f.t / f.dur);
    this.ball.x = f.x0 + (f.x1 - f.x0) * u;
    this.ball.y = f.y0 + (f.y1 - f.y0) * u;
    this.ball.z = Math.sin(Math.PI * u) * f.h;
    if (f.t >= f.dur) this.resolveCatch(f);
  }

  /** Where a receiver will be `secs` from now if he keeps running his route. */
  private predict(e: Ent, secs: number): [number, number] {
    let x = e.x;
    let y = e.y;
    let left = secs * e.speed;
    const r = e.route;
    if (!r) return [x, y];
    for (let i = r.i; i < r.pts.length && left > 0; i++) {
      const [tx, ty] = r.pts[i];
      const d = dist(x, y, tx, ty);
      if (d <= left) {
        x = tx;
        y = ty;
        left -= d;
      } else {
        x += ((tx - x) / d) * left;
        y += ((ty - y) / d) * left;
        left = 0;
      }
    }
    return [x, y];
  }

  private throwTo(id: string) {
    const qb = this.ent("qb");
    const target = this.ent(id);
    if (!qb || !target || this.ball.holder !== "qb" || this.ball.flight || this.pastLine || this.playKind !== "pass") return;
    let T = dist(qb.x, qb.y, target.x, target.y) / BALL_SPEED;
    let [tx, ty] = this.predict(target, T);
    for (let i = 0; i < 3; i++) {
      T = Math.max(0.3, dist(qb.x, qb.y, tx, ty) / BALL_SPEED);
      [tx, ty] = this.predict(target, T);
    }
    const near = Math.min(...this.ents.filter((e) => e.side === "def").map((e) => dist(e.x, e.y, qb.x, qb.y)));
    this.pressured = near < 16;
    const d = dist(qb.x, qb.y, tx, ty);
    this.ball.holder = null;
    this.ball.flight = { x0: qb.x + 4, y0: qb.y - 6, x1: tx, y1: ty - 6, t: 0, dur: Math.max(0.35, d / BALL_SPEED), target: id, h: Math.min(28, d * 0.18), pressured: this.pressured };
    this.stats.passAtt++;
    qb.moving = false;
  }

  private resolveCatch(f: Flight) {
    const target = this.ent(f.target);
    this.ball.flight = null;
    if (!target) return this.endPlay("incomplete", f.x1);
    const defs = this.ents.filter((e) => e.side === "def");
    const near = Math.min(...defs.map((e) => dist(e.x, e.y, target.x, target.y)));
    const sep = near / PX_PER_YD;
    const pCatch = clamp(0.45 + 0.13 * sep + 0.1 * this.edge - (f.pressured ? 0.08 : 0), 0.12, 0.95);
    if (this.rng() < pCatch) {
      this.caught = true;
      this.ball.holder = target.id;
      this.controlled = target.id;
      this.stats.passComp++;
      return;
    }
    const pInt = near < 12 ? 0.25 : 0.03;
    if (this.rng() < pInt) return this.endPlay("interception", target.x);
    this.endPlay("incomplete", target.x);
  }

  private checkContact(dt: number) {
    void dt;
    const h = this.holder();
    if (!h || h.side !== "off") return;
    const boosting = this.t < this.boostUntil;
    for (const d of this.ents) {
      if (d.side !== "def" || d.cooldown > 0) continue;
      if (dist(d.x, d.y, h.x, h.y) > 6.5) continue;
      if (h.role === "qb" && !this.pastLine) {
        if (d.engaged) continue; // a blocked rusher can't get to the quarterback
        return this.endPlay("sack", h.x);
      }
      // a blocked defender can still arm-tackle a runner who goes right past him, just much less often
      const p = d.engaged ? (boosting ? 0.28 : 0.55) : boosting ? 0.42 : 0.74;
      if (this.rng() < p) return this.endPlay("tackle", h.x);
      d.cooldown = 0.7; // he whiffed
    }
  }

  // ---------------------------------------------------------------- the end of a play
  private endPlay(kind: "tackle" | "sack" | "incomplete" | "interception" | "td", x: number) {
    this.ball.flight = null;
    this.setMove(0, 0);
    let gain = Math.round((x - this.losX) / PX_PER_YD);
    if (kind === "sack") {
      gain = Math.min(gain, -2);
      this.stats.sacks++;
    }
    if (kind === "incomplete") gain = 0;
    this.pending = { kind: "next" };
    this.phase = "result";
    this.resultT = 1.25;

    if (kind === "td") {
      this.scoredTD = true;
      this.score.user += 7;
      const yards = 100 - this.yardLine;
      if (this.caught) this.stats.passYds += yards;
      else this.stats.rushYds += yards;
      this.message = "TOUCHDOWN! +7";
      this.resultT = 2.1;
      this.pending = { kind: "opp", oppStart: 25 };
      return;
    }
    if (kind === "interception") {
      this.stats.ints++;
      this.message = "INTERCEPTED!";
      const spot = clamp(Math.round((x - GOAL_L) / PX_PER_YD), 1, 99);
      this.pending = { kind: "opp", oppStart: clamp(100 - spot, 1, 99) };
      return;
    }
    if (kind !== "incomplete") {
      if (this.caught || this.playKind === "pass") this.stats.passYds += gain;
      else this.stats.rushYds += gain;
    }
    this.yardLine = clamp(this.yardLine + gain, 1, 99);
    if (kind === "incomplete") {
      this.message = "INCOMPLETE";
      this.down++;
    } else {
      const label = kind === "sack" ? `SACK! ${gain} YARDS` : `${gain >= 0 ? "+" : ""}${gain} YARDS`;
      this.toGo -= gain;
      if (this.toGo <= 0) {
        this.down = 1;
        this.toGo = Math.min(10, 100 - this.yardLine);
        this.stats.firstDowns++;
        this.message = `${label} · FIRST DOWN!`;
      } else {
        this.down++;
        this.message = label;
      }
    }
    if (this.down > 4) {
      this.message = "TURNOVER ON DOWNS";
      this.pending = { kind: "opp", oppStart: clamp(100 - this.yardLine, 1, 99) };
    }
  }

  private afterResult() {
    if (this.clock <= 0) return this.endHalf();
    if (this.pending.kind === "opp") return this.startOppDrive(this.pending.oppStart ?? 25);
    this.startPresnap();
  }

  // ---------------------------------------------------------------- kicks
  private startFieldGoal() {
    const dist_ = this.fgDistance;
    const p = clamp(0.97 - 0.0105 * Math.max(0, dist_ - 22), 0.3, 0.97);
    this.kick = { type: "fg", t: 0, dur: 1.7, good: this.rng() < p, x0: this.losX - 14, x1: GOAL_R + 52 };
    this.phase = "kick";
    this.clock = Math.max(0, this.clock - 6);
  }

  private startPunt() {
    const net = 36 + this.rng() * 16;
    this.kick = { type: "punt", t: 0, dur: 1.6, good: true, x0: this.losX - 14, x1: Math.min(GOAL_R + 48, this.losX + net * PX_PER_YD) };
    this.phase = "kick";
    this.clock = Math.max(0, this.clock - 8);
    this.puntNet = net;
  }
  private puntNet = 40;

  private finishKick() {
    const k = this.kick!;
    this.phase = "result";
    this.resultT = 1.7;
    if (k.type === "fg") {
      if (k.good) {
        this.score.user += 3;
        this.message = `FIELD GOAL IS GOOD! +3 (${Math.round(this.fgDistance)} YD)`;
        this.pending = { kind: "opp", oppStart: 25 };
      } else {
        this.message = `NO GOOD (${Math.round(this.fgDistance)} YD)`;
        this.pending = { kind: "opp", oppStart: clamp(100 - (this.yardLine - 7), 20, 99) };
      }
    } else {
      const landed = this.yardLine + this.puntNet;
      if (landed >= 100) {
        this.message = "PUNT: TOUCHBACK";
        this.pending = { kind: "opp", oppStart: 20 };
      } else {
        this.message = `PUNT: ${Math.round(this.puntNet)} YARDS`;
        this.pending = { kind: "opp", oppStart: clamp(Math.round(100 - landed), 1, 99) };
      }
    }
  }

  // ---------------------------------------------------------------- the other team's drive
  private startOppDrive(start: number) {
    this.oppDrive = simulateOppDrive(start, this.edge, this.rng, this.clock);
    this.clockBeforeOpp = this.clock;
    this.oppT = 0;
    this.phase = "opp";
  }

  private finishOppDrive() {
    const d = this.oppDrive!;
    this.score.opp += d.pts;
    this.clock = Math.max(0, this.clock - d.seconds);
    if (this.clock <= 0) return this.endHalf();
    this.yardLine = d.userStart;
    this.down = 1;
    this.toGo = Math.min(10, 100 - this.yardLine);
    this.startPresnap();
  }

  private endHalf() {
    this.clock = 0;
    this.setMove(0, 0);
    if (this.half === 1) {
      this.phase = "halftime";
    } else {
      this.phase = "final";
    }
  }

  private startSecondHalf() {
    this.half = 2;
    this.clock = HALF_SECONDS;
    this.yardLine = 25;
    this.down = 1;
    this.toGo = 10;
    this.startPresnap();
  }
}

/** Move a coordinate toward a target at a limited speed (for defenders sliding to stay with the quarterback). */
function lerpToward(v: number, target: number, speed: number, dt: number) {
  const d = target - v;
  return v + Math.sign(d) * Math.min(Math.abs(d), speed * dt);
}
