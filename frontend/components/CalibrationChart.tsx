"use client";

import { useState } from "react";
import { CartesianGrid, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from "recharts";
import { pct } from "@/components/ProbCell";
import type { CalibrationBin } from "@/lib/types";

function ChartTooltip({ active, payload }: { active?: boolean; payload?: { payload: CalibrationBin }[] }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-md border border-line bg-panel px-3 py-2 text-xs shadow-lg shadow-black/50">
      <div className="text-muted">
        Model said {pct(d.predicted)} · {d.games.toLocaleString("en-US")} games
      </div>
      <div className="text-base font-semibold tabular-nums">Home team won {pct(d.actual)}</div>
    </div>
  );
}

/**
 * Calibration: when the model says "70%", does the home team win about 70% of the time?
 * Points on the dashed diagonal mean the probabilities can be trusted. Bigger dots = more games.
 */
export default function CalibrationChart({ bins }: { bins: CalibrationBin[] }) {
  const [view, setView] = useState<"chart" | "table">("chart");
  const tick = (v: number) => `${Math.round(v * 100)}%`;
  return (
    <section className="panel-flat p-5">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-3xl text-strong">Calibration</h2>
          <p className="text-sm text-muted">When the model says 70%, how often does the home team really win?</p>
        </div>
        <div className="flex shrink-0 overflow-hidden rounded-md border border-line text-xs" role="group" aria-label="View">
          {(["chart", "table"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              aria-pressed={view === v}
              className={`px-2.5 py-1 capitalize ${view === v ? "bg-accent font-semibold text-on-accent" : "text-muted hover:bg-hover"}`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>
      {view === "chart" ? (
        <div className="relative h-96 pl-6" role="img" aria-label="Calibration chart: predicted home win probability against actual home win rate. Points near the diagonal mean well-calibrated.">
          <div className="absolute inset-y-0 left-0 flex items-center pb-8" aria-hidden>
            <span className="text-xs text-chart" style={{ writingMode: "vertical-rl", transform: "rotate(180deg)", color: "var(--chart-text)" }}>
              What actually happened
            </span>
          </div>
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 10, right: 16, bottom: 30, left: 0 }}>
              <CartesianGrid stroke="var(--chart-grid)" />
              <XAxis
                type="number"
                dataKey="predicted"
                domain={[0, 1]}
                ticks={[0, 0.2, 0.4, 0.6, 0.8, 1]}
                tickFormatter={tick}
                tick={{ fill: "var(--chart-text)", fontSize: 12 }}
                axisLine={false}
                tickLine={false}
                label={{ value: "What the model said (chance the home team wins)", position: "insideBottom", offset: -18, fill: "var(--chart-text)", fontSize: 12 }}
              />
              <YAxis
                type="number"
                dataKey="actual"
                domain={[0, 1]}
                ticks={[0, 0.2, 0.4, 0.6, 0.8, 1]}
                tickFormatter={tick}
                tick={{ fill: "var(--chart-text)", fontSize: 12 }}
                axisLine={false}
                tickLine={false}
                width={44}
              />
              <ZAxis dataKey="games" range={[70, 420]} />
              <ReferenceLine
                segment={[
                  { x: 0, y: 0 },
                  { x: 1, y: 1 },
                ]}
                stroke="var(--chart-text)"
                strokeDasharray="6 5"
                strokeWidth={1.5}
                label={{ value: "Perfect", position: "insideTopLeft", fill: "var(--chart-text)", fontSize: 12 }}
              />
              <Tooltip content={<ChartTooltip />} cursor={{ strokeDasharray: "3 3", stroke: "var(--chart-grid)" }} />
              <Scatter
                data={bins}
                fill="var(--chart-bar)"
                stroke="var(--panel)"
                strokeWidth={2}
                line={{ stroke: "var(--chart-bar)", strokeWidth: 2 }}
                lineType="joint"
                isAnimationActive={false}
              />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="max-h-96 overflow-auto">
          <table className="w-full text-sm">
            <thead className="text-xs tracking-widest text-muted uppercase">
              <tr>
                <th className="py-1 text-left font-medium">Model said</th>
                <th className="py-1 text-right font-medium">Games</th>
                <th className="py-1 text-right font-medium">Avg. predicted</th>
                <th className="py-1 text-right font-medium">Actual home wins</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/60">
              {bins.map((b) => (
                <tr key={b.bin_low}>
                  <td className="py-1.5">
                    {Math.round(b.bin_low * 100)}–{Math.round(b.bin_high * 100)}%
                  </td>
                  <td className="py-1.5 text-right tabular-nums">{b.games.toLocaleString("en-US")}</td>
                  <td className="py-1.5 text-right tabular-nums">{pct(b.predicted)}</td>
                  <td className="py-1.5 text-right font-semibold tabular-nums">{pct(b.actual)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
