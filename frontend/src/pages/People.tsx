/**
 * View 3 — People pipeline and tier tracking.
 *
 * Mobile-first volunteer roster with an emerald command filter band,
 * collapsible CB1–CB7 pipeline telemetry, 7-segment qualification progression
 * tracks, and human-in-the-loop sign-off review.
 */

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { get, post } from "../api/client";
import type { PendingQualification, Person, PipelineSummary } from "../api/types";
import {
  CheckCircleIcon,
  PhoneIcon,
  StampIcon,
  WhatsAppIcon,
} from "../components/icons";
import {
  Banner,
  Button,
  EmeraldBand,
  EmeraldSearch,
  FilterPill,
  PageContent,
  RosterHeader,
  Spinner,
  TelemetryBar,
  TelemetryStat,
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
    <>
      <EmeraldBand>
        <EmeraldSearch
          value={search}
          onChange={setSearch}
          label="Search volunteers"
          placeholder="Search volunteers by name, phone, or tier..."
        />

        <div
          role="tablist"
          aria-label="Filter volunteers"
          className="mt-3 flex gap-2 overflow-x-auto pb-1"
        >
          <FilterPill
            active={activeTab === "all"}
            onClick={() => setActiveTab("all")}
            label="All"
            count={counts.all}
          />
          <FilterPill
            active={activeTab === "needs_approval"}
            onClick={() => setActiveTab("needs_approval")}
            label="Needs Approval"
            count={counts.needsApproval}
            tone="amber"
            icon={
              <span
                aria-hidden="true"
                className={`size-2 rounded-full ${
                  activeTab === "needs_approval" ? "bg-cu-emerald" : "bg-amber-400"
                }`}
              />
            }
          />
          <FilterPill
            active={activeTab === "deployable"}
            onClick={() => setActiveTab("deployable")}
            label="Deployable"
            count={counts.deployable}
            tone="green"
            icon={
              <CheckCircleIcon
                className={`size-3.5 ${
                  activeTab === "deployable" ? "text-white" : "text-emerald-300"
                }`}
              />
            }
          />
          <FilterPill
            active={activeTab === "in_training"}
            onClick={() => setActiveTab("in_training")}
            label="In Training"
            count={counts.inTraining}
          />
        </div>
      </EmeraldBand>

      <PageContent>
        {summary && (
          <TelemetryBar
            title="CB1–CB7 Pipeline & Audit Telemetry"
            open={telemetryOpen}
            onToggle={() => setTelemetryOpen((v) => !v)}
          >
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                <TelemetryStat label="Registered" value={summary.registered} />
                <TelemetryStat
                  label="Deployment-ready"
                  value={summary.deployable}
                  tone="green"
                />
                <TelemetryStat
                  label="Closest to deployable"
                  value={summary.missing_exactly_one_module.length}
                  tone="teal"
                />
                <TelemetryStat
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
          </TelemetryBar>
        )}

        {error && <Banner tone="red">{error}</Banner>}
        {notice && (
          <Banner tone="green" onDismiss={() => setNotice(null)}>
            {notice}
          </Banner>
        )}

        <RosterHeader
          title="Active Volunteers"
          countLabel={`${filteredPeople.length} shown`}
          right={
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
          }
        />

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

                <QualificationTrack person={person} />

                {nextPending && (
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-[#fffbeb] px-3.5 py-2.5">
                    <div className="flex min-w-0 flex-1 items-center gap-2.5">
                      <StampIcon className="size-4 text-amber-700" />
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-cu-ink">
                          Awaiting Sign-off:
                        </p>
                        <p className="truncate text-xs text-cu-body-text">
                          {nextPending} {pendingModuleName || "Verification"}
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
      </PageContent>

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
    </>
  );
}
