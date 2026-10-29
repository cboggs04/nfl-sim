import info from "./teamInfo.json";

export interface TeamInfo {
  name: string;
  primary: string; // hex, e.g. "#97233F"
  secondary: string;
}

const table = info as Record<string, TeamInfo>;

/** Name and brand colors for a team abbreviation (falls back gracefully for unknown ones). */
export function teamInfo(abbr: string): TeamInfo {
  return table[abbr] ?? { name: abbr, primary: "#71717a", secondary: "#a1a1aa" };
}

export const logoSrc = (abbr: string) => `/logos/${abbr}.png`;
