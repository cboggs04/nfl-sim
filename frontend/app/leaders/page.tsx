import LoadingSkeleton from "@/components/LoadingSkeleton";
import PageHeader from "@/components/PageHeader";
import ResetOnLeave from "@/components/ResetOnLeave";
import { Suspense } from "react";
import LeadersView from "@/components/LeadersView";
import { getLeaders } from "@/lib/api";

export const metadata = { title: "Stat Leaders · NFL Season Simulator" };

async function Leaders() {
  const data = await getLeaders().catch(() => null);
  if (!data) {
    return <p className="mt-8 text-muted">Leader data isn&apos;t available right now. The server may still be waking up: wait a few seconds and reload.</p>;
  }
  return <LeadersView data={data} />;
}

export default function LeadersPage() {
  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-10 land:py-3 sm:px-6">
      <ResetOnLeave>
        <PageHeader
          title={
            <>
              Stat <span className="text-accent-ink">Leaders</span>
            </>
          }
          subtitle="Projected league leaders and award odds for the season, from simulating every remaining game and every player's stats."
        />
        <Suspense fallback={<LoadingSkeleton />}>
          <Leaders />
        </Suspense>
      </ResetOnLeave>
    </main>
  );
}
