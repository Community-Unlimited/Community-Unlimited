/**
 * View 1 — Command Centre and Launch Control.
 *
 * Follows the imported Command Centre design: an emerald verdict hero, a
 * priority row led by progress-to-target, then findings as left-bordered
 * articles sorted worst-first. The panel reads as a verdict, not a scoreboard —
 * its job is to surface contradictions rather than celebrate totals.
 */

import { useQuery } from "@tanstack/react-query";
import { get } from "../api/client";
import type { Finding, LaunchControl, Severity } from "../api/types";
import {
  Banner,
  Button,
  Card,
  Meter,
  SectionTitle,
  SeverityBadge,
  Spinner,
  StatTile,
} from "../components/ui";

const MILESTONES = [
  { date: "1 Oct 2026", label: "Training starts" },
  { date: "31 Jan 2027", label: "Training window ends" },
  { date: "6–7 Feb 2027", label: "CNY 2027 — 300 target" },
  { date: "31 Mar 2027", label: "All 17 assets live" },
];

const LEFT_BORDER: Record<Severity, string> = {
  red: "border-l-[5px] border-l-cu-red",
  amber: "border-l-[5px] border-l-cu-amber",
  green: "border-l-[5px] border-l-cu-green",
};

function num(v: unknown, fallback = 0): number {
  return typeof v === "number" ? v : fallback;
}

