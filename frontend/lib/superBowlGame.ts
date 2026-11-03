// Builds the sequence of drives shown in the Super Bowl animation.
// The model only decides who wins; everything here is for show, but it is constrained so the story is always consistent:
// the winner finishes strictly ahead, the teams trade possessions, and the winner scores last.

export type Kind = "TD" | "FG" | "PUNT" | "MISSED_FG" | "INT" | "FUMBLE" | "DOWNS" | "SAFETY";

export interface GameEvent {
  team: "W" | "L"; // W = the team the model picked to win, L = the other team
  kind: Kind;
  pts: number; // 0 for a punt or a turnover
  q?: number; // quarter (5 = overtime); only for real games
  how?: "pick" | "fumble" | "return"; // a defensive touchdown (pick six, fumble return, punt/kick return)
}

const touchdownPoints = (rand: () => number) => {
  const r = rand();
  return r < 0.1 ? 6 : r < 0.2 ? 8 : 7; // usually 7; sometimes a missed extra point (6) or a two-point try (8)
};

const scoringPlay = (rand: () => number): GameEvent["kind"] & ("TD" | "FG") => (rand() < 0.7 ? "TD" : "FG");

/** The drives of one game, in order. Always: winner's points > loser's points, and the last scoring drive is the winner's. */
export function makeGame(rand: () => number = Math.random): GameEvent[] {
  let winners: GameEvent[] = [];
  let losers: GameEvent[] = [];
  const total = (xs: GameEvent[]) => xs.reduce((n, e) => n + e.pts, 0);
  const side = (team: "W" | "L", n: number) =>
    Array.from({ length: n }, (): GameEvent => {
      const kind = scoringPlay(rand);
      return { team, kind, pts: kind === "TD" ? touchdownPoints(rand) : 3 };
    });

  // Draw random scoring until the winner is ahead by a believable margin (1 to 17 points).
  for (let attempt = 0; attempt < 200; attempt++) {
    winners = side("W", 2 + (rand() < 0.5 ? 1 : 0)); // 2-3 scores
    losers = side("L", 1 + (rand() < 0.55 ? 1 : 0)); // 1-2 scores
    const margin = total(winners) - total(losers);
    if (margin >= 1 && margin <= 17) break;
    if (attempt === 199) {
      winners = [{ team: "W", kind: "TD", pts: 7 }, { team: "W", kind: "TD", pts: 7 }, { team: "W", kind: "FG", pts: 3 }];
      losers = [{ team: "L", kind: "TD", pts: 7 }, { team: "L", kind: "FG", pts: 3 }];
    }
  }

  return arrange(winners, losers, rand);
}

/** Trade the scores back and forth (built from the end so the winner scores last), then add a punt or two. */
function arrange(winners: GameEvent[], losers: GameEvent[], rand: () => number): GameEvent[] {
  const order: GameEvent[] = [];
  let takeWinner = true;
  const w = [...winners];
  const l = [...losers];
  while (w.length + l.length > 0) {
    const next = (takeWinner && w.length > 0) || l.length === 0 ? w.pop()! : l.pop()!;
    order.push(next);
    takeWinner = !takeWinner;
  }
  order.reverse();

  // A punt or two (a drive that stalls), never as the final drive.
  const punts = order.length <= 3 ? 2 : order.length >= 8 ? 0 : 1;
  for (let i = 0; i < punts; i++) {
    const at = Math.floor(rand() * order.length); // insert before position `at` (so never after the last scoring drive)
    order.splice(at, 0, { team: rand() < 0.5 ? "W" : "L", kind: "PUNT", pts: 0 });
  }
  return order;
}

/**
 * Break a team's final points into drives: touchdowns (usually 7; sometimes 6 after a missed extra point or 8 after a
 * two-point try) and field goals (3). Fewer drives are preferred. Scores of 1, 2, 4 and 5 can't be built this way, so the
 * server never produces them (engine/scores.py); if one slips through it is shown as the nearest score that can be built.
 */
export function decompose(points: number, rand: () => number = Math.random): { kind: "TD" | "FG"; pts: number }[] {
  if (points <= 0) return [];
  type Option = { td: number; fg: number; adj: number; weight: number };
  const options: Option[] = [];
  for (let td = 0; td <= 7; td++) {
    for (let fg = 0; fg <= 6; fg++) {
      for (const adj of td > 0 ? [0, -1, 1] : [0]) {
        if (7 * td + adj + 3 * fg === points) options.push({ td, fg, adj, weight: adj === 0 ? 3 : 1 });
      }
    }
  }
  if (options.length === 0) return decompose(points + 1, rand);
  const fewest = Math.min(...options.map((o) => o.td + o.fg));
  for (const o of options) {
    const extra = o.td + o.fg - fewest; // drives beyond the simplest way to make this score
    o.weight *= extra === 0 ? 10 : extra === 1 ? 1 : 0.03;
    if (o.fg > 3) o.weight *= 0.1; // a team rarely kicks four field goals
  }
  let r = rand() * options.reduce((n, o) => n + o.weight, 0);
  const pick = options.find((o) => (r -= o.weight) <= 0) ?? options[0];
  const plays: { kind: "TD" | "FG"; pts: number }[] = [];
  for (let i = 0; i < pick.td; i++) plays.push({ kind: "TD", pts: i === 0 ? 7 + pick.adj : 7 }); // the odd 6 or 8 on one touchdown
  for (let i = 0; i < pick.fg; i++) plays.push({ kind: "FG", pts: 3 });
  return plays;
}

/** The drives for a game that ended with the given scores (from the model's simulated score). */
export function gameFromScore(winnerPoints: number, loserPoints: number, rand: () => number = Math.random): GameEvent[] {
  const mk = (team: "W" | "L", points: number): GameEvent[] => decompose(points, rand).map((p) => ({ team, ...p }));
  return arrange(mk("W", winnerPoints), mk("L", loserPoints), rand);
}


/** Real drives of a played game (from the API) as animation events. The home team is "W" unless the away team won. */
export function eventsFromDrives(drives: { side: "home" | "away"; kind: Kind; pts: number; q: number; how?: GameEvent["how"] | null }[], homeWon: boolean): GameEvent[] {
  return drives.map((d) => ({ team: (d.side === "home") === homeWon ? "W" : "L", kind: d.kind, pts: d.pts, q: d.q, ...(d.how ? { how: d.how } : {}) }));
}

export const pointsFor = (events: GameEvent[], team: "W" | "L") => events.filter((e) => e.team === team).reduce((n, e) => n + e.pts, 0);
