// Labels and grouping for the roster tab. Which stats each position shows comes from the API (TeamRoster.columns).

export const STAT_LABELS: Record<string, { short: string; long: string }> = {
  completions: { short: "CMP", long: "Completions" },
  attempts: { short: "ATT", long: "Pass attempts" },
  passing_yards: { short: "PASS YDS", long: "Passing yards" },
  passing_tds: { short: "PASS TD", long: "Passing touchdowns" },
  passing_interceptions: { short: "INT", long: "Interceptions thrown" },
  carries: { short: "CAR", long: "Carries" },
  rushing_yards: { short: "RUSH YDS", long: "Rushing yards" },
  rushing_tds: { short: "RUSH TD", long: "Rushing touchdowns" },
  targets: { short: "TGT", long: "Targets" },
  receptions: { short: "REC", long: "Receptions" },
  receiving_yards: { short: "REC YDS", long: "Receiving yards" },
  receiving_tds: { short: "REC TD", long: "Receiving touchdowns" },
  tackles: { short: "TKL", long: "Tackles (solo + assisted)" },
  def_tackles_for_loss: { short: "TFL", long: "Tackles for loss" },
  def_sacks: { short: "SACK", long: "Sacks" },
  def_interceptions: { short: "INT", long: "Interceptions" },
  def_pass_defended: { short: "PD", long: "Passes defended" },
  fg_made: { short: "FGM", long: "Field goals made" },
  fg_att: { short: "FGA", long: "Field goals attempted" },
  pat_made: { short: "XPM", long: "Extra points made" },
  pat_att: { short: "XPA", long: "Extra points attempted" },
  pt_att: { short: "PUNTS", long: "Punts" },
  pt_yards: { short: "PUNT YDS", long: "Punt yards" },
  pt_inside_20: { short: "IN 20", long: "Punts inside the 20" },
};

export const POSITION_NAMES: Record<string, string> = {
  QB: "Quarterbacks",
  RB: "Running backs",
  WR: "Wide receivers",
  TE: "Tight ends",
  OL: "Offensive line",
  DL: "Defensive line",
  LB: "Linebackers",
  DB: "Defensive backs",
  K: "Kickers",
  P: "Punters",
  LS: "Long snappers",
};

export const UNITS = [
  { key: "Offense", positions: ["QB", "RB", "WR", "TE", "OL"] },
  { key: "Defense", positions: ["DL", "LB", "DB"] },
  { key: "Special teams", positions: ["K", "P", "LS"] },
] as const;

/** Stat used to order players within a position (most important first). */
export const MAIN_STAT: Record<string, string> = {
  QB: "passing_yards",
  RB: "rushing_yards",
  WR: "receiving_yards",
  TE: "receiving_yards",
  DL: "tackles",
  LB: "tackles",
  DB: "tackles",
  K: "fg_made",
  P: "pt_att",
};

/** Sacks and tackles for loss come in halves; everything else is whole numbers once projected. */
const DECIMAL_STATS = new Set(["def_sacks", "def_tackles_for_loss"]);

export function formatStat(stat: string, value: number): string {
  if (DECIMAL_STATS.has(stat)) return value.toFixed(1);
  return Math.round(value).toLocaleString("en-US");
}

/** The three stats that best summarize a player in an award card. */
export const SUMMARY_STATS: Record<string, string[]> = {
  QB: ["passing_yards", "passing_tds", "passing_interceptions"],
  RB: ["rushing_yards", "rushing_tds", "receiving_yards"],
  WR: ["receptions", "receiving_yards", "receiving_tds"],
  TE: ["receptions", "receiving_yards", "receiving_tds"],
  DL: ["tackles", "def_sacks", "def_interceptions"],
  LB: ["tackles", "def_sacks", "def_interceptions"],
  DB: ["tackles", "def_interceptions", "def_pass_defended"],
};
