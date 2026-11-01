"use client";

import { Fragment, useEffect, useState } from "react";

/**
 * Starts its children from scratch every time you come back to the page.
 *
 * Next.js keeps a page you navigate away from alive in the background (so Back is instant), and that keeps its
 * client state: the selected tab, a simulated season. When a page is hidden React runs the cleanup of its effects,
 * so bumping a key there remounts everything inside, which is a clean page by the time you return.
 */
export default function ResetOnLeave({ children }: { children: React.ReactNode }) {
  const [visit, setVisit] = useState(0);
  useEffect(() => () => setVisit((v) => v + 1), []);
  return <Fragment key={visit}>{children}</Fragment>;
}
