/**
 * Help & support — orientation, not a ticket system. There's no support desk
 * wired up yet, so this explains what's on screen rather than inventing a
 * contact channel that doesn't exist.
 */

const TOPICS = [
  {
    q: 'What does "Blocking" vs "To watch" mean?',
    a: "Blocking findings (red) mean the plan as currently modelled does not work — a hard constraint, like the training-seat shortfall. To watch (amber) findings are on track today but worth attention before they become blocking.",
  },
  {
    q: "Why does the Command Centre show a shortfall instead of a percentage?",
    a: "Launch Control derives its verdict from the locked calendar and roster rather than one opaque score, so you can see exactly which rule is failing and change it — more slots, another venue, a different intake size — rather than guessing at a number.",
  },
  {
    q: "Who can approve a qualification?",
    a: "A human always does. Attendance alone leaves a completion pending; a coordinator approves each core module from the People & tiers page before it counts toward deployment.",
  },
  {
    q: "Something looks wrong, or a page won't load",
    a: "Check with the coordinator who manages your CU-OS sign-in — they can check the server status and your account's role and access.",
  },
];

export default function HelpSupport() {
  return (
    <>
      <div>
        <h1 className="text-cu-h1 font-bold leading-[1.15] tracking-[-0.015em] text-cu-emerald">
          Help &amp; support
        </h1>
        <p className="mt-1.5 max-w-[70ch] text-[1.0625rem] text-cu-body-text">
          A quick orientation to how CU-OS is meant to be read.
        </p>
      </div>

      <div className="flex flex-col gap-3.5">
        {TOPICS.map((t) => (
          <article
            key={t.q}
            className="rounded-2xl border border-cu-border bg-cu-panel p-6 shadow-[0_1px_3px_rgba(31,42,46,.07)]"
          >
            <h3 className="text-cu-h3 font-bold text-cu-emerald">{t.q}</h3>
            <p className="mt-2 max-w-[72ch] text-cu-body leading-relaxed text-cu-body-text">
              {t.a}
            </p>
          </article>
        ))}
      </div>
    </>
  );
}