/** The four derived figures behind the capacity finding. */
function CapacityMetrics({ metrics }: { metrics: Record<string, unknown> }) {
  const cells = [
    { label: "Seats required", value: num(metrics.learner_seats_required), bad: false },
    { label: "Seats available", value: num(metrics.total_learner_seats), bad: false },
    { label: "Shortfall", value: num(metrics.learner_seat_gap), bad: true },
    {
      label: "Max completers",
      value: num(metrics.max_people_completing_pathway),
      bad: false,
    },
  ];
  return (
    <dl className="mt-5 grid gap-px overflow-hidden rounded-xl border border-cu-border bg-cu-border sm:grid-cols-2 lg:grid-cols-4">
      {cells.map((c) => (
        <div
          key={c.label}
          className={`p-4 ${c.bad ? "bg-cu-red-tint" : "bg-cu-teal-tint"}`}
        >
          <dt
            className={`text-cu-caption font-bold uppercase tracking-[0.07em] ${
              c.bad ? "text-cu-red" : "text-cu-teal-ink"
            }`}
          >
            {c.label}
          </dt>
          <dd
            className={`mt-1 text-cu-h2 font-bold tracking-[-0.015em] tabular-nums ${
              c.bad ? "text-cu-red" : "text-cu-emerald"
            }`}
          >
            {c.value.toLocaleString()}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function FindingCard({ finding }: { finding: Finding }) {
  return (
    <article
      className={`rounded-2xl border border-cu-border bg-cu-surface p-6 shadow-[0_1px_3px_rgba(31,42,46,.07)] ${LEFT_BORDER[finding.severity]}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h3 className="text-cu-h3 font-bold text-cu-emerald">{finding.title}</h3>
        <SeverityBadge severity={finding.severity} />
      </div>
      <p className="mt-2.5 max-w-[78ch] text-cu-body leading-relaxed text-cu-body-text">
        {finding.detail}
      </p>
      {finding.code === "training_capacity" && (
        <CapacityMetrics metrics={finding.metrics} />
      )}
    </article>
  );
}

export default function CommandCentre() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["launch-control"],
    queryFn: () => get<LaunchControl>("/api/launch-control"),
  });

  if (isLoading) return <Spinner label="Reading the operating picture" />;
  if (error) return <Banner tone="red">{(error as Error).message}</Banner>;
  if (!data) return null;

  const h = data.headline;
  const worst = data.worst_severity;
  const verdictCount =
    worst === "red"
      ? `${h.red_findings} blocking issue${h.red_findings === 1 ? "" : "s"}`
      : worst === "amber"
        ? `${h.amber_findings} to watch`
        : "On track";

  const topFinding = data.findings[0];
  const stillToQualify = Math.max(0, h.deployable_target - h.deployable);
  const deployablePct = h.deployable_target
    ? Math.round((h.deployable / h.deployable_target) * 100)
    : 0;

  return (
    <>
      {/* --- page head -------------------------------------------------- */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-cu-h1 font-bold leading-[1.15] tracking-[-0.015em] text-cu-emerald">
            Command Centre
          </h1>
          <p className="mt-1.5 max-w-[56ch] text-[1.0625rem] text-cu-body-text">
            Coffee is the first use case. The product is the capacity engine.
          </p>
        </div>
        <p className="text-cu-caption text-cu-body-text">
          Generated{" "}
          <span className="font-semibold text-cu-ink">
            {new Date(data.generated_at).toLocaleString("en-SG", {
              day: "2-digit",
              month: "short",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
              timeZone: "Asia/Singapore",
            })}
          </span>{" "}
          · Asia/Singapore
        </p>
      </div>

      {/* --- verdict hero ----------------------------------------------- */}
      <section
        aria-labelledby="verdict-h"
        className="flex flex-wrap items-center gap-6 rounded-2xl bg-cu-emerald p-6 text-white sm:p-8"
      >
        <div className="min-w-0 flex-1 basis-80">
          <p className="text-cu-caption font-bold uppercase tracking-[0.09em] text-cu-teal-edge">
            Launch Control verdict
          </p>
          <h2
            id="verdict-h"
            className="mt-3 text-cu-h2 font-bold leading-tight tracking-[-0.015em] text-white sm:text-[2.25rem]"
          >
            {topFinding ? topFinding.title : "Nothing is blocking rollout"}
          </h2>
          <p className="mt-2.5 max-w-[64ch] text-[1.0625rem] leading-relaxed text-cu-teal-tint-strong">
            {topFinding
              ? topFinding.detail
              : "Every check passed against the locked calendar and the current roster."}
          </p>
        </div>
        <div className="flex flex-none flex-col items-start gap-3">
          <SeverityBadge severity={worst} label={verdictCount} size="lg" />
          <p className="max-w-[22ch] text-cu-caption text-cu-teal-edge">
            Its job is not to cheerlead. It asks whether the plan actually works.
          </p>
        </div>
      </section>

      {/* --- priority row ------------------------------------------------ */}
      <section aria-labelledby="pri-h" className="flex flex-wrap items-stretch gap-5">
        <Card className="min-w-0 flex-1 basis-[330px]">
          <h3
            id="pri-h"
            className="text-cu-caption font-bold uppercase tracking-[0.09em] text-cu-body-text"
          >
            Deployment-ready by CNY 2027
          </h3>
          <p className="mt-3.5 flex flex-wrap items-baseline gap-3">
            <span className="text-[clamp(3rem,8vw,4.25rem)] font-bold leading-[0.9] tracking-[-0.015em] text-cu-ink tabular-nums">
              {h.deployable}
            </span>
            <span className="text-[1.25rem] text-cu-body-text">
              of {h.deployable_target} target
            </span>
          </p>
          <div className="mt-5">
            <Meter
              label="Progress to target"
              value={h.deployable}
              max={h.deployable_target}
              tone={deployablePct >= 100 ? "green" : "teal"}
              right={
                <span>
                  {stillToQualify} still to qualify · {h.registered} registered
                </span>
              }
            />
          </div>
          {h.learner_seat_gap > 0 && (
            <p className="mt-5 rounded-xl border border-cu-red/25 bg-cu-red-tint px-4 py-3.5 text-cu-body leading-relaxed text-cu-ink">
              <span className="font-bold text-cu-red">Behind pace.</span>{" "}
              Training capacity is the binding constraint, not sign-ups — the
              calendar is short {h.learner_seat_gap.toLocaleString()} learner
              seats.
            </p>
          )}
        </Card>

        <div className="grid min-w-0 flex-[2] basis-[440px] grid-cols-[repeat(auto-fit,minmax(175px,1fr))] gap-3.5">
          <StatTile
            label="CB5 team leaders"
            caption={`Against ${h.leader_duties_per_week} weekly duties at full rollout`}
            value={h.cb5_leaders}
            target={h.leader_duties_per_week}
            severity={h.cb5_leaders >= h.leader_duties_per_week ? "green" : "red"}
            chip={
              h.cb5_leaders >= h.leader_duties_per_week
                ? "Covered"
                : `Short ${h.leader_duties_per_week - h.cb5_leaders}`
            }
          />
          <StatTile
            label="Assets live"
            caption="All 17 due 31 Mar 2027"
            value={h.assets_live}
            target={h.assets_target}
            severity={h.assets_live >= h.assets_target ? "green" : "amber"}
            chip={h.assets_live >= h.assets_target ? "Complete" : "Watch"}
          />
          <StatTile
            label="Learner seats left"
            caption={`${h.training_slots} slots on the locked calendar`}
            value={h.learner_seats_remaining}
            target={h.learner_seats_total}
            severity={h.learner_seat_gap > 0 ? "red" : "green"}
            chip={
              h.learner_seat_gap > 0
                ? `Gap ${h.learner_seat_gap.toLocaleString()}`
                : "Sufficient"
            }
          />
        </div>
      </section>

      {/* --- findings ---------------------------------------------------- */}
      <section aria-labelledby="findings-h">
        <div id="findings-h">
          <SectionTitle
            rule
            aside={
              <p className="text-cu-body text-cu-body-text">
                <span className="font-bold text-cu-red">
                  {h.red_findings} blocking
                </span>{" "}
                ·{" "}
                <span className="font-bold text-cu-amber">
                  {h.amber_findings} to watch
                </span>{" "}
                · sorted worst first
              </p>
            }
          >
            Findings
          </SectionTitle>
        </div>
        <div className="flex flex-col gap-3.5">
          {data.findings.map((f) => (
            <FindingCard key={f.code} finding={f} />
          ))}
        </div>
      </section>

      {/* --- timeline ---------------------------------------------------- */}
      <section aria-labelledby="timeline-h">
        <div id="timeline-h">
          <SectionTitle rule>Timeline</SectionTitle>
        </div>
        <Card>
          <ol className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {MILESTONES.map((m) => (
              <li key={m.date}>
                <p className="text-cu-h3 font-bold text-cu-teal-ink">{m.date}</p>
                <p className="mt-0.5 text-cu-body text-cu-body-text">{m.label}</p>
              </li>
            ))}
          </ol>
        </Card>
      </section>

      <div className="flex flex-wrap gap-2.5">
        <Button onClick={() => (window.location.href = "/events")}>
          Open the calendar
        </Button>
        <Button
          variant="ghost"
          onClick={() => (window.location.href = "/people")}
        >
          See who is closest to CB5
        </Button>
      </div>
    </>
  );
}
