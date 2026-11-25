// Kickoff times are shown in Eastern time (as the NFL lists them), so the server and the browser render the same text.
const ET = "America/New_York";

const dayFmt = new Intl.DateTimeFormat("en-US", { timeZone: ET, weekday: "long", month: "short", day: "numeric" });
const shortFmt = new Intl.DateTimeFormat("en-US", { timeZone: ET, weekday: "short", hour: "numeric", minute: "2-digit" });
const timeFmt = new Intl.DateTimeFormat("en-US", { timeZone: ET, hour: "numeric", minute: "2-digit" });
const keyFmt = new Intl.DateTimeFormat("en-CA", { timeZone: ET, year: "numeric", month: "2-digit", day: "2-digit" });

/** "Thursday, Nov 26" */
export const kickoffDay = (iso: string) => dayFmt.format(new Date(iso));
/** "Thu 8:20 PM ET" */
export const kickoffShort = (iso: string) => `${shortFmt.format(new Date(iso))} ET`;
/** "8:20 PM ET" */
export const kickoffTime = (iso: string) => `${timeFmt.format(new Date(iso))} ET`;
/** "2026-11-26": the Eastern calendar day, for grouping games by day. */
export const kickoffDayKey = (iso: string) => keyFmt.format(new Date(iso));
