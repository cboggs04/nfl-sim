// Builds the sequence of drives shown in the Super Bowl animation.
// The model only decides who wins; everything here is for show, but it is constrained so the story is always consistent:
// the winner finishes strictly ahead, the teams trade possessions, and the winner scores last.

export type Kind = "TD" | "FG" | "PUNT";

export interface GameEvent {
  team: "W" | "L"; // W = the team the model picked to win, L = the other team
  kind: Kind;
  pts: number; // 0 for a punt
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

  // Trade scores, built from the end so the winner scores last; whoever runs out lets the other finish.
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
  const punts = order.length <= 3 ? 2 : 1;
  for (let i = 0; i < punts; i++) {
    const at = Math.floor(rand() * order.length); // insert before position `at` (so never after the last scoring drive)
    order.splice(at, 0, { team: rand() < 0.5 ? "W" : "L", kind: "PUNT", pts: 0 });
  }
  return order;
}

export const pointsFor = (events: GameEvent[], team: "W" | "L") => events.filter((e) => e.team === team).reduce((n, e) => n + e.pts, 0);
