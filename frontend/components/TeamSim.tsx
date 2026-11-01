"use client";

import { createContext, useContext, useState } from "react";
import { simulateTeam } from "@/lib/api";
import type { SimTeamResult } from "@/lib/types";

interface TeamSimState {
  team: string;
  sim: SimTeamResult | null; // the latest simulated rest of season (game results + every player's stats)
  loading: boolean;
  error: string | null;
  runs: number;
  history: number[]; // wins from the remaining games in each run so far, newest first
  run: () => Promise<void>;
}

const Ctx = createContext<TeamSimState | null>(null);

/**
 * Shared by the Overview and Roster tabs: one "simulate a season" button plays out the team's remaining games
 * and the players' stats together, and both tabs show the same result.
 */
export function TeamSimProvider({ team, children }: { team: string; children: React.ReactNode }) {
  const [sim, setSim] = useState<SimTeamResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [runs, setRuns] = useState(0);
  const [history, setHistory] = useState<number[]>([]);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const result = await simulateTeam(team);
      setSim(result);
      setRuns((n) => n + 1);
      setHistory((h) => [result.games.filter((g) => g.win).length, ...h].slice(0, 8));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return <Ctx.Provider value={{ team, sim, loading, error, runs, history, run }}>{children}</Ctx.Provider>;
}

export function useTeamSim(): TeamSimState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useTeamSim must be used inside <TeamSimProvider>");
  return ctx;
}
