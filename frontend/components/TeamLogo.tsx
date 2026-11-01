import Image from "next/image";
import { logoSrc, teamInfo } from "@/lib/teams";

/**
 * A team logo. Small ones sit on a light plate so dark logos stay visible on the dark theme;
 * large ones float free with a soft outline and a glow in the team's color, like a game's team-select screen.
 */
export default function TeamLogo({ abbr, size = 32 }: { abbr: string; size?: number }) {
  const alt = `${teamInfo(abbr).name} logo`;
  if (size >= 64) {
    return (
      <span className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
        <span
          aria-hidden
          className="absolute inset-[-18%] rounded-full opacity-60 blur-xl"
          style={{ background: `radial-gradient(circle, ${teamInfo(abbr).primary}, transparent 68%)` }}
        />
        <Image
          src={logoSrc(abbr)}
          alt={alt}
          width={size}
          height={size}
          className="relative h-full w-full object-contain"
          style={{ filter: "drop-shadow(0 0 1.5px rgba(255,255,255,.7)) drop-shadow(0 6px 10px rgba(0,0,0,.55))" }}
        />
      </span>
    );
  }
  const pad = Math.round(size * 0.1);
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-white/95 shadow-md shadow-black/40"
      style={{ width: size, height: size, padding: pad }}
    >
      <Image src={logoSrc(abbr)} alt={alt} width={size} height={size} className="h-full w-full object-contain" />
    </span>
  );
}
