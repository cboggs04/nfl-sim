"""Every JSON shape the API returns or accepts. The frontend's TypeScript types mirror these."""
from typing import Literal

from pydantic import BaseModel, Field


class Record(BaseModel):
    wins: int
    losses: int
    ties: int


class TeamOdds(BaseModel):
    """One row of the season dashboard."""
    team: str                       # abbreviation, e.g. "SEA"
    name: str                       # "Seattle Seahawks"
    conference: Literal["AFC", "NFC"]
    division: str                   # "NFC West"
    elo: float
    record: Record                  # games already played
    exp_wins: float
    win_dist: list[float]           # P(finishing with 0..17 wins); length 18
    p_division: float
    p_playoffs: float
    p_top_seed: float               # the 1 seed (first-round bye)
    p_conference: float             # wins the conference title (reaches the Super Bowl)
    p_super_bowl: float             # wins the Super Bowl
    qb: str | None = None           # projected starting quarterback
    qb_adj: float = 0.0             # Elo points the QB adds to (or takes from) the team's rating


class SeasonResponse(BaseModel):
    """GET /api/season (also the response of POST /api/whatif)."""
    season: int
    n_sims: int
    generated_at: str               # ISO timestamp
    games_played: int
    games_total: int
    teams: list[TeamOdds]


class GameView(BaseModel):
    """One game on a team's schedule, from that team's point of view."""
    game_id: str
    week: int
    opponent: str
    home: bool                      # False = road game (or neutral site, see `neutral`)
    neutral: bool
    played: bool
    p_win: float | None             # win probability for unplayed games
    result: Literal["W", "L", "T"] | None
    team_score: int | None
    opp_score: int | None


class TeamDetail(BaseModel):
    """GET /api/teams/{abbr}."""
    season: int
    odds: TeamOdds
    seed_dist: list[float]          # P(finishing as seed 1..7); the rest is "missed playoffs"
    p_divisional_round: float
    p_conference_round: float
    games: list[GameView]


class SeedProb(BaseModel):
    team: str
    prob: float


class SeedSlot(BaseModel):
    seed: int                       # 1..7
    teams: list[SeedProb]           # who could hold this seed, most likely first (prob >= 1%)


class BracketConference(BaseModel):
    conference: Literal["AFC", "NFC"]
    slots: list[SeedSlot]


class TeamAdvancement(BaseModel):
    """Chance of surviving each playoff round."""
    team: str
    conference: Literal["AFC", "NFC"]
    p_playoffs: float
    p_divisional_round: float       # reaches round 2 (includes the 1-seed bye)
    p_conference_round: float
    p_super_bowl_round: float
    p_champion: float


class BracketResponse(BaseModel):
    """GET /api/bracket."""
    season: int
    n_sims: int
    conferences: list[BracketConference]
    advancement: list[TeamAdvancement]


class GameOverride(BaseModel):
    game_id: str
    home_win: bool


class WhatIfRequest(BaseModel):
    """POST /api/whatif: tweak the world, rerun a small live simulation."""
    rating_adjustments: dict[str, float] = {}   # team -> Elo points to add (negative = subtract)
    game_overrides: list[GameOverride] = []     # force specific unplayed games
    n_sims: int = Field(2000, ge=200, le=5000)


class CalibrationBin(BaseModel):
    bin_low: float
    bin_high: float
    games: int
    predicted: float
    actual: float


class SeasonMetrics(BaseModel):
    season: int
    games: int
    brier: float
    log_loss: float
    accuracy: float


class WinTotalError(BaseModel):
    season: int
    mae: float                      # avg miss of preseason expected wins vs. actual wins
    baseline_mae: float             # same, if we guessed half the games for every team


class ModelBacktest(BaseModel):
    config: dict[str, float]
    games: int
    brier: float
    log_loss: float
    accuracy: float
    calibration: list[CalibrationBin]
    by_season: list[SeasonMetrics]
    win_total_error: list[WinTotalError]
    hfa_by_season: dict[str, float] | None = None   # home-field edge used in each test season (rolling models)


class TuningResult(BaseModel):
    k: float
    home_field: float
    regression: float
    train_brier: float


class LiveConfig(BaseModel):
    """The settings the live simulation uses (chosen by the backtest)."""
    k: float
    home_field: float
    season_regression: float
    qb: dict[str, float] | None = None


class BacktestResponse(BaseModel):
    """GET /api/backtest."""
    train_seasons: list[int]
    test_seasons: list[int]
    models: dict[str, ModelBacktest]
    tuning_top10: list[TuningResult]
    live: LiveConfig | None = None


# ---- Interactive simulation (live endpoints) ----

class SimGameResult(BaseModel):
    game_id: str
    week: int
    home: str
    away: str
    home_win: bool
    played: bool                    # True = real result, False = decided by this simulation


class SimStanding(BaseModel):
    team: str
    wins: int
    losses: int
    ties: int


class SimulatedSeason(BaseModel):
    """POST /api/sim/season: one randomly played-out season."""
    games: list[SimGameResult]
    standings: list[SimStanding]
    seeds: dict[str, list[str]]     # "AFC"/"NFC" -> 7 teams in seed order
    division_winners: list[str]


class PlayoffGameRequest(BaseModel):
    """POST /api/sim/game: roll one playoff game (or just ask for its odds with play=false)."""
    home: str
    away: str
    neutral: bool = False
    play: bool = True


class PlayoffGameResponse(BaseModel):
    home: str
    away: str
    p_home: float
    winner: str | None              # None when play=false


# ---- Saved simulation inputs (written by precompute, read by live endpoints) ----

class StateGame(BaseModel):
    game_id: str
    week: int
    home_team: str
    away_team: str
    neutral: bool
    result: int | None              # home margin if played, else None


class SimState(BaseModel):
    season: int
    config: dict[str, float]        # Elo settings: k, home_field, season_regression
    ratings: dict[str, float]
    games: list[StateGame]
