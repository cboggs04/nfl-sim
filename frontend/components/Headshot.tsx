"use client";

import Image from "next/image";
import { useState } from "react";

/** A player's photo in a circle, falling back to initials if the image is missing or fails to load. */
export default function Headshot({ src, name, color, size = 48 }: { src: string | null; name: string; color: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("");
  return (
    <span
      className="relative inline-flex shrink-0 items-end justify-center overflow-hidden rounded-full bg-panel-2"
      style={{ width: size, height: size, boxShadow: `0 0 0 2px ${color}` }}
    >
      {src && !failed ? (
        <Image src={src} alt={name} width={size} height={size} unoptimized onError={() => setFailed(true)} className="h-full w-full object-cover object-top" />
      ) : (
        <span className="font-display flex h-full w-full items-center justify-center text-lg text-muted" aria-hidden>
          {initials}
        </span>
      )}
    </span>
  );
}
