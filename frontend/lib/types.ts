// TypeScript mirror of backend/app/schemas.py. Keep the two in sync by hand.

export type Conference = "AFC" | "NFC";

export interface TeamRecord {
  wins: number;
  losses: number;
  ties: number;
}

export interface TeamOdds {
  team: string;
  name: string;
  conference: Conference;
  division: string;
  elo: number;
  record: TeamRecord;
  exp_wins: number;
  win_dist: number[]; // P(0..17 wins)
  p_division: number;
  p_playoffs: number;
  p_top_seed: number;
  p_conference: number;
  p_super_bowl: number;
  qb?: string | null; // projected starting quarterback
  qb_headshot?: string | null; // his photo
  qb_adj?: number; // Elo points the QB adds to (or takes from) the team rating
}

export interface SeasonResponse {
  season: number;
  n_sims: number;
  generated_at: string;
  games_played: number;
  games_total: number;
  teams: TeamOdds[];
  trade_effects?: TradeEffect[]; // on what-if responses that included trades
}

export interface GameView {
  game_id: string;
  week: number;
  opponent: string;
  home: boolean;
  neutral: boolean;
  played: boolean;
  p_win: number | null; // only for games not yet played
  result: "W" | "L" | "T" | null;
  team_score: number | null;
  opp_score: number | null;
}

export interface TeamDetail {
  season: number;
  odds: TeamOdds;
  seed_dist: number[]; // P(seed 1..7); the remainder is "missed playoffs"
  p_divisional_round: number;
  p_conference_round: number;
  games: GameView[];
}

export interface SimGameResult {
  game_id: string;
  week: number;
  home: string;
  away: string;
  home_win: boolean;
  played: boolean; // true = real result, false = decided by this simulation
}

export interface SimStanding {
  team: string;
  wins: number;
  losses: number;
  ties: number;
}

export interface SimulatedSeason {
  games: SimGameResult[];
  standings: SimStanding[];
  seeds: Record<Conference, string[]>; // 7 teams per conference, in seed order
  division_winners: string[];
}

export interface PlayoffGameResponse {
  home: string;
  away: string;
  p_home: number;
  winner: string | null; // null when only the odds were requested
  home_score?: number | null; // simulated final score (when the game was played); the winner always has more
  away_score?: number | null;
}

export interface Trade {
  player_id: string;
  from_team: string;
  to_team: string;
}

export interface TradeEffect {
  player_id: string;
  name: string;
  position: string;
  from_team: string;
  to_team: string;
  from_delta: number; // Elo change for the team that gave him up
  to_delta: number; // Elo change for the team that got him
}

export interface TradeCandidate {
  id: string;
  name: string;
  position: string;
  headshot: string | null;
  jersey: number | null;
  value: number; // estimated Elo value to his team
  note: string;
}

export interface WhatIfRequest {
  trades?: Trade[]; // players moved between teams
  rating_adjustments: Record<string, number>; // team -> Elo points added (negative = subtracted)
  game_overrides: { game_id: string; home_win: boolean }[]; // forced results for unplayed games
  n_sims: number;
}

export interface CalibrationBin {
  bin_low: number;
  bin_high: number;
  games: number;
  predicted: number; // average model P(home win) in this bucket
  actual: number; // share of those games the home team really won
}

export interface SeasonMetrics {
  season: number;
  games: number;
  brier: number;
  log_loss: number;
  accuracy: number;
}

export interface WinTotalError {
  season: number;
  mae: number; // average miss of preseason expected wins vs actual wins
  baseline_mae: number; // same, guessing the league average for every team
}

export interface ModelBacktest {
  config: Record<string, number>;
  games: number;
  brier: number;
  log_loss: number;
  accuracy: number;
  calibration: CalibrationBin[];
  by_season: SeasonMetrics[];
  win_total_error: WinTotalError[];
  hfa_by_season?: Record<string, number> | null; // home-field edge used each test season (rolling models)
}

export interface TuningResult {
  k: number;
  home_field: number;
  regression: number;
  train_brier: number;
}

export interface BacktestResponse {
  train_seasons: number[]; // [first, last]
  test_seasons: number[]; // [first, last]
  models: Record<string, ModelBacktest>;
  tuning_top10: TuningResult[];
  live?: { k: number; home_field: number; season_regression: number; qb?: Record<string, number> | null } | null;
}

export interface RosterPlayer {
  id: string;
  name: string;
  position: string; // QB RB WR TE OL DL LB DB K P LS
  jersey: number | null;
  status: string; // ACT, INA (inactive), RES (injured reserve)
  headshot: string | null;
  age: number | null;
  years_exp: number | null;
  gp: number; // games played so far
  proj_gp: number;
  avail: number; // chance he plays each remaining game
  avail_full?: number; // same, ignoring his injury status
  stats: Record<string, number>; // season totals so far
  proj: Record<string, number>; // projected final totals
  rates: Record<string, number>; // per-game rates behind the projection
}

export interface TeamRoster {
  team: string;
  season: number;
  generated_at: string;
  team_games_played: number;
  games_remaining: number;
  columns: Record<string, string[]>; // stat keys to show, by position
  players: RosterPlayer[];
}

export interface SimTeamGame {
  game_id: string;
  week: number;
  opponent: string;
  home: boolean;
  neutral: boolean;
  p_win: number;
  win: boolean;
  played?: boolean; // full-season mode: this game has really been played...
  actual_win?: boolean | null; // ...and this is how it really went
}

export interface SimTeamResult {
  team: string;
  games: SimTeamGame[];
  players: { id: string; gp: number; stats: Record<string, number> }[]; // final simulated totals
}

export interface LeaderRow {
  id: string;
  name: string;
  team: string;
  position: string;
  headshot: string | null;
  current: number; // season total so far
  projected: number; // projected final total
  p_lead: number; // chance he finishes first in the league
}

export interface AwardRow {
  id: string;
  name: string;
  team: string;
  position: string;
  headshot: string | null;
  rookie: boolean;
  prob: number; // chance he wins the award across the simulated seasons
  proj: Record<string, number>; // projected final stat line
}

export interface LeadersResponse {
  season: number;
  generated_at: string;
  n_sims: number;
  leaders: Record<string, LeaderRow[]>; // category -> top players by projected total
  awards: Record<string, AwardRow[]>; // mvp, opoty, dpoty, oroy, droy -> most likely winners
}

export interface SeedProb {
  team: string;
  prob: number;
}

export interface SeedSlot {
  seed: number; // 1-7
  teams: SeedProb[]; // most likely holders, best first
}

export interface BracketResponse {
  season: number;
  n_sims: number;
  conferences: { conference: Conference; slots: SeedSlot[] }[];
}

/** One drive of a played game (real play-by-play). `side` is the team the drive belongs to. */
export interface DriveEvent {
  side: "home" | "away";
  kind: "TD" | "FG" | "MISSED_FG" | "PUNT" | "INT" | "FUMBLE" | "DOWNS" | "SAFETY";
  pts: number;
  q: number; // quarter, 5 = overtime
  how?: "pick" | "fumble" | "return" | null;
}

export interface TeamDrives {
  games: Record<string, DriveEvent[]>;
}
