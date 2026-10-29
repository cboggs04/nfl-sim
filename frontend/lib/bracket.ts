// The SHAPE of the NFL playoff bracket: who plays whom each round.
// (Win probabilities and results always come from the API; this only wires up the matchups.)
import type { Conference } from "./types";

export type Round = "WC" | "DIV" | "CONF" | "SB";

export interface Matchup {
  id: string;
  round: Round;
  home: string | null; // null until the earlier round decides it
  away: string | null;
  neutral: boolean;
}

export interface ConferenceBracket {
  wc: Matchup[]; // 2v7, 3v6, 4v5
  div: Matchup[]; // 1 seed vs lowest survivor, other two survivors
  conf: Matchup;
}

export interface Bracket {
  AFC: ConferenceBracket;
  NFC: ConferenceBracket;
  sb: Matchup;
}

const empty = (id: string, round: Round, neutral = false): Matchup => ({ id, round, home: null, away: null, neutral });

function buildConference(conf: Conference, seeds: string[], winners: Record<string, string>): ConferenceBracket {
  const rank = (t: string) => seeds.indexOf(t);
  const bySeed = (teams: string[]) => [...teams].sort((a, b) => rank(a) - rank(b));

  const wc = [[1, 6], [2, 5], [3, 4]].map(([h, a], i) => ({
    ...empty(`${conf}-WC-${i}`, "WC"),
    home: seeds[h],
    away: seeds[a],
  }));

  const div = [empty(`${conf}-DIV-0`, "DIV"), empty(`${conf}-DIV-1`, "DIV")];
  const wcWinners = wc.map((m) => winners[m.id]);
  if (wcWinners.every(Boolean)) {
    // The NFL reseeds: the 1 seed always hosts the lowest remaining seed.
    const alive = bySeed([seeds[0], ...wcWinners]);
    [div[0].home, div[0].away] = [alive[0], alive[3]];
    [div[1].home, div[1].away] = [alive[1], alive[2]];
  }

  const confGame = empty(`${conf}-CONF`, "CONF");
  const divWinners = div.map((m) => winners[m.id]);
  if (divWinners.every(Boolean)) {
    const [h, a] = bySeed(divWinners);
    confGame.home = h;
    confGame.away = a;
  }
  return { wc, div, conf: confGame };
}

/** Build the whole bracket from the seeds and the winners decided so far (matchup id -> team). */
export function buildBracket(seeds: Record<Conference, string[]>, winners: Record<string, string>): Bracket {
  const AFC = buildConference("AFC", seeds.AFC, winners);
  const NFC = buildConference("NFC", seeds.NFC, winners);
  const sb = empty("SB", "SB", true); // Super Bowl is at a neutral site
  if (winners[AFC.conf.id] && winners[NFC.conf.id]) {
    sb.home = winners[AFC.conf.id];
    sb.away = winners[NFC.conf.id];
  }
  return { AFC, NFC, sb };
}

export function allMatchups(b: Bracket): Matchup[] {
  return [...b.AFC.wc, ...b.AFC.div, b.AFC.conf, ...b.NFC.wc, ...b.NFC.div, b.NFC.conf, b.sb];
}

/** Games whose two teams are known but that haven't been played yet. */
export function readyMatchups(b: Bracket, winners: Record<string, string>): Matchup[] {
  return allMatchups(b).filter((m) => m.home && m.away && !winners[m.id]);
}
