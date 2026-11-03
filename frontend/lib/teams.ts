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

export type Jersey = "home" | "away" | "alt";
export const JERSEYS: { id: Jersey; label: string }[] = [
  { id: "home", label: "Home" },
  { id: "away", label: "Away" },
  { id: "alt", label: "Alt" },
];

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const luminance = (hex: string) => {
  const [r, g, b] = rgb(hex);
  return 0.299 * r + 0.587 * g + 0.114 * b;
};
export const colorDistance = (a: string, b: string) => {
  const [r1, g1, b1] = rgb(a);
  const [r2, g2, b2] = rgb(b);
  return Math.hypot(r1 - r2, g1 - g2, b1 - b2);
};

/**
 * The colors a team wears: `primary` is the jersey and helmet, `secondary` the pants and numbers.
 * Home is the team's own colors, away is white, and the alternate flips to the second color (or black when that one is light).
 */
export function jerseyColors(abbr: string, jersey: Jersey): { primary: string; secondary: string } {
  const t = teamInfo(abbr);
  if (jersey === "away") return { primary: "#f1f5f9", secondary: t.primary };
  if (jersey === "alt") {
    return luminance(t.secondary) > 170 || colorDistance(t.primary, t.secondary) < 60
      ? { primary: "#1f2937", secondary: luminance(t.secondary) > 120 ? t.secondary : t.primary }
      : { primary: t.secondary, secondary: t.primary };
  }
  return { primary: t.primary, secondary: t.secondary };
}
