import SiteFooter from "@/components/SiteFooter";
import { getSeason } from "@/lib/api";

/** The footer with the "data updated" date. If the API is down it just leaves the date out. */
export default async function SiteFooterLoader() {
  const season = await getSeason().catch(() => null);
  return <SiteFooter updated={season?.generated_at} />;
}
