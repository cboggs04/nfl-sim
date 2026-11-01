import Link from "next/link";
import { pct } from "@/components/ProbCell";
import TeamLogo from "@/components/TeamLogo";
import { teamInfo } from "@/lib/teams";
import type { TeamOdds } from "@/lib/types";

/** The top Super Bowl favorites as big team cards. */
export default function ContenderCards({ teams }: { teams: TeamOdds[] }) {
  const top = [...teams].sort((a, b) => b.p_super_bowl - a.p_super_bowl).slice(0, 5);
  return (
    <ol className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
      {top.map((t, i) => {
        const info = teamInfo(t.team);
        return (
          <li key={t.team} className="rise" style={{ animationDelay: `${i * 70}ms` }}>
            <Link
              href={`/teams/${t.team}`}
              className="panel group relative block h-full overflow-hidden p-4 transition-transform hover:-translate-y-1"
              style={{ backgroundColor: "var(--card-end)", backgroundImage: `linear-gradient(150deg, ${info.primary}cc 0%, ${info.primary}44 45%, var(--card-end) 100%)` }}
            >
              <span className="font-display absolute top-2 left-3 text-5xl text-white/25">{i + 1}</span>
              <div className="flex justify-center pt-3 pb-2 transition-transform group-hover:scale-105">
                <TeamLogo abbr={t.team} size={112} />
              </div>
              <div className="font-display mt-2 text-center text-2xl text-white [text-shadow:0_2px_8px_rgba(0,0,0,.6)]">
                {info.name}
              </div>
              <div className="mt-2 text-center">
                <span className="font-display text-5xl text-white [text-shadow:0_2px_10px_rgba(0,0,0,.6)]">{pct(t.p_super_bowl)}</span>
                <div className="text-xs font-semibold tracking-widest text-white/75 uppercase">Win the Super Bowl</div>
              </div>
              <div className="mt-3 flex justify-between border-t border-white/15 pt-2 text-xs text-white/80">
                <span>
                  Playoffs <b className="text-white">{pct(t.p_playoffs)}</b>
                </span>
                <span>
                  Exp. wins <b className="text-white">{t.exp_wins.toFixed(1)}</b>
                </span>
              </div>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}
