// The ONLY place the frontend talks to the backend. Components import from here.
import type { PlayoffGameResponse, SeasonResponse, SimulatedSeason, TeamDetail, WhatIfRequest } from "./types";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
// Set NEXT_PUBLIC_USE_MOCK=1 to build the UI without the API running.
const USE_MOCK = process.env.NEXT_PUBLIC_USE_MOCK === "1";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`API ${path} failed with status ${res.status}`);
  return res.json() as Promise<T>;
}

// Mock files are imported lazily so they never end up in the browser bundle.
export async function getSeason(): Promise<SeasonResponse> {
  if (USE_MOCK) return (await import("./mock/season.json")).default as unknown as SeasonResponse;
  return get<SeasonResponse>("/api/season");
}

/** Returns null if the team abbreviation doesn't exist. */
export async function getTeam(abbr: string): Promise<TeamDetail | null> {
  if (USE_MOCK) {
    const teams = (await import("./mock/teams.json")).default as unknown as Record<string, TeamDetail>;
    return teams[abbr.toUpperCase()] ?? null;
  }
  const res = await fetch(`${BASE}/api/teams/${encodeURIComponent(abbr)}`, { cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`API /api/teams/${abbr} failed with status ${res.status}`);
  return res.json() as Promise<TeamDetail>;
}

async function post<T>(path: string, body?: unknown): Promise<T> {
  if (USE_MOCK) throw new Error("This feature needs the API running (turn off NEXT_PUBLIC_USE_MOCK).");
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API ${path} failed with status ${res.status}`);
  return res.json() as Promise<T>;
}

/** Randomly play out the rest of the regular season once; returns final records and playoff seeds. */
export const simulateSeason = () => post<SimulatedSeason>("/api/sim/season");

/** Roll one playoff game. With play=false it only returns the win probability. */
export const rollGame = (home: string, away: string, neutral: boolean, play = true) =>
  post<PlayoffGameResponse>("/api/sim/game", { home, away, neutral, play });

/** Re-run the season simulation with changed team ratings and/or forced game results (~1 second). */
export const runWhatIf = (req: WhatIfRequest) => post<SeasonResponse>("/api/whatif", req);
