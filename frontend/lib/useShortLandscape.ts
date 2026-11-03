"use client";

import { useSyncExternalStore } from "react";

const QUERY = "(orientation: landscape) and (max-height: 520px)";

/** True on a phone held sideways (wide but short). Matches the `land:` Tailwind variant. */
export function useShortLandscape(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const m = window.matchMedia(QUERY);
      m.addEventListener("change", onChange);
      return () => m.removeEventListener("change", onChange);
    },
    () => window.matchMedia(QUERY).matches,
    () => false,
  );
}
