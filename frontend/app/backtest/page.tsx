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
  const m = bt.models.tuned;
  const init = bt.models.initial;
  const [t0, t1] = bt.test_seasons;
  const [tr0, tr1] = bt.train_seasons;
  const wtMae = avg(m.win_total_error.map((w) => w.mae));
  const wtBase = avg(m.win_total_error.map((w) => w.baseline_mae));
  const maxMae = Math.max(...m.win_total_error.flatMap((w) => [w.mae, w.baseline_mae]));
  const first = m.calibration[0];
  const last = m.calibration[m.calibration.length - 1];
  const nGames = m.calibration.reduce((n, b) => n + b.games, 0);
  const meanPred = m.calibration.reduce((n, b) => n + b.predicted * b.games, 0) / nGames;
  const meanActual = m.calibration.reduce((n, b) => n + b.actual * b.games, 0) / nGames;
  const homeBias = meanPred - meanActual; // > 0: the model expected the home team to win more often than it did

  return (
    <>
      <p className="max-w-3xl text-sm text-muted">
        We tuned the model on {tr0}–{tr1} games, then graded it on {t0}–{t1}, seasons it never saw while tuning. Each prediction
        uses only information available before kickoff.
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
              <li>
                The outermost dots rest on very few games ({first.games} and {last.games}), so they wiggle by luck. The one at{" "}
                {pct(first.predicted)} came in at {pct(first.actual)}, but a gap that size is well within chance for that few games.
                We checked: stretching or shrinking all the probabilities does not improve the score, so there is no sign the model is
                systematically over- or under-confident.
              </li>
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

      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        <section className="panel-flat p-5">
          <h2 className="font-display text-3xl text-strong">Tuning the model</h2>
          <p className="text-sm text-muted">
            We tried 150 combinations of three settings on {tr0}–{tr1} and kept the best.
          </p>
          <table className="mt-3 w-full text-sm">
            <thead className="text-xs tracking-widest text-muted uppercase">
              <tr>
                <th className="py-1 text-left font-medium">Setting</th>
                <th className="py-1 text-right font-medium">First guess</th>
                <th className="py-1 text-right font-medium">Tuned</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/60">
              <tr>
                <td className="py-1.5" title="How fast ratings move after each game">
                  K (how fast ratings move)
                </td>
                <td className="py-1.5 text-right tabular-nums">{init.config.k}</td>
                <td className="py-1.5 text-right font-semibold tabular-nums">{m.config.k}</td>
              </tr>
              <tr>
                <td className="py-1.5" title="Elo points added to the home team">
                  Home-field edge (Elo points)
                </td>
                <td className="py-1.5 text-right tabular-nums">{init.config.home_field}</td>
                <td className="py-1.5 text-right font-semibold tabular-nums">{m.config.home_field}</td>
              </tr>
              <tr>
                <td className="py-1.5" title="How much each rating slides back toward average between seasons">
                  Offseason pull toward average
                </td>
                <td className="py-1.5 text-right tabular-nums">{pct(init.config.regression)}</td>
                <td className="py-1.5 text-right font-semibold tabular-nums">{pct(m.config.regression)}</td>
              </tr>
              <tr>
                <td className="py-1.5">Brier score on test seasons</td>
                <td className="py-1.5 text-right tabular-nums">{init.brier.toFixed(4)}</td>
                <td className="py-1.5 text-right font-semibold tabular-nums">{m.brier.toFixed(4)}</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section className="panel-flat p-5">
          <h2 className="font-display text-3xl text-strong">Did a fancier model help?</h2>
          <p className="text-sm text-muted">
            We also built ratings from EPA (expected points added per play) and blended them with Elo. Same test seasons:
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
                ["Elo, first guess", "0.2247"],
                ["Elo, tuned (used here)", "0.2235"],
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
            The differences are tiny, about 0.001, which is within the noise of {m.games.toLocaleString("en-US")} games. The blend is
            slightly best, but not by enough to justify the extra complexity, so the simulator uses tuned Elo. (Numbers from
            scripts/compare_models.py.)
          </p>
        </section>
      </div>
    </>
  );
}

export default function BacktestPage() {
  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6">
      <h1 className="font-display text-6xl text-strong sm:text-8xl">
        Model <span className="text-accent-ink">Accuracy</span>
      </h1>
      <div className="mt-3">
        <Suspense fallback={<div className="h-96 animate-pulse bg-panel-2" aria-busy="true" />}>
          <Backtest />
        </Suspense>
      </div>
    </main>
  );
}
