/**
 * View 1 — Command Centre and Launch Control.
 *
 * Follows the imported Command Centre design: an emerald verdict hero, a
 * priority row led by progress-to-target, then findings as a filterable,
 * worst-first list. The panel reads as a verdict, not a scoreboard — its job
 * is to surface contradictions rather than celebrate totals.
 */

import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { get } from "../api/client";
import { useAuth } from "../auth";
import type { Finding, LaunchControl, Severity } from "../api/types";
import {
  Banner,
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

const SEVERITY_RANK: Record<Severity, number> = { red: 0, amber: 1, green: 2 };

type FilterKey = "all" | "blocking" | "watch";
type SortKey = "worst" | "az";

function num(v: unknown, fallback = 0): number {
  return typeof v === "number" ? v : fallback;
}

/* -------------------------------------------------------------------------
 * icons — small and page-local; nothing here is reused outside this view.
 * ---------------------------------------------------------------------- */

type IconProps = { className?: string };

function IconTarget({ className = "size-5" }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="10" cy="10" r="3.8" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="10" cy="10" r="1" fill="currentColor" />
    </svg>
  );
}

function IconPeople({ className = "size-5" }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <circle cx="7.3" cy="6.5" r="2.6" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M2.3 16.2c0-2.7 2.2-4.4 5-4.4s5 1.7 5 4.4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <circle cx="14.3" cy="6.1" r="2" stroke="currentColor" strokeWidth="1.3" />
      <path
        d="M13.2 12c2 .2 3.6 1.7 3.6 4.2"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconCalendar({ className = "size-5" }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <rect x="2.5" y="3.8" width="15" height="13.2" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M2.5 7.6h15M6.2 2.3v2.6M13.8 2.3v2.6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconChair({ className = "size-5" }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <path d="M5.8 3v8.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <rect x="4.3" y="11.2" width="10.4" height="2.2" rx="1" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M5.3 13.4v3.3M13.7 13.4v3.3M14.2 8.2v3"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Triangle-exclamation for red/amber, a checkmark for green — decorative; the accessible signal is `SeverityBadge`. */
function SeverityIcon({ severity }: { severity: Severity }) {
  const tint = {
    red: "bg-cu-red-tint text-cu-red",
    amber: "bg-cu-amber-tint text-cu-amber",
    green: "bg-cu-green-tint text-cu-green",
  }[severity];
  return (
    <span
      aria-hidden="true"
      className={`flex size-9 flex-none items-center justify-center rounded-full ${tint}`}
    >
      {severity === "green" ? (
        <svg viewBox="0 0 20 20" fill="none" className="size-5">
          <path
            d="M5 10.3 8.2 13.5 15 6.5"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : (
        <svg viewBox="0 0 20 20" fill="none" className="size-5">
          <path d="M10 2.7 18 16.5H2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
          <path d="M10 8v3.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          <circle cx="10" cy="14" r="0.9" fill="currentColor" />
        </svg>
      )}
    </span>
  );
}

/** The four derived figures behind the capacity finding, as inline columns. */
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
    <div className="flex basis-full flex-wrap gap-x-7 gap-y-3 lg:basis-auto lg:flex-none">
      {cells.map((c) => (
        <div key={c.label}>
          <p className="text-cu-caption font-bold uppercase tracking-[0.06em] text-cu-body-text">
            {c.label}
          </p>
          <p
            className={`mt-0.5 text-[1.25rem] font-bold tabular-nums ${
              c.bad ? "text-cu-red" : "text-cu-ink"
            }`}
          >
            {c.value.toLocaleString()}
          </p>
        </div>
      ))}
    </div>
  );
}

function FindingRow({ finding }: { finding: Finding }) {
  return (
    <article
      className={`flex flex-wrap items-center gap-5 rounded-2xl border border-cu-border bg-cu-surface p-5 shadow-[0_1px_3px_rgba(31,42,46,.07)] sm:p-6 ${LEFT_BORDER[finding.severity]}`}
    >
      <SeverityIcon severity={finding.severity} />
      <div className="min-w-[220px] flex-1">
        <h3 className="text-cu-h3 font-bold text-cu-emerald">{finding.title}</h3>
        <p className="mt-1.5 max-w-[70ch] text-cu-body leading-relaxed text-cu-body-text">
          {finding.detail}
        </p>
      </div>
      {finding.code === "training_capacity" && (
        <CapacityMetrics metrics={finding.metrics} />
      )}
      <div className="ml-auto flex flex-none items-center gap-3">
        <SeverityBadge severity={finding.severity} />
        <span aria-hidden="true" className="text-[1.35rem] leading-none text-cu-muted">
          ›
        </span>
      </div>
    </article>
  );
}

export default function CommandCentre() {
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const [filter, setFilter] = useState<FilterKey>("all");
  const [sort, setSort] = useState<SortKey>("worst");

  const { data, isLoading, error } = useQuery({
    queryKey: ["launch-control"],
    queryFn: () => get<LaunchControl>("/api/launch-control"),
  });

  const blockingCount = data?.findings.filter((f) => f.severity === "red").length ?? 0;
  const watchCount = data?.findings.filter((f) => f.severity === "amber").length ?? 0;

  const visibleFindings = useMemo(() => {
    if (!data) return [];
    const filtered = data.findings.filter((f) => {
      if (filter === "blocking") return f.severity === "red";
      if (filter === "watch") return f.severity === "amber";
      return true;
    });
    // Array#sort is stable (ES2019+), so ties keep the API's own ordering.
    return sort === "az"
      ? [...filtered].sort((a, b) => a.title.localeCompare(b.title))
      : [...filtered].sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
  }, [data, filter, sort]);

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
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-cu-h1 font-bold leading-[1.15] tracking-[-0.015em] text-cu-emerald">
            Command Centre
          </h1>
          <p className="mt-1.5 max-w-[56ch] text-[1.0625rem] text-cu-body-text">
            Coffee is the first use case. The product is the capacity engine.
          </p>
        </div>
        <div className="flex flex-col items-end gap-2.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <Link
              to="/register"
              className="tap-target inline-flex items-center justify-center gap-2 rounded-xl border border-cu-border-strong bg-cu-mist px-5 py-2.5 text-cu-body font-semibold text-cu-teal-ink transition hover:border-cu-teal-edge hover:bg-cu-teal-tint"
            >
              Registration form
            </Link>
            <button
              type="button"
              onClick={signOut}
              className="tap-target inline-flex items-center justify-center gap-2 rounded-xl border border-cu-border-strong bg-cu-mist px-5 py-2.5 text-cu-body font-semibold text-cu-teal-ink transition hover:border-cu-teal-edge hover:bg-cu-teal-tint"
            >
              Sign out
            </button>
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
      </div>

      {/* --- verdict hero ----------------------------------------------- */}
      <section
        aria-labelledby="verdict-h"
        className="flex flex-wrap items-center gap-6 rounded-2xl bg-cu-emerald p-6 text-white sm:p-8"
      >
        <SeverityIcon severity={worst} />
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
      <section
        aria-labelledby="pri-h"
        className="grid grid-cols-[repeat(auto-fit,minmax(250px,1fr))] items-stretch gap-5"
      >
        <div className="flex flex-col justify-between gap-4 rounded-2xl border border-cu-border bg-cu-panel p-5 shadow-[0_1px_3px_rgba(31,42,46,.07)]">
          <div>
            <span className="mb-3 flex size-10 items-center justify-center rounded-full bg-cu-teal-tint text-cu-teal-ink">
              <IconTarget />
            </span>
            <h3
              id="pri-h"
              className="text-cu-caption font-bold uppercase tracking-[0.09em] text-cu-body-text"
            >
              Deployment-ready by CNY 2027
            </h3>
            <p className="mt-3 flex flex-wrap items-baseline gap-2.5">
              <span className="text-[clamp(2.25rem,6vw,3rem)] font-bold leading-[0.9] tracking-[-0.015em] text-cu-ink tabular-nums">
                {h.deployable}
              </span>
              <span className="text-[1.0625rem] text-cu-body-text">
                of {h.deployable_target} target
              </span>
            </p>
          </div>
          <div>
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
            {h.learner_seat_gap > 0 && (
              <p className="mt-4 rounded-xl border border-cu-red/25 bg-cu-red-tint px-4 py-3.5 text-cu-body leading-relaxed text-cu-ink">
                <span className="font-bold text-cu-red">Behind pace.</span>{" "}
                Training capacity is the binding constraint, not sign-ups — the
                calendar is short {h.learner_seat_gap.toLocaleString()} learner
                seats.
              </p>
            )}
          </div>
        </div>

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
          icon={<IconPeople />}
          linkLabel="View details"
          onLinkClick={() => navigate("/people")}
        />
        <StatTile
          label="Assets live"
          caption="All 17 due 31 Mar 2027"
          value={h.assets_live}
          target={h.assets_target}
          severity={h.assets_live >= h.assets_target ? "green" : "amber"}
          chip={h.assets_live >= h.assets_target ? "Complete" : "Watch"}
          icon={<IconCalendar />}
          linkLabel="View assets"
          onLinkClick={() => navigate("/assets")}
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
          icon={<IconChair />}
          linkLabel="View calendar"
          onLinkClick={() => navigate("/events")}
        />
      </section>

      {/* --- findings ---------------------------------------------------- */}
      <section aria-labelledby="findings-h">
        <div id="findings-h">
          <SectionTitle rule>Findings</SectionTitle>
        </div>

        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter findings">
            <FilterTab
              label="All"
              count={data.findings.length}
              active={filter === "all"}
              onClick={() => setFilter("all")}
            />
            <FilterTab
              label="Blocking"
              count={blockingCount}
              dotClassName="bg-cu-red"
              active={filter === "blocking"}
              onClick={() => setFilter("blocking")}
            />
            <FilterTab
              label="To watch"
              count={watchCount}
              dotClassName="bg-cu-amber"
              active={filter === "watch"}
              onClick={() => setFilter("watch")}
            />
          </div>
          <label className="flex items-center gap-2 text-cu-body text-cu-body-text">
            Sort by
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="tap-target rounded-lg border border-cu-border-strong bg-cu-surface px-3 py-1.5 text-cu-body font-semibold text-cu-ink focus:border-cu-teal-ink"
            >
              <option value="worst">Worst first</option>
              <option value="az">Title (A–Z)</option>
            </select>
          </label>
        </div>

        <div className="flex flex-col gap-3.5">
          {visibleFindings.map((f) => (
            <FindingRow key={f.code} finding={f} />
          ))}
          {visibleFindings.length === 0 && (
            <p className="rounded-2xl border border-cu-border bg-cu-panel p-7 text-center text-[1.0625rem] text-cu-body-text">
              Nothing in this view.
            </p>
          )}
        </div>
      </section>

      {/* --- timeline ---------------------------------------------------- */}
      <section aria-labelledby="timeline-h">
        <div id="timeline-h">
          <SectionTitle rule>Timeline</SectionTitle>
        </div>
        <div className="rounded-2xl border border-cu-border bg-cu-panel p-5 shadow-[0_1px_3px_rgba(31,42,46,.07)] sm:p-7">
          <ol className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {MILESTONES.map((m) => (
              <li key={m.date}>
                <p className="text-cu-h3 font-bold text-cu-teal-ink">{m.date}</p>
                <p className="mt-0.5 text-cu-body text-cu-body-text">{m.label}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>
    </>
  );
}

function FilterTab({
  label,
  count,
  active,
  dotClassName,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  dotClassName?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`tap-target inline-flex items-center gap-2 rounded-full border px-4 text-cu-body font-semibold transition ${
        active
          ? "border-cu-emerald bg-cu-emerald text-white"
          : "border-cu-border bg-cu-surface text-cu-body-text hover:bg-cu-line-soft"
      }`}
    >
      {dotClassName && (
        <span aria-hidden="true" className={`size-2 flex-none rounded-full ${dotClassName}`} />
      )}
      {label} <span className="tabular-nums">({count})</span>
    </button>
  );
}
