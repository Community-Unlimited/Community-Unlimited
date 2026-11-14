/**
 * View 3 — People pipeline and tier tracking.
 *
 * Mobile-first volunteer roster with an emerald command header, searchable
 * filter pills, collapsible CB1–CB7 pipeline telemetry, 7-segment
 * qualification progression tracks, and human-in-the-loop sign-off review.
 */

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { get, post } from "../api/client";
import type { PendingQualification, Person, PipelineSummary } from "../api/types";
import {
  Banner,
  Button,
  Spinner,
} from "../components/ui";

const CORE = ["CB1", "CB2", "CB3", "CB4"] as const;
const LEADERSHIP = ["CB5", "CB6", "CB7"] as const;
const ALL_MODULES = [...CORE, ...LEADERSHIP] as const;

const MODULE_TITLES: Record<string, string> = {
  CB1: "Community Orientation & Safety",
  CB2: "CPR/AED & Medical Escalation",
  CB3: "Transport & Warehouse Verification",
  CB4: "Field Deployment Practicum",
  CB5: "Team Lead & Incident Command",
  CB6: "Trainer & Assessment Sign-off",
  CB7: "Zone Coordinator & Audit",
};

const HEALTH_LABELS: Record<string, string> = {
  heart_blood_pressure: "Heart / BP",
  epilepsy_seizures: "Epilepsy / Seizures / Dizziness",
  joint_balance_mobility: "Joint / Balance",
  asthma_respiratory: "Asthma / Breathing",
  heat_grip_sensitivity: "Grip / Heat Sensitivity",
  allergies: "Allergies",
  other: "Other Condition",
};

const LANGUAGE_LABELS: Record<string, string> = {
  en: "English",
  zh: "Chinese",
  ms: "Malay",
  ta: "Tamil",
  other: "Other",
};

const MOBILITY_LABELS: Record<string, string> = {
  pmd: "PMD Required",
  wheelchair: "Wheelchair",
  walking_aid: "Walking Aid",
};

type FilterTab = "all" | "needs_approval" | "deployable" | "in_training";
type SortOption = "needs_action" | "name_asc" | "most_qualified" | "newest";

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "CU";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

function formatCuId(id: number): string {
  return `CU-${String(id).padStart(4, "0")}`;
}

function getVerifiedCount(person: Person): number {
  if (!person.tier) return 0;
  const unique = new Set([
    ...person.tier.core_completed,
    ...person.tier.leadership_held,
  ]);
  return unique.size;
}

