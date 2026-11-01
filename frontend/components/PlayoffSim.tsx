"use client";

import { createContext, useContext, useState } from "react";
import { simulateSeason } from "@/lib/api";
import type { SimulatedSeason } from "@/lib/types";

interface PlayoffSimState {
  sim: SimulatedSeason | null; // the simulated rest of season: final records, seeds, division winners
  runs: number; // how many seasons simulated so far (changes whenever `sim` does)
  loading: boolean;
  error: string | null;
  newSeason: () => Promise<void>;
}

const Ctx = createContext<PlayoffSimState | null>(null);

/** One simulated season shared by the Standings and Bracket tabs: the standings are the bracket's regular season. */
export function PlayoffSimProvider({ children }: { children: React.ReactNode }) {
  const [sim, setSim] = useState<SimulatedSeason | null>(null);
  const [runs, setRuns] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function newSeason() {
    setLoading(true);
    setError(null);
    try {
      setSim(await simulateSeason());
      setRuns((n) => n + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return <Ctx.Provider value={{ sim, runs, loading, error, newSeason }}>{children}</Ctx.Provider>;
}

export function usePlayoffSim(): PlayoffSimState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("usePlayoffSim must be used inside <PlayoffSimProvider>");
  return ctx;
}
