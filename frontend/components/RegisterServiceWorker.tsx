"use client";

import { useEffect } from "react";

/** Registers the service worker (public/sw.js) in production, so the installed app loads fast and has an offline page. */
export default function RegisterServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}
