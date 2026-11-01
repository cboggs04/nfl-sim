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
}

export interface SeasonResponse {
  season: number;
  n_sims: number;
  generated_at: string;
  games_played: number;
  games_total: number;
  teams: TeamOdds[];
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
}

export interface WhatIfRequest {
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
}
