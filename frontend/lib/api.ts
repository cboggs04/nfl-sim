// The ONLY place the frontend talks to the backend. Components import from here.
import mockSeason from "./mock/season.json";
import type { SeasonResponse } from "./types";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
// Set NEXT_PUBLIC_USE_MOCK=1 to build the UI without the API running.
const USE_MOCK = process.env.NEXT_PUBLIC_USE_MOCK === "1";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`API ${path} failed with status ${res.status}`);
  return res.json() as Promise<T>;
}

export function getSeason(): Promise<SeasonResponse> {
  if (USE_MOCK) return Promise.resolve(mockSeason as unknown as SeasonResponse);
  return get<SeasonResponse>("/api/season");
}
