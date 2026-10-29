import Image from "next/image";
import { logoSrc, teamInfo } from "@/lib/teams";

/** A team logo on a white plate, so dark logos stay visible in dark mode. */
export default function TeamLogo({ abbr, size = 32 }: { abbr: string; size?: number }) {
  const pad = Math.round(size * 0.12);
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-white ring-1 ring-zinc-200 dark:ring-zinc-700"
      style={{ width: size, height: size, padding: pad }}
    >
      <Image src={logoSrc(abbr)} alt={`${teamInfo(abbr).name} logo`} width={size} height={size} className="h-full w-full object-contain" />
    </span>
  );
}