function StatCell({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "amber";
}) {
  return (
    <div className="rounded-xl border border-cu-border bg-cu-panel p-3.5">
      <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-cu-body-text">
        {label}
      </p>
      <p
        className={`mt-1.5 text-[1.75rem] font-bold leading-none tracking-[-0.015em] tabular-nums ${
          tone === "amber" ? "text-cu-amber" : "text-cu-ink"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

/* --- Inline SVG icons -------------------------------------------------- */

function SearchIcon() {
  return (
    <svg
      aria-hidden="true"
      className="size-4 shrink-0 text-cu-teal-edge/70"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

function CheckCircleIcon({ className = "size-4" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

function TelemetryIcon() {
  return (
    <svg
      aria-hidden="true"
      className="size-4 shrink-0 text-cu-teal-ink"
      viewBox="0 0 24 24"
      fill="currentColor"
    >
      <rect x="3" y="12" width="4" height="8" rx="1" />
      <rect x="10" y="6" width="4" height="14" rx="1" />
      <rect x="17" y="9" width="4" height="11" rx="1" />
    </svg>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden="true"
      className={`size-4 transition-transform ${open ? "rotate-180" : ""}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function StampIcon({ className = "size-4" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 20h14" />
      <path d="M6 17h12v-2a2 2 0 0 0-2-2h-2V9a3 3 0 1 0-4 0v4H8a2 2 0 0 0-2 2v2Z" />
    </svg>
  );
}

function WhatsAppIcon() {
  return (
    <svg
      aria-hidden="true"
      className="size-3.5 shrink-0"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg
      aria-hidden="true"
      className="size-3.5 shrink-0"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92Z" />
    </svg>
  );
}

function QualificationTrack({ person }: { person: Person }) {
  const completed = person.tier?.core_completed ?? [];
  const leadership = person.tier?.leadership_held ?? [];
  const pending = person.tier?.pending_approval ?? [];
  const verifiedCount = getVerifiedCount(person);

  return (
    <div className="mt-3.5 rounded-xl border border-cu-line-soft bg-[#f8fafb] px-3.5 py-3">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="font-medium text-cu-body-text">
          Qualification Progression Track
        </span>
        <span className="font-bold tabular-nums text-cu-ink">
          {verifiedCount} of 7 modules verified
        </span>
      </div>

      <div className="mt-2.5 grid grid-cols-7 gap-1.5">
        {ALL_MODULES.map((code) => {
          const isDone = completed.includes(code) || leadership.includes(code);
          const isPending = !isDone && pending.includes(code);
          const barClass = isDone
            ? "bg-[#0f8a5f]"
            : isPending
              ? "bg-[#eab308]"
              : "bg-slate-200";
          const textClass = isDone
            ? "font-bold text-cu-ink"
            : isPending
              ? "font-bold text-amber-700"
              : "font-medium text-cu-muted";
          const stateLabel = isDone
            ? "verified"
            : isPending
              ? "awaiting sign-off"
              : "not started";

          return (
            <div
              key={code}
              title={`${code} (${MODULE_TITLES[code]}): ${stateLabel}`}
              className="flex flex-col items-center gap-1"
            >
              <div className={`h-1.5 w-full rounded-full ${barClass}`} />
              <span className={`text-[11px] leading-none ${textClass}`}>
                {code}
              </span>
              <span className="sr-only"> {stateLabel}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function People() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<FilterTab>("all");
  const [onlyMissing, setOnlyMissing] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("needs_action");
  const [telemetryOpen, setTelemetryOpen] = useState(false);
  const [selectedPerson, setSelectedPerson] = useState<Person | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const people = useQuery({
    queryKey: ["people", onlyMissing],
    queryFn: () =>
      get<Person[]>(
        `/api/people${onlyMissing ? `?missing_module=${encodeURIComponent(onlyMissing)}` : ""}`
      ),
  });
  const pipeline = useQuery({
    queryKey: ["pipeline"],
    queryFn: () => get<PipelineSummary>("/api/people-summary/pipeline"),
  });
  const pending = useQuery({
    queryKey: ["pending-quals"],
    queryFn: () => get<PendingQualification[]>("/api/qualifications/pending"),
  });

  const approve = useMutation({
    mutationFn: ({ personId, code }: { personId: number; code: string }) =>
      post("/api/qualifications/approve", {
        person_id: personId,
        module_code: code,
      }),
    onSuccess: (_d, v) => {
      setError(null);
      setNotice(`${v.code} approved and signed off.`);
      setSelectedPerson(null);
      for (const k of ["pending-quals", "people", "pipeline", "launch-control"]) {
        queryClient.invalidateQueries({ queryKey: [k] });
      }
    },
    onError: (err) => setError((err as Error).message),
  });

  const pendingByPerson = useMemo(() => {
    const map = new Map<number, PendingQualification>();
    for (const row of pending.data ?? []) {
      if (!map.has(row.person_id)) {
        map.set(row.person_id, row);
      }
    }
    return map;
  }, [pending.data]);

  const counts = useMemo(() => {
    const list = people.data ?? [];
    let needsApproval = 0;
    let deployable = 0;
    let inTraining = 0;
    for (const p of list) {
      const hasPending =
        pendingByPerson.has(p.id) || (p.tier?.pending_approval?.length ?? 0) > 0;
      if (hasPending) needsApproval += 1;
      if (p.tier?.deployable) deployable += 1;
      else if (!hasPending) inTraining += 1;
    }
    return {
      all: list.length,
      needsApproval,
      deployable,
      inTraining,
    };
  }, [people.data, pendingByPerson]);

  const filteredPeople = useMemo(() => {
    const list = people.data ?? [];
    const q = search.trim().toLowerCase();

    const filtered = list.filter((person) => {
      const hasPending =
        pendingByPerson.has(person.id) ||
        (person.tier?.pending_approval?.length ?? 0) > 0;
      const isDeployable = Boolean(person.tier?.deployable);

      if (activeTab === "needs_approval" && !hasPending) return false;
      if (activeTab === "deployable" && !isDeployable) return false;
      if (activeTab === "in_training" && (isDeployable || hasPending))
        return false;

      if (!q) return true;
      const haystack = [
        person.preferred_name,
        person.full_name,
        person.phone_e164,
        person.home_zone,
        person.home_precinct,
        person.grassroots_organisation,
        person.tier?.tier_label,
        person.tier?.highest_qualification,
        formatCuId(person.id),
        ...(person.tier?.pending_approval ?? []),
        ...(person.tier?.core_completed ?? []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(q);
    });

    return [...filtered].sort((a, b) => {
      if (sortBy === "name_asc") {
        return a.preferred_name.localeCompare(b.preferred_name);
      }
      if (sortBy === "most_qualified") {
        return getVerifiedCount(b) - getVerifiedCount(a);
      }
      if (sortBy === "newest") {
        return (
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
      }
      // "needs_action": pending sign-off first, then deployable/in-training, then name
      const aPending =
        pendingByPerson.has(a.id) || (a.tier?.pending_approval?.length ?? 0) > 0
          ? 1
          : 0;
      const bPending =
        pendingByPerson.has(b.id) || (b.tier?.pending_approval?.length ?? 0) > 0
          ? 1
          : 0;
      if (aPending !== bPending) return bPending - aPending;
      return a.preferred_name.localeCompare(b.preferred_name);
    });
  }, [people.data, search, activeTab, sortBy, pendingByPerson]);

  if (people.isLoading || pipeline.isLoading) {
    return <Spinner label="Loading people" />;
  }

  const summary = pipeline.data;

  return (
    <div className="flex flex-col gap-4">
      {/* --- Emerald Command Header & Filter Bar ------------------------- */}
      <section className="-mx-4 -mt-5 bg-cu-emerald px-4 pb-4 pt-4 text-white shadow-[0_4px_16px_rgba(5,53,49,0.18)] sm:mx-0 sm:mt-0 sm:rounded-2xl sm:px-6 sm:py-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#10b981] text-sm font-extrabold tracking-tight text-white shadow-xs">
              CU
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[1.0625rem] font-bold leading-none text-white">
                  CU-OS
                </span>
                <span className="rounded-md bg-white/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-cu-teal-edge">
                  OPS
                </span>
              </div>
              <p className="mt-0.5 text-xs font-medium text-cu-teal-edge/85">
                People &amp; Tiers
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <Link
              to="/register"
              className="inline-flex items-center gap-1 rounded-full bg-[#1aa39a] px-3.5 py-2 text-xs font-bold text-white shadow-xs transition hover:bg-[#178f87] sm:text-sm"
            >
              + Add Member
            </Link>
            <span
              aria-label="Operator initials"
              className="flex size-9 shrink-0 items-center justify-center rounded-full border border-white/20 bg-white/10 text-xs font-bold text-white"
            >
              RT
            </span>
          </div>
        </div>

        {/* Search input */}
        <div className="mt-4">
          <label className="relative flex items-center">
            <span className="sr-only">Search volunteers</span>
            <span className="pointer-events-none absolute left-3.5 flex items-center">
              <SearchIcon />
            </span>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search volunteers by name, phone, or tier..."
              className="w-full rounded-xl border border-white/15 bg-[#032623] py-2.5 pl-10 pr-4 text-sm text-white placeholder:text-cu-teal-edge/65 focus:border-cu-teal focus:outline-none"
            />
          </label>
        </div>

        {/* Filter pills */}
        <div
          role="tablist"
          aria-label="Filter volunteers"
          className="mt-3 flex gap-2 overflow-x-auto pb-1"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "all"}
            onClick={() => setActiveTab("all")}
            className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition ${
              activeTab === "all"
                ? "border-white bg-white text-cu-emerald"
                : "border-white/20 bg-[#07423d] text-white hover:border-white/40"
            }`}
          >
            All
            <span
              className={`rounded-full px-1.5 py-0.5 text-[11px] font-bold tabular-nums ${
                activeTab === "all"
                  ? "bg-cu-teal-tint text-cu-teal-ink"
                  : "bg-white/15 text-white"
              }`}
            >
              {counts.all}
            </span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "needs_approval"}
            onClick={() => setActiveTab("needs_approval")}
            className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition ${
              activeTab === "needs_approval"
                ? "border-amber-400 bg-amber-400 text-cu-emerald-ink"
                : "border-amber-400/45 bg-[#07423d] text-white hover:border-amber-400/80"
            }`}
          >
            <span
              aria-hidden="true"
              className={`size-2 rounded-full ${
                activeTab === "needs_approval" ? "bg-cu-emerald" : "bg-amber-400"
              }`}
            />
            Needs Approval
            <span
              className={`rounded-full px-1.5 py-0.5 text-[11px] font-bold tabular-nums ${
                activeTab === "needs_approval"
                  ? "bg-cu-emerald text-amber-300"
                  : "bg-amber-400 text-cu-emerald-ink"
              }`}
            >
              {counts.needsApproval}
            </span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "deployable"}
            onClick={() => setActiveTab("deployable")}
            className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition ${
              activeTab === "deployable"
                ? "border-emerald-400 bg-emerald-500 text-white"
                : "border-emerald-400/40 bg-[#07423d] text-white hover:border-emerald-400/80"
            }`}
          >
            <CheckCircleIcon className="size-3.5 text-emerald-300" />
            Deployable
            <span
              className={`rounded-full px-1.5 py-0.5 text-[11px] font-bold tabular-nums ${
                activeTab === "deployable"
                  ? "bg-white text-emerald-800"
                  : "bg-emerald-600 text-white"
              }`}
            >
              {counts.deployable}
            </span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "in_training"}
            onClick={() => setActiveTab("in_training")}
            className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition ${
              activeTab === "in_training"
                ? "border-white bg-white text-cu-emerald"
                : "border-white/20 bg-[#07423d] text-white hover:border-white/40"
            }`}
          >
            In Training
            <span
              className={`rounded-full px-1.5 py-0.5 text-[11px] font-bold tabular-nums ${
                activeTab === "in_training"
                  ? "bg-cu-teal-tint text-cu-teal-ink"
                  : "bg-white/15 text-white"
              }`}
            >
              {counts.inTraining}
            </span>
          </button>
        </div>
      </section>

      {error && <Banner tone="red">{error}</Banner>}
      {notice && (
        <Banner tone="green" onDismiss={() => setNotice(null)}>
          {notice}
        </Banner>
      )}

      {/* --- Collapsible CB1–CB7 Pipeline & Audit Telemetry -------------- */}
      {summary && (
        <section className="-mx-4 border-y border-cu-border bg-cu-surface px-4 py-2.5 sm:mx-0 sm:rounded-2xl sm:border sm:px-5">
          <button
            type="button"
            onClick={() => setTelemetryOpen((v) => !v)}
            aria-expanded={telemetryOpen}
            className="flex w-full items-center justify-between gap-3 py-1 text-left"
          >
            <div className="flex items-center gap-2 min-w-0">
              <TelemetryIcon />
              <span className="truncate text-sm font-bold text-cu-ink">
                CB1–CB7 Pipeline &amp; Audit Telemetry
              </span>
              <span className="shrink-0 rounded-md bg-cu-teal-tint px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.06em] text-cu-teal-ink">
                CU-OS
              </span>
            </div>
            <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-cu-body-text">
              {telemetryOpen ? "Collapse" : "Expand"}
              <ChevronIcon open={telemetryOpen} />
            </span>
          </button>

          {telemetryOpen && (
            <div className="mt-3 space-y-4 border-t border-cu-line-soft pt-3.5 pb-1">
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                <StatCell label="Registered" value={summary.registered} />
                <StatCell label="Deployment-ready" value={summary.deployable} />
                <StatCell
                  label="Closest to deployable"
                  value={summary.missing_exactly_one_module.length}
                />
                <StatCell
                  label="Awaiting approval"
                  value={pending.data?.length ?? 0}
                  tone="amber"
                />
              </div>

              <div>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-bold uppercase tracking-[0.06em] text-cu-body-text">
                    Module Pipeline (click core module to filter missing)
                  </p>
                  {onlyMissing && (
                    <button
                      type="button"
                      onClick={() => setOnlyMissing("")}
                      className="text-xs font-semibold text-cu-teal-ink hover:underline"
                    >
                      Clear missing {onlyMissing} filter
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
                  {ALL_MODULES.map((code) => {
                    const count = summary.by_module[code] ?? 0;
                    const isCore = (CORE as readonly string[]).includes(code);
                    const isActive = onlyMissing === code;
                    return (
                      <button
                        key={code}
                        type="button"
                        disabled={!isCore}
                        onClick={() =>
                          isCore &&
                          setOnlyMissing((prev) => (prev === code ? "" : code))
                        }
                        className={`rounded-xl border p-3 text-left transition ${
                          isActive
                            ? "border-cu-teal-ink bg-cu-teal-tint ring-2 ring-cu-teal-ink/20"
                            : isCore
                              ? "border-cu-teal-edge bg-cu-teal-tint/60 hover:bg-cu-teal-tint"
                              : "border-cu-border bg-cu-line-soft opacity-90"
                        }`}
                      >
                        <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-cu-body-text">
                          {code}
                        </p>
                        <p className="mt-0.5 text-xl font-bold tabular-nums text-cu-ink">
                          {count}
                        </p>
                        <p className="text-[11px] text-cu-body-text">
                          {isCore ? "required" : "leadership"}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {/* --- Active Volunteers Header & Sort Bar ------------------------- */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <div className="flex items-center gap-2.5">
          <h1 className="text-xl font-bold tracking-[-0.015em] text-cu-ink sm:text-2xl">
            Active Volunteers
          </h1>
          <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold tabular-nums text-emerald-800">
            {filteredPeople.length} shown
          </span>
        </div>

        <label className="flex items-center gap-2 text-xs text-cu-body-text sm:text-sm">
          <span>Sort:</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
            className="rounded-xl border border-cu-border-strong bg-cu-surface px-3 py-1.5 text-xs font-semibold text-cu-ink focus:border-cu-teal-ink focus:outline-none sm:text-sm"
          >
            <option value="needs_action">Needs Action First</option>
            <option value="name_asc">Name (A–Z)</option>
            <option value="most_qualified">Most Qualified</option>
            <option value="newest">Newest First</option>
          </select>
        </label>
      </div>

      {/* --- Volunteer Cards --------------------------------------------- */}
      <section aria-label="Volunteer roster" className="flex flex-col gap-3.5">
        {filteredPeople.map((person) => {
          const pendingRow = pendingByPerson.get(person.id);
          const nextPending =
            pendingRow?.module_code ?? person.tier?.pending_approval?.[0];
          const pendingModuleName =
            pendingRow?.module_name ||
            (nextPending ? MODULE_TITLES[nextPending] : "");
          const isDeployable = Boolean(person.tier?.deployable);

          const avatarTone = nextPending
            ? "bg-[#d97706]"
            : isDeployable
              ? "bg-[#0e6e68]"
              : "bg-[#475569]";
          const dotTone = nextPending
            ? "bg-amber-400"
            : isDeployable
              ? "bg-emerald-500"
              : "bg-slate-400";
          const cardBorder = nextPending
            ? "border-amber-300/90"
            : isDeployable
              ? "border-emerald-200"
              : "border-cu-border";

          const locationText = person.home_precinct || person.home_zone;
          const roleText =
            person.grassroots_organisation ||
            person.tier?.tier_label ||
            "Volunteer";
          const isNextLeadership =
            nextPending &&
            (LEADERSHIP as readonly string[]).includes(nextPending);

          const mobilityBadge = person.requires_pmd
            ? "PMD Required"
            : person.mobility_aid && person.mobility_aid !== "none"
              ? MOBILITY_LABELS[person.mobility_aid] ?? person.mobility_aid
              : null;

          const whatsappDigits = person.phone_e164.replace(/\D/g, "");

          return (
            <article
              key={person.id}
              className={`rounded-2xl border bg-cu-surface p-4 shadow-[0_1px_3px_rgba(31,42,46,0.06)] sm:p-5 ${cardBorder}`}
            >
              {/* Top row */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <div
                    className={`relative flex size-12 shrink-0 items-center justify-center rounded-2xl text-base font-bold text-white shadow-xs ${avatarTone}`}
                  >
                    {getInitials(person.preferred_name)}
                    <span
                      aria-hidden="true"
                      className={`absolute -right-0.5 -top-0.5 size-3 rounded-full ring-2 ring-white ${dotTone}`}
                    />
                  </div>

                  <div className="min-w-0">
                    <h2 className="truncate text-[1.0625rem] font-bold leading-snug text-cu-ink">
                      {person.preferred_name}
                    </h2>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs sm:text-sm">
                      {locationText && (
                        <span className="font-medium text-cu-teal-ink">
                          {locationText}
                        </span>
                      )}
                      {locationText && roleText && (
                        <span aria-hidden="true" className="text-cu-muted">
                          •
                        </span>
                      )}
                      <span className="text-cu-body-text">{roleText}</span>
                    </p>
                  </div>
                </div>

                <div className="flex shrink-0 flex-col items-end gap-1">
                  {nextPending ? (
                    <span className="rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-xs font-bold text-amber-800">
                      {nextPending} • {isNextLeadership ? "leadership" : "required"}
                    </span>
                  ) : isDeployable ? (
                    <span className="rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-800">
                      Deployable
                    </span>
                  ) : (
                    <span className="rounded-lg border border-cu-border bg-cu-line-soft px-2.5 py-0.5 text-xs font-bold text-cu-body-text">
                      {person.tier?.tier_label ?? "Registered"}
                    </span>
                  )}
                  <span className="text-[11px] font-medium tabular-nums text-cu-muted">
                    {formatCuId(person.id)}
                  </span>
                </div>
              </div>

              {/* Compact safety/context badges when present */}
              {(mobilityBadge || person.has_health_conditions) && (
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {mobilityBadge && (
                    <span className="rounded-md border border-cu-amber/30 bg-cu-amber-tint px-2 py-0.5 text-[11px] font-bold text-cu-amber">
                      {mobilityBadge}
                    </span>
                  )}
                  {person.has_health_conditions && (
                    <span className="rounded-md border border-cu-red/30 bg-cu-red-tint px-2 py-0.5 text-[11px] font-bold text-cu-red">
                      Health Alert
                    </span>
                  )}
                </div>
              )}

              {/* 7-segment qualification progression track */}
              <QualificationTrack person={person} />

              {/* Awaiting sign-off callout */}
              {nextPending && (
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-[#fffbeb] px-3.5 py-2.5">
                  <div className="flex min-w-0 flex-1 items-center gap-2.5">
                    <StampIcon className="size-4 shrink-0 text-amber-700" />
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-cu-ink">
                        Awaiting Sign-off:
                      </p>
                      <p className="truncate text-xs text-cu-body-text">
                        {nextPending}{" "}
                        {pendingModuleName || "Verification"}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedPerson(person)}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-[#d97706] px-4 py-2 text-xs font-bold text-white shadow-xs transition hover:bg-[#b45309] sm:text-sm"
                  >
                    <StampIcon className="size-3.5" />
                    Review
                  </button>
                </div>
              )}

              {/* Bottom action row */}
              <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2 border-t border-cu-line-soft pt-3">
                <div className="flex items-center gap-2">
                  <a
                    href={`https://wa.me/${whatsappDigits}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50/80 px-3 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100"
                  >
                    <WhatsAppIcon />
                    WhatsApp
                  </a>
                  <a
                    href={`tel:${person.phone_e164}`}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-200"
                  >
                    <PhoneIcon />
                    Call
                  </a>
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedPerson(person)}
                  className="text-xs font-bold text-cu-teal-ink transition hover:underline sm:text-sm"
                >
                  Full Record →
                </button>
              </div>
            </article>
          );
        })}

        {filteredPeople.length === 0 && (
          <p className="rounded-2xl border border-cu-border bg-cu-surface p-8 text-center text-base text-cu-body-text">
            No volunteers match your current filter.
          </p>
        )}
      </section>

      {/* --- Review / Full Record Modal ---------------------------------- */}
      {selectedPerson && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="person-modal-title"
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
          onClick={() => setSelectedPerson(null)}
        >
          <div
            className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-t-2xl bg-cu-surface p-5 shadow-2xl sm:rounded-2xl sm:p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-cu-line-soft pb-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.06em] text-cu-teal-ink">
                  {formatCuId(selectedPerson.id)}
                  {selectedPerson.nric_last4
                    ? ` · NRIC •••${selectedPerson.nric_last4}`
                    : ""}
                </p>
                <h2
                  id="person-modal-title"
                  className="mt-0.5 text-xl font-bold text-cu-ink"
                >
                  {selectedPerson.preferred_name}
                </h2>
                {selectedPerson.full_name &&
                  selectedPerson.full_name !== selectedPerson.preferred_name && (
                    <p className="text-xs text-cu-body-text">
                      Legal name: {selectedPerson.full_name}
                    </p>
                  )}
              </div>
              <button
                type="button"
                onClick={() => setSelectedPerson(null)}
                aria-label="Close record"
                className="rounded-xl border border-cu-border px-3 py-1.5 text-sm font-semibold text-cu-body-text hover:bg-cu-line-soft"
              >
                Close
              </button>
            </div>

            <div className="mt-4 space-y-4 text-sm text-cu-body-text">
              <QualificationTrack person={selectedPerson} />

              {(() => {
                const pendingRow = pendingByPerson.get(selectedPerson.id);
                const nextPending =
                  pendingRow?.module_code ??
                  selectedPerson.tier?.pending_approval?.[0];
                if (!nextPending) return null;
                const moduleName =
                  pendingRow?.module_name || MODULE_TITLES[nextPending];
                return (
                  <div className="rounded-xl border border-amber-200 bg-[#fffbeb] p-4">
                    <p className="text-xs font-bold uppercase tracking-[0.06em] text-amber-800">
                      Human Sign-off Required
                    </p>
                    <p className="mt-1 font-semibold text-cu-ink">
                      {nextPending} — {moduleName}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        variant="secondary"
                        disabled={approve.isPending}
                        onClick={() =>
                          approve.mutate({
                            personId: selectedPerson.id,
                            code: nextPending,
                          })
                        }
                      >
                        {approve.isPending
                          ? "Approving…"
                          : `Approve & Sign Off ${nextPending}`}
                      </Button>
                    </div>
                  </div>
                );
              })()}

              <div className="grid grid-cols-1 gap-3 rounded-xl border border-cu-line-soft bg-cu-page p-4 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-bold uppercase text-cu-muted">
                    Phone
                  </p>
                  <p className="font-semibold text-cu-ink">
                    {selectedPerson.phone_e164}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-bold uppercase text-cu-muted">
                    Zone / Precinct
                  </p>
                  <p className="font-semibold text-cu-ink">
                    {[selectedPerson.home_precinct, selectedPerson.home_zone]
                      .filter(Boolean)
                      .join(" · ") || "Not specified"}
                  </p>
                </div>
                {selectedPerson.age_band && (
                  <div>
                    <p className="text-xs font-bold uppercase text-cu-muted">
                      Age Band
                    </p>
                    <p className="font-semibold text-cu-ink">
                      {selectedPerson.age_band}
                    </p>
                  </div>
                )}
                {selectedPerson.grassroots_organisation && (
                  <div>
                    <p className="text-xs font-bold uppercase text-cu-muted">
                      Grassroots / Role
                    </p>
                    <p className="font-semibold text-cu-ink">
                      {selectedPerson.grassroots_organisation}
                    </p>
                  </div>
                )}
                {selectedPerson.written_languages &&
                  selectedPerson.written_languages.length > 0 && (
                    <div>
                      <p className="text-xs font-bold uppercase text-cu-muted">
                        Written Languages
                      </p>
                      <p className="font-semibold text-cu-ink">
                        {selectedPerson.written_languages
                          .map((l) => LANGUAGE_LABELS[l] ?? l)
                          .join(", ")}
                      </p>
                    </div>
                  )}
                {selectedPerson.spoken_languages &&
                  selectedPerson.spoken_languages.length > 0 && (
                    <div>
                      <p className="text-xs font-bold uppercase text-cu-muted">
                        Spoken Languages
                      </p>
                      <p className="font-semibold text-cu-ink">
                        {selectedPerson.spoken_languages
                          .map((l) => LANGUAGE_LABELS[l] ?? l)
                          .join(", ")}
                      </p>
                    </div>
                  )}
              </div>

              {(selectedPerson.has_health_conditions ||
                selectedPerson.health_notes ||
                selectedPerson.emergency_contact_name) && (
                <div className="space-y-1.5 rounded-xl border border-cu-red/20 bg-cu-red-tint/40 p-4 text-xs">
                  {selectedPerson.has_health_conditions && (
                    <p className="font-semibold text-cu-red">
                      Health conditions:{" "}
                      {(selectedPerson.health_conditions ?? [])
                        .map((c) => HEALTH_LABELS[c] ?? c)
                        .join(", ") || "Reported"}
                    </p>
                  )}
                  {selectedPerson.health_notes && (
                    <p className="text-cu-ink">
                      <strong>Safety note:</strong> {selectedPerson.health_notes}
                    </p>
                  )}
                  {selectedPerson.emergency_contact_name && (
                    <p className="text-cu-ink">
                      <strong>Emergency contact:</strong>{" "}
                      {selectedPerson.emergency_contact_name}
                      {selectedPerson.emergency_contact_relationship
                        ? ` (${selectedPerson.emergency_contact_relationship})`
                        : ""}{" "}
                      {selectedPerson.emergency_contact_phone ?? ""}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
