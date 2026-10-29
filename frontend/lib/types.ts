// TypeScript mirror of backend/app/schemas.py. Keep the two in sync by hand.

export type Conference = "AFC" | "NFC";

export interface Record {
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
  record: Record;
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
