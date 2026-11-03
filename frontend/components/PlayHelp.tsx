"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

const KEYS: [string, string][] = [
  ["← →", "Before the snap: choose a pass (←) or a run (→)"],
  ["↑ ↓", "Before the snap: switch between the three plays on offer (or press 1, 2 or 3)"],
  ["Space", "Snap the ball. While you have the ball in the open, sprint (it recharges)"],
  ["Arrow keys", "Move the quarterback or the ball carrier"],
  ["1  2  3", "Before the snap: pick one of the three plays shown"],
  ["A  S  D", "During a pass: throw to the receiver wearing that letter. They sit under your left hand"],
  ["F", "4th down: kick a field goal (shows the distance)"],
  ["P", "4th down: punt"],
  ["Space", "4th down: go for it"],
  ["Enter", "Skip ahead during the other team's drive, or start the 2nd half"],
  ["Esc", "Pause or resume the game (the clock stops)"],
  ["?", "Open or close this help"],
];

/** A "how to play" pop-up: the goal, the controls and a few tips. Esc or the button closes it. */
export default function PlayHelp({ onClose }: { onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "?") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      window.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="How to play" className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm sm:p-6" onClick={onClose}>
      <div className="panel max-h-full w-full max-w-2xl overflow-y-auto p-5 sm:p-7" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <h2 className="font-display text-5xl text-strong">How to play</h2>
          <button ref={closeRef} onClick={onClose} aria-label="Close help" className="font-pixel rounded bg-head px-3 py-2 text-[10px] text-strong ring-1 ring-line hover:bg-hover">
            CLOSE X
          </button>
        </div>

        <section className="mt-3">
          <h3 className="font-display text-2xl text-accent-ink">The goal</h3>
          <p className="mt-1 text-sm text-muted">
            You run the offense. Drive down the field left to right and score: a touchdown is worth 7 and a field goal 3. You have four downs to gain 10
            yards. Each game has two halves of 10:00 on the game clock, which runs about five times faster than real time while a play is live, so a half
            takes around two minutes. When your drive ends, the other team&apos;s possession is simulated from the two teams&apos; ratings, and then you get the
            ball back. A stronger team has a real edge.
          </p>
        </section>

        <section className="mt-4">
          <h3 className="font-display text-2xl text-accent-ink">Running a play</h3>
          <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm text-muted">
            <li>
              <b className="text-strong">Pick pass or run</b> with <b className="text-strong">← →</b>, then pick one of the three plays with <b className="text-strong">↑ ↓</b> or <b className="text-strong">1, 2, 3</b> (three of five pass plays and three of five run plays are offered each snap). The dotted lines show the routes or where the back is headed.
            </li>
            <li>
              <b className="text-strong">Press Space</b> to snap the ball.
            </li>
            <li>
              <b className="text-strong">On a pass</b>, the pass rush closes in after a few seconds. Press <b className="text-strong">A, S or D</b> to throw to the
              receiver with that letter, ideally the one with the most space around him. You can slide the quarterback with the arrow keys to buy time, but you can&apos;t throw
              once you cross the line of scrimmage.
            </li>
            <li>
              <b className="text-strong">After a catch, or on a run</b>, steer the ball carrier with the arrow keys and tap <b className="text-strong">Space</b> to
              sprint. A sprint helps you break tackles, then needs a moment to recharge (the bar under the field).
            </li>
          </ol>
        </section>

        <section className="mt-4">
          <h3 className="font-display text-2xl text-accent-ink">Controls</h3>
          <table className="mt-1 w-full text-sm">
            <tbody className="divide-y divide-line/60">
              {KEYS.map(([k, what]) => (
                <tr key={k + what}>
                  <td className="w-44 py-1.5 pr-3 align-top">
                    <kbd className="font-pixel rounded bg-head px-2 py-1 text-[10px] text-strong ring-1 ring-line">{k}</kbd>
                  </td>
                  <td className="py-1.5 text-muted">{what}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="mt-4">
          <h3 className="font-display text-2xl text-accent-ink">4th down and tips</h3>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-muted">
            <li>On 4th down you choose: go for it, kick a field goal (up to about 62 yards, and longer kicks miss more) or punt.</li>
            <li>Missing the first-down line on 4th down gives the other team the ball where you stopped.</li>
            <li>Pick a difficulty before kickoff: Rookie (receivers get open, slow pass rush, easy running), Pro, or All-Star (fast defenders and quick pressure).</li>
            <li>Don&apos;t hold the ball too long: if a defender reaches the quarterback it&apos;s a sack.</li>
            <li>Running is safer than passing, but passing gains yards faster.</li>
            <li>The clock stops between plays, and the other team&apos;s drive uses up time, so a half is only a few possessions each.</li>
          </ul>
        </section>

        <div className="mt-5 flex justify-end">
          <button onClick={onClose} className="btn btn-primary text-lg">
            Got it
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
