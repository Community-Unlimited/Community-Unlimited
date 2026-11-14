/**
 * View 1 — Command Centre and Launch Control.
 *
 * Uses the unified CU-OS command layout: an emerald verdict & filter band,
 * collapsible deployment/timeline telemetry bar, readiness progress card, and
 * severity-coded finding cards sorted worst-first.
 */

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { get } from "../api/client";
import type { Finding, LaunchControl, Severity } from "../api/types";
import {
  AlertTriangleIcon,
  CalendarIcon,
  CheckCircleIcon,
  UsersIcon,
} from "../components/icons";
import {
  Banner,
  EmeraldBand,
  EmeraldSearch,
  FilterPill,
  Meter,
  PageContent,
  RosterHeader,
  SeverityBadge,
  Spinner,
  TelemetryBar,
  TelemetryStat,
} from "../components/ui";

const MILESTONES = [
  { date: "1 Oct 2026", label: "Training starts" },
  { date: "31 Jan 2027", label: "Training window ends" },
  { date: "6–7 Feb 2027", label: "CNY 2027 — 300 target" },
  { date: "31 Mar 2027", label: "All 17 assets live" },
];

type SeverityFilter = "all" | Severity;
type SortOption = "severity" | "title";

const SEVERITY_RANK: Record<Severity, number> = {
  red: 0,
  amber: 1,
  green: 2,
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
    <dl className="mt-3.5 grid grid-cols-2 gap-2 rounded-xl border border-cu-line-soft bg-[#f8fafb] p-3 sm:grid-cols-4">
      {cells.map((c) => (
        <div
          key={c.label}
          className={`rounded-lg px-3 py-2 ${c.bad ? "bg-cu-red-tint/70" : "bg-white border border-cu-line-soft"}`}
        >
          <dt
            className={`text-[11px] font-bold uppercase tracking-[0.06em] ${
              c.bad ? "text-cu-red" : "text-cu-body-text"
            }`}
          >
            {c.label}
          </dt>
          <dd
            className={`mt-1 text-lg font-bold tracking-[-0.015em] tabular-nums ${
              c.bad ? "text-cu-red" : "text-cu-ink"
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
  const cardBorder =
    finding.severity === "red"
      ? "border-red-300/90"
      : finding.severity === "amber"
        ? "border-amber-300/90"
        : "border-emerald-200";
  const badgeBg =
    finding.severity === "red"
      ? "bg-[#c62828]"
      : finding.severity === "amber"
        ? "bg-[#d97706]"
        : "bg-[#0e6e68]";
  const dotTone =
    finding.severity === "red"
      ? "bg-red-400"
      : finding.severity === "amber"
        ? "bg-amber-400"
        : "bg-emerald-500";
  const statusPill =
    finding.severity === "red"
      ? "border-red-300 bg-red-50 text-red-800"
      : finding.severity === "amber"
        ? "border-amber-300 bg-amber-50 text-amber-800"
        : "border-emerald-300 bg-emerald-50 text-emerald-800";
  const statusLabel =
    finding.severity === "red"
      ? "Blocking"
      : finding.severity === "amber"
        ? "Watch"
        : "On track";

  return (
    <article
      className={`rounded-2xl border bg-cu-surface p-4 shadow-[0_1px_3px_rgba(31,42,46,0.06)] sm:p-5 ${cardBorder}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div
            className={`relative flex size-11 shrink-0 items-center justify-center rounded-2xl text-white shadow-xs ${badgeBg}`}
          >
            {finding.severity === "green" ? (
              <CheckCircleIcon className="size-5" />
            ) : (
              <AlertTriangleIcon className="size-5" />
            )}
            <span
              aria-hidden="true"
              className={`absolute -right-0.5 -top-0.5 size-3 rounded-full ring-2 ring-white ${dotTone}`}
            />
          </div>

          <div className="min-w-0">
            <h2 className="text-[1.0625rem] font-bold leading-snug text-cu-ink">
              {finding.title}
            </h2>
            <p className="mt-0.5 text-xs font-medium text-cu-teal-ink">
              Launch Control Check · <span className="text-cu-body-text">{finding.code}</span>
            </p>
          </div>
        </div>

        <span
          className={`shrink-0 rounded-lg border px-2.5 py-0.5 text-xs font-bold ${statusPill}`}
        >
          {statusLabel}
        </span>
      </div>

      <p className="mt-3 text-sm leading-relaxed text-cu-body-text">
        {finding.detail}
      </p>

      {finding.code === "training_capacity" && (
        <CapacityMetrics metrics={finding.metrics} />
      )}

      <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2 border-t border-cu-line-soft pt-3">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/events"
            className="inline-flex items-center gap-1.5 rounded-xl border border-cu-teal-edge bg-cu-teal-tint/60 px-3 py-1.5 text-xs font-semibold text-cu-teal-ink transition hover:bg-cu-teal-tint"
          >
            <CalendarIcon className="size-3.5" />
            Open Calendar
          </Link>
          <Link
            to="/people"
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-200"
          >
            <UsersIcon className="size-3.5" />
            Review People
          </Link>
        </div>

        <Link
          to="/signups"
          className="text-xs font-bold text-cu-teal-ink transition hover:underline sm:text-sm"
        >
          View Sign-ups →
        </Link>
      </div>
    </article>
  );
}

export default function CommandCentre() {
  const [search, setSearch] = useState("");
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>("all");
  const [sortBy, setSortBy] = useState<SortOption>("severity");
  const [telemetryOpen, setTelemetryOpen] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["launch-control"],
    queryFn: () => get<LaunchControl>("/api/launch-control"),
  });

  const filteredFindings = useMemo(() => {
    const list = data?.findings ?? [];
    const q = search.trim().toLowerCase();

    const matched = list.filter((f) => {
      if (severityFilter !== "all" && f.severity !== severityFilter) {
        return false;
      }
      if (!q) return true;
      return (
        f.title.toLowerCase().includes(q) ||
        f.detail.toLowerCase().includes(q) ||
        f.code.toLowerCase().includes(q)
      );
    });

    return [...matched].sort((a, b) => {
      if (sortBy === "title") {
        return a.title.localeCompare(b.title);
      }
      return SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    });
  }, [data?.findings, search, severityFilter, sortBy]);

  if (isLoading) return <Spinner label="Reading the operating picture" />;
  if (error) {
    return (
      <PageContent>
        <Banner tone="red">{(error as Error).message}</Banner>
      </PageContent>
    );
  }
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
  const greenCount = data.findings.filter((f) => f.severity === "green").length;

  return (
    <>
      <EmeraldBand>
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-white/10 bg-[#032623]/70 p-3.5 sm:p-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-[0.09em] text-cu-teal-edge">
                Launch Control Verdict
              </span>
              <span className="text-[11px] text-cu-teal-edge/70">
                ·{" "}
                {new Date(data.generated_at).toLocaleString("en-SG", {
                  day: "2-digit",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                  timeZone: "Asia/Singapore",
                })}{" "}
                SGT
              </span>
            </div>
            <h2 className="mt-1 text-base font-bold leading-snug text-white sm:text-xl">
              {topFinding ? topFinding.title : "Nothing is blocking rollout"}
            </h2>
            <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-cu-teal-edge/85 sm:text-sm">
              {topFinding
                ? topFinding.detail
                : "Every check passed against the locked calendar and the current roster."}
            </p>
          </div>
          <div className="shrink-0">
            <SeverityBadge severity={worst} label={verdictCount} />
          </div>
        </div>

        <EmeraldSearch
          value={search}
          onChange={setSearch}
          label="Search findings"
          placeholder="Search launch findings, bottlenecks, or codes..."
        />

        <div
          role="tablist"
          aria-label="Filter findings by severity"
          className="mt-3 flex gap-2 overflow-x-auto pb-1"
        >
          <FilterPill
            active={severityFilter === "all"}
            onClick={() => setSeverityFilter("all")}
            label="All Findings"
            count={data.findings.length}
          />
          <FilterPill
            active={severityFilter === "red"}
            onClick={() => setSeverityFilter("red")}
            label="Blocking"
            count={h.red_findings}
            tone="red"
            icon={
              <span
                aria-hidden="true"
                className={`size-2 rounded-full ${
                  severityFilter === "red" ? "bg-white" : "bg-red-400"
                }`}
              />
            }
          />
          <FilterPill
            active={severityFilter === "amber"}
            onClick={() => setSeverityFilter("amber")}
            label="Watch"
            count={h.amber_findings}
            tone="amber"
            icon={
              <span
                aria-hidden="true"
                className={`size-2 rounded-full ${
                  severityFilter === "amber" ? "bg-cu-emerald" : "bg-amber-400"
                }`}
              />
            }
          />
          <FilterPill
            active={severityFilter === "green"}
            onClick={() => setSeverityFilter("green")}
            label="On Track"
            count={greenCount}
            tone="green"
            icon={
              <CheckCircleIcon
                className={`size-3.5 ${
                  severityFilter === "green" ? "text-white" : "text-emerald-300"
                }`}
              />
            }
          />
        </div>
      </EmeraldBand>

      <PageContent>
        <TelemetryBar
          title="CNY 2027 Rollout & Capacity Telemetry"
          open={telemetryOpen}
          onToggle={() => setTelemetryOpen((v) => !v)}
        >
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              <TelemetryStat
                label="Deployable Target"
                value={`${h.deployable} / ${h.deployable_target}`}
                hint={`${h.registered} registered`}
                tone={deployablePct >= 100 ? "green" : "teal"}
              />
              <TelemetryStat
                label="CB5 Team Leaders"
                value={`${h.cb5_leaders} / ${h.leader_duties_per_week}`}
                hint="Weekly duties at rollout"
                tone={h.cb5_leaders >= h.leader_duties_per_week ? "green" : "red"}
              />
              <TelemetryStat
                label="Assets Live"
                value={`${h.assets_live} / ${h.assets_target}`}
                hint="Due 31 Mar 2027"
                tone={h.assets_live >= h.assets_target ? "green" : "amber"}
              />
              <TelemetryStat
                label="Learner Seats Left"
                value={h.learner_seats_remaining}
                hint={`${h.training_slots} calendar slots`}
                tone={h.learner_seat_gap > 0 ? "red" : "green"}
              />
            </div>

            <div className="rounded-xl border border-cu-line-soft bg-[#f8fafb] p-3.5">
              <p className="mb-2.5 text-xs font-bold uppercase tracking-[0.06em] text-cu-body-text">
                Locked Milestone Timeline
              </p>
              <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {MILESTONES.map((m) => (
                  <li
                    key={m.date}
                    className="rounded-lg border border-cu-line-soft bg-white px-3 py-2.5"
                  >
                    <p className="text-sm font-bold text-cu-teal-ink">{m.date}</p>
                    <p className="mt-0.5 text-xs text-cu-body-text">{m.label}</p>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </TelemetryBar>

        {/* Deployment Readiness Card */}
        <article className="rounded-2xl border border-cu-border bg-cu-surface p-4 shadow-[0_1px_3px_rgba(31,42,46,0.06)] sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="relative flex size-12 shrink-0 items-center justify-center rounded-2xl bg-[#0e6e68] text-sm font-extrabold text-white shadow-xs">
                {deployablePct}%
                <span
                  aria-hidden="true"
                  className={`absolute -right-0.5 -top-0.5 size-3 rounded-full ring-2 ring-white ${
                    h.learner_seat_gap > 0 ? "bg-amber-400" : "bg-emerald-500"
                  }`}
                />
              </div>
              <div>
                <h2 className="text-[1.0625rem] font-bold text-cu-ink">
                  Deployment-Ready by CNY 2027
                </h2>
                <p className="mt-0.5 text-xs font-medium text-cu-teal-ink">
                  {h.deployable} of {h.deployable_target} target{" "}
                  <span className="text-cu-muted">•</span>{" "}
                  <span className="text-cu-body-text">
                    {h.registered} registered total
                  </span>
                </p>
              </div>
            </div>

            <div className="flex flex-col items-end gap-1">
              <span className="rounded-lg border border-cu-teal-edge bg-cu-teal-tint px-2.5 py-0.5 text-xs font-bold text-cu-teal-ink">
                {stillToQualify} to qualify
              </span>
              <span className="text-[11px] font-medium tabular-nums text-cu-muted">
                {h.cb5_leaders}/{h.leader_duties_per_week} CB5 leaders ·{" "}
                {h.assets_live}/{h.assets_target} assets
              </span>
            </div>
          </div>

          <div className="mt-3.5 rounded-xl border border-cu-line-soft bg-[#f8fafb] px-3.5 py-3">
            <Meter
              label="Progress to target"
              value={h.deployable}
              max={h.deployable_target}
              tone={deployablePct >= 100 ? "green" : "teal"}
              right={
                <span className="tabular-nums">
                  {h.learner_seats_remaining} learner seats remaining
                </span>
              }
            />
          </div>

          {h.learner_seat_gap > 0 && (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50/70 px-3.5 py-2.5">
              <div className="flex min-w-0 flex-1 items-center gap-2.5">
                <AlertTriangleIcon className="size-4 text-cu-red" />
                <div className="min-w-0">
                  <p className="text-xs font-bold text-cu-red">Behind Pace:</p>
                  <p className="text-xs text-cu-ink">
                    Calendar is short {h.learner_seat_gap.toLocaleString()}{" "}
                    learner seats across {h.training_slots} slots.
                  </p>
                </div>
              </div>
              <Link
                to="/events"
                className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-cu-red px-4 py-2 text-xs font-bold text-white shadow-xs transition hover:brightness-110"
              >
                Open Calendar
              </Link>
            </div>
          )}
        </article>

        <RosterHeader
          title="Launch Control Findings"
          countLabel={`${filteredFindings.length} shown`}
          right={
            <label className="flex items-center gap-2 text-xs text-cu-body-text sm:text-sm">
              <span>Sort:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortOption)}
                className="rounded-xl border border-cu-border-strong bg-cu-surface px-3 py-1.5 text-xs font-semibold text-cu-ink focus:border-cu-teal-ink focus:outline-none sm:text-sm"
              >
                <option value="severity">Worst Severity First</option>
                <option value="title">Title (A–Z)</option>
              </select>
            </label>
          }
        />

        <section aria-label="Launch findings" className="flex flex-col gap-3.5">
          {filteredFindings.map((f) => (
            <FindingCard key={f.code} finding={f} />
          ))}

          {filteredFindings.length === 0 && (
            <p className="rounded-2xl border border-cu-border bg-cu-surface p-8 text-center text-base text-cu-body-text">
              No findings match that filter.
            </p>
          )}
        </section>
      </PageContent>
    </>
  );
}
