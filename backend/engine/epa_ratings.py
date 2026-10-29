"""EPA-based team ratings. Pure Python + numpy, no web code.

Idea: instead of asking "who won, by how much?" (Elo), ask "how efficiently did
each team move the ball?". EPA (expected points added) scores every play by how
much it changed the team's expected points on that drive, so it filters out luck
like fumble bounces and garbage-time scores.

Each team carries two numbers, updated after every game as an exponentially
weighted moving average (recent games count more):
  offense  = EPA/play the team generates
  defense  = EPA/play the team allows (lower is better)
Strength = offense - defense. Between seasons both shrink toward the league
average (0) because rosters change.
"""
import numpy as np


class EpaRatings:
    def __init__(self, alpha: float = 0.15, season_regression: float = 1 / 3):
        self.alpha = alpha
        self.regression = season_regression
        self.off: dict[str, float] = {}
        self.dfn: dict[str, float] = {}

    def strength(self, team: str) -> float:
        return self.off.get(team, 0.0) - self.dfn.get(team, 0.0)

    def update(self, team: str, opp: str, team_epa: float, opp_epa: float):
        """One game: `team` averaged team_epa/play on offense and allowed opp_epa/play."""
        a = self.alpha
        self.off[team] = (1 - a) * self.off.get(team, 0.0) + a * team_epa
        self.dfn[team] = (1 - a) * self.dfn.get(team, 0.0) + a * opp_epa

    def new_season(self):
        for d in (self.off, self.dfn):
            for t in d:
                d[t] *= 1 - self.regression


def fit_logistic(X: np.ndarray, y: np.ndarray, l2: float = 1e-3, iters: int = 50) -> np.ndarray:
    """Logistic regression by Newton's method (small enough to do by hand, so no sklearn)."""
    w = np.zeros(X.shape[1])
    for _ in range(iters):
        p = 1 / (1 + np.exp(-X @ w))
        grad = X.T @ (p - y) + l2 * w
        hess = (X * (p * (1 - p))[:, None]).T @ X + l2 * np.eye(X.shape[1])
        step = np.linalg.solve(hess, grad)
        w -= step
        if np.abs(step).max() < 1e-8:
            break
    return w


def predict(X: np.ndarray, w: np.ndarray) -> np.ndarray:
    return 1 / (1 + np.exp(-X @ w))
