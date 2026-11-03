import AboutModel, { type ModelStats } from "@/components/AboutModel";
import { getBacktest, getSeason } from "@/lib/api";

/** Fetches the headline accuracy numbers for the "About the model" panel. If the API is down the panel just leaves them out. */
export default async function AboutModelLoader() {
  const [bt, season] = await Promise.all([getBacktest().catch(() => null), getSeason().catch(() => null)]);
  const model = bt ? (bt.models.qb ?? Object.values(bt.models).at(-1)) : undefined; // the latest model is the one the site uses
  const stats: ModelStats | undefined =
    bt && model
      ? {
          accuracy: model.accuracy,
          brier: model.brier,
          games: model.games,
          testSeasons: bt.test_seasons as [number, number],
          trainSeasons: bt.train_seasons as [number, number],
          updated: season?.generated_at,
        }
      : undefined;
  return <AboutModel stats={stats} />;
}
