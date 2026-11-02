import ResetOnLeave from "@/components/ResetOnLeave";
import { Suspense } from "react";
import CalibrationChart from "@/components/CalibrationChart";
import ColumnChart from "@/components/ColumnChart";
import { pct } from "@/components/ProbCell";
import { getBacktest } from "@/lib/api";

export const metadata = { title: "Model Accuracy · NFL Season Simulator" };

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="panel p-5">
      <div className="text-xs font-semibold tracking-widest text-muted uppercase">{label}</div>
      <div className="font-display mt-1 text-6xl text-strong">{value}</div>
      <p className="mt-2 text-sm text-muted">{note}</p>
    </div>
  );
}

const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

async function Backtest() {
  const bt = await getBacktest();
  const m = bt.models.qb ?? bt.models.tuned; // the model the simulator actually uses
  const ladder = [
    { key: "initial", label: "First-guess Elo", note: "Settings picked by hand" },
    { key: "tuned", label: "Tuned Elo", note: "Settings tuned on the training seasons" },
    { key: "recent_hfa", label: "+ Recent home-field edge", note: "Home-field edge re-fitted each year on the previous 6 seasons" },
    { key: "qb", label: "+ Quarterback ratings", note: "Adjusts each team for who is starting at QB" },
  ].filter((r) => bt.models[r.key]);
  const hfa = Object.entries(m.hfa_by_season ?? {});
  const maxHfa = Math.max(...hfa.map(([, v]) => v), 1);
  const [t0, t1] = bt.test_seasons;
  const [tr0, tr1] = bt.train_seasons;
  const wtMae = avg(m.win_total_error.map((w) => w.mae));
  const wtBase = avg(m.win_total_error.map((w) => w.baseline_mae));
  const maxMae = Math.max(...m.win_total_error.flatMap((w) => [w.mae, w.baseline_mae]));
  const outliers = m.calibration.filter((b) => b.games >= 50 && Math.abs(b.actual - b.predicted) > 0.06);
  const nGames = m.calibration.reduce((n, b) => n + b.games, 0);
  const meanPred = m.calibration.reduce((n, b) => n + b.predicted * b.games, 0) / nGames;
  const meanActual = m.calibration.reduce((n, b) => n + b.actual * b.games, 0) / nGames;
  const homeBias = meanPred - meanActual; // > 0: the model expected the home team to win more often than it did

  return (
    <>
      <p className="max-w-3xl text-sm text-muted">
        We tuned the model on {tr0}–{tr1} games, then graded it on {t0}–{t1}, seasons it never saw while tuning. Each prediction
        uses only information available before kickoff: the home-field edge for a season is chosen from the six seasons before
        it, and each quarterback&apos;s rating counts only the games he had already played.
      </p>

      <div className="mt-8 grid gap-4 md:grid-cols-3">
        <Stat
          label="Picked the winner"
          value={pct(m.accuracy)}
          note={`of ${m.games.toLocaleString("en-US")} games, versus 50% for a coin flip. Even the best NFL models land in the mid-60s: the sport has a lot of luck.`}
        />
        <Stat
          label="Brier score"
          value={m.brier.toFixed(4)}
          note="Average squared miss of the win probabilities. Lower is better; always guessing 50% scores 0.2500."
        />
        <Stat
          label="Preseason win-total miss"
          value={`${wtMae.toFixed(1)} wins`}
          note={`Average error of the preseason expected wins per team, versus ${wtBase.toFixed(1)} if we guessed the league average for everyone.`}
        />
      </div>

      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        <CalibrationChart bins={m.calibration} />
        <div className="flex flex-col gap-4">
          <section className="panel p-5">
            <h2 className="font-display text-3xl text-strong">What the chart says</h2>
            <ul className="mt-2 space-y-2 text-sm text-muted">
              <li>
                The dots track the dashed line closely, so the probabilities mean roughly what they say.{" "}
                {homeBias > 0.01
                  ? `Home teams won ${pct(meanActual)} of these games while the model expected ${pct(meanPred)}, so it slightly overrates home-field advantage in recent seasons.`
                  : `Overall, home teams won ${pct(meanActual)} of games and the model expected ${pct(meanPred)}.`}
              </li>
              {outliers.length > 0 ? (
                <li>
                  Where the dots stray from the line, the model was a little off:{" "}
                  {outliers.map((b) => `when it said ${pct(b.predicted)}, the home team won ${pct(b.actual)} (${b.games} games)`).join("; ")}.
                  Buckets this size still wiggle by luck, and a correction tuned on earlier seasons did not improve the score, so we left
                  the probabilities as they are.
                </li>
              ) : (
                <li>Every bucket with a meaningful number of games lands close to the line.</li>
              )}
            </ul>
          </section>
          <ColumnChart
            title="Accuracy by season"
            subtitle="Share of games where the model's favorite won"
            data={m.by_season.map((s) => ({ label: String(s.season), value: s.accuracy }))}
            xLabel="Season"
          />
        </div>
      </div>

      <section className="panel-flat mt-8 p-5">
        <h2 className="font-display text-3xl text-strong">Preseason win totals</h2>
        <p className="text-sm text-muted">
          Before each season, how far off was the model&apos;s expected wins for a typical team, compared with guessing 8.5 for everyone?
        </p>
        <ul className="mt-4 space-y-2">
          {m.win_total_error.map((w) => (
            <li key={w.season} className="grid grid-cols-[3rem_1fr_5.5rem] items-center gap-3 text-sm">
              <span className="font-display text-xl text-muted">{w.season}</span>
              <div className="space-y-1" role="img" aria-label={`${w.season}: model missed by ${w.mae.toFixed(2)} wins, baseline by ${w.baseline_mae.toFixed(2)}`}>
                <div className="h-2.5 rounded-r-sm bg-blue" style={{ width: `${(w.mae / maxMae) * 100}%` }} />
                <div className="h-2.5 rounded-r-sm bg-muted/50" style={{ width: `${(w.baseline_mae / maxMae) * 100}%` }} />
              </div>
              <span className="text-right tabular-nums">
                <b className="text-strong">{w.mae.toFixed(2)}</b> <span className="text-muted">vs {w.baseline_mae.toFixed(2)}</span>
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex gap-4 text-xs text-muted">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-4 rounded-sm bg-blue" /> Our model
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-4 rounded-sm bg-muted/50" /> Guess 8.5 for everyone
          </span>
        </div>
      </section>

      <section className="panel-flat mt-8 p-5">
        <h2 className="font-display text-3xl text-strong">How the model got better</h2>
        <p className="text-sm text-muted">
          Each step was added only if it improved the score on the test seasons. Lower Brier is better, and every change here is a
          small, real gain.
        </p>
        <div className="overflow-x-auto">
          <table className="mt-3 w-full text-sm md:min-w-[560px]">
            <thead className="text-xs tracking-widest text-muted uppercase">
              <tr>
                <th className="py-1 text-left font-medium">Model</th>
                <th className="py-1 text-right font-medium">Brier</th>
                <th className="py-1 text-right font-medium">Change</th>
                <th className="hidden py-1 text-right font-medium sm:table-cell">Picked winner</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/60">
              {ladder.map((r, i) => {
                const mm = bt.models[r.key];
                const prev = i > 0 ? bt.models[ladder[i - 1].key] : null;
                const d = prev ? mm.brier - prev.brier : 0;
                return (
                  <tr key={r.key}>
                    <td className="py-2">
                      <div className="font-semibold text-strong">{r.label}</div>
                      <div className="text-xs text-muted">{r.note}</div>
                    </td>
                    <td className="py-2 text-right text-base font-semibold tabular-nums">{mm.brier.toFixed(4)}</td>
                    <td className={`py-2 text-right tabular-nums ${d < 0 ? "text-good-ink" : "text-muted"}`}>
                      {prev ? `${d < 0 ? "▼" : "▲"} ${Math.abs(d).toFixed(4)}` : "—"}
                    </td>
                    <td className="hidden py-2 text-right tabular-nums sm:table-cell">{pct(mm.accuracy)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        {hfa.length > 0 && (
          <section className="panel-flat p-5">
            <h2 className="font-display text-3xl text-strong">Home-field edge is shrinking</h2>
            <p className="text-sm text-muted">
              Elo points the model gave the home team each season, re-fitted from the six seasons before it. In 2012–2017 it was about 55.
            </p>
            <ul className="mt-4 space-y-2">
              {hfa.map(([season, v]) => (
                <li key={season} className="grid grid-cols-[3rem_1fr_3rem] items-center gap-3 text-sm">
                  <span className="font-display text-xl text-muted">{season}</span>
                  <div className="h-2.5 rounded-r-sm bg-blue" style={{ width: `${(v / maxHfa) * 100}%` }} role="img" aria-label={`${season}: ${v} Elo points`} />
                  <span className="text-right font-semibold tabular-nums">{v}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-muted">
              Home teams have won less often in recent years (about 54% since 2021, versus 57% earlier), so the edge was trimmed
              to match. {bt.live ? `The live simulation uses ${bt.live.home_field}.` : ""}
            </p>
          </section>
        )}

        <section className="panel-flat p-5">
          <h2 className="font-display text-3xl text-strong">How quarterbacks are rated</h2>
          <ul className="mt-2 space-y-2 text-sm text-muted">
            <li>
              Every QB gets a rating from his <b className="text-strong">EPA per dropback</b>: how many points each pass play adds
              compared with an average play, counting sacks and scrambles.
            </li>
            <li>
              Small samples are pulled toward average, older seasons count less, and an unproven QB starts a bit below average.
            </li>
            <li>
              A team&apos;s Elo is raised or lowered by its starter&apos;s rating, so Josh Allen adds about +100 Elo and a rookie with no
              record takes a little off. Team Elo is then learned with that factored in, so it measures the rest of the roster.
            </li>
            <li>
              The starter comes from the schedule data (the coming week&apos;s listed QB). The What-if page can show a team without him.
            </li>
          </ul>
        </section>
      </div>

      <section className="panel-flat mt-8 p-5">
        <h2 className="font-display text-3xl text-strong">Did a fancier model help?</h2>
        <p className="text-sm text-muted">
          Earlier we also built ratings from EPA (expected points added per play) and blended them with Elo, compared with the
          Elo model before the changes above:
        </p>
        <table className="mt-3 w-full text-sm">
          <thead className="text-xs tracking-widest text-muted uppercase">
            <tr>
              <th className="py-1 text-left font-medium">Model</th>
              <th className="py-1 text-right font-medium">Brier (lower is better)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line/60">
            {[
              ["Tuned Elo", "0.2235"],
              ["EPA ratings only", "0.2239"],
              ["Elo + EPA blend", "0.2226"],
            ].map(([name, score]) => (
              <tr key={name}>
                <td className="py-1.5">{name}</td>
                <td className="py-1.5 text-right tabular-nums">{score}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-xs text-muted">
          Team-level EPA barely moved the score (about 0.001), while rating the quarterback specifically helped several times more.
          (Numbers from scripts/compare_models.py.)
        </p>
      </section>
    </>
  );
}

export default function BacktestPage() {
  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6">
      <ResetOnLeave>
        <h1 className="font-display text-5xl text-strong sm:text-8xl">
          Model <span className="text-accent-ink">Accuracy</span>
        </h1>
        <div className="mt-3">
          <Suspense fallback={<div className="h-96 animate-pulse bg-panel-2" aria-busy="true" />}>
            <Backtest />
          </Suspense>
        </div>
      </ResetOnLeave>
    </main>
  );
}
