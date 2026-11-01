"use client";

import { useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { pct } from "@/components/ProbCell";

export interface Datum {
  label: string;
  value: number; // probability 0..1
}

function ChartTooltip({ active, payload, valueName }: { active?: boolean; payload?: { payload: Datum }[]; valueName: string }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-md border border-line bg-panel px-3 py-2 text-xs shadow-lg shadow-black/50">
      <div className="text-base font-semibold tabular-nums">{(d.value * 100).toFixed(1)}%</div>
      <div className="text-muted">
        {valueName}: {d.label}
      </div>
    </div>
  );
}

/**
 * A single-series column chart of probabilities, with a table view for the same data.
 * Only the tallest column carries a value label; the axis, tooltip and table carry the rest.
 */
export default function ColumnChart({
  title,
  subtitle,
  data,
  xLabel,
}: {
  title: string;
  subtitle: string;
  data: Datum[];
  xLabel: string;
}) {
  const [view, setView] = useState<"chart" | "table">("chart");
  const peak = data.reduce((best, d, i) => (d.value > data[best].value ? i : best), 0);
  const max = Math.max(...data.map((d) => d.value), 0.01);

  return (
    <section className="panel-flat p-5">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-3xl text-strong">{title}</h2>
          <p className="text-sm text-muted">{subtitle}</p>
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
        <div className="h-60" role="img" aria-label={`${title}. Most likely: ${data[peak].label} at ${pct(data[peak].value)}.`}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 18, right: 4, bottom: 0, left: -12 }} barCategoryGap={4}>
              <CartesianGrid vertical={false} stroke="var(--chart-grid)" strokeWidth={1} />
              <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "var(--chart-text)", fontSize: 12 }} interval={0} />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fill: "var(--chart-text)", fontSize: 12 }}
                tickFormatter={(v: number) => `${Math.round(v * 100)}%`}
                domain={[0, max * 1.15]}
                tickCount={5}
              />
              <Tooltip
                cursor={{ fill: "var(--chart-grid)", fillOpacity: 0.5 }}
                content={<ChartTooltip valueName={xLabel} />}
              />
              <Bar
                dataKey="value"
                fill="var(--chart-bar)"
                maxBarSize={28}
                radius={[4, 4, 0, 0]}
                activeBar={{ fill: "var(--chart-bar-hover)" }}
                isAnimationActive={false}
                label={({ x, y, width, index }: { x?: string | number; y?: string | number; width?: string | number; index?: number }) =>
                  index === peak ? (
                    <text x={Number(x) + Number(width) / 2} y={Number(y) - 6} textAnchor="middle" fontSize={12} fontWeight={600} fill="var(--foreground)">
                      {pct(data[peak].value)}
                    </text>
                  ) : (
                    <g />
                  )
                }
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="max-h-60 overflow-auto">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase text-muted">
              <tr>
                <th className="py-1 text-left font-medium">{xLabel}</th>
                <th className="py-1 text-right font-medium">Probability</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/60">
              {data.map((d) => (
                <tr key={d.label}>
                  <td className="py-1">{d.label}</td>
                  <td className="py-1 text-right tabular-nums">{(d.value * 100).toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
