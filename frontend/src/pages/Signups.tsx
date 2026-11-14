/**
 * Sign-ups directory for coordinators/admins.
 *
 * Uses the unified CU-OS command layout: emerald search & segment filter band,
 * collapsible registration & PDPA telemetry bar, uniform registration cards,
 * and a full-record drawer/modal with intake details and CSV export.
 */

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { get } from "../api/client";
import type { ConsentRecord, Person } from "../api/types";
import {
  CheckCircleIcon,
  DownloadIcon,
  PhoneIcon,
  RefreshIcon,
  WhatsAppIcon,
} from "../components/icons";
import {
  Banner,
  EmeraldBand,
  EmeraldSearch,
  FilterPill,
  PageContent,
  RosterHeader,
  Spinner,
  TelemetryBar,
  TelemetryStat,
  inputClass,
} from "../components/ui";

const INTEREST_LABELS: Record<string, string> = {
  coffee: "Kopi brewing",
  exercise_hosting: "Community workouts",
  digital_support: "Digital support",
  soundtech: "Sound tech",
  facilitation: "Facilitation",
  other: "Other",
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

const HEALTH_LABELS: Record<string, string> = {
  heart_blood_pressure: "Heart / BP",
  epilepsy_seizures: "Epilepsy / Seizures / Dizziness",
  joint_balance_mobility: "Joint / Balance",
  asthma_respiratory: "Asthma / Breathing",
  heat_grip_sensitivity: "Grip / Heat Sensitivity",
  allergies: "Allergies",
  other: "Other Condition",
};

const SOURCE_LABELS: Record<string, string> = {
  self: "Self-registered",
  assisted: "Assisted",
  admin: "Admin",
  whatsapp: "WhatsApp",
  import: "Imported",
};

const CONSENT_LABELS: Record<string, string> = {
  participation: "Participation & PDPA",
  health_safety_declaration: "Health & safety declaration",
  whatsapp_messaging: "WhatsApp updates",
  photo_media: "Photo & media",
};

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "CU";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

function formatCuId(id: number): string {
  return `CU-${String(id).padStart(4, "0")}`;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-SG", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Singapore",
  });
}

function formatTimeHHMM(value: string): string {
  return value.slice(0, 5);
}

function hasGrantedConsent(person: Person, consentType: string): boolean {
  return (person.consents ?? []).some(
    (c) => c.consent_type === consentType && c.granted,
  );
}

function getMobilityBadge(person: Person): string | null {
  if (person.requires_pmd) return "PMD Required";
  if (person.mobility_aid && person.mobility_aid !== "none") {
    return MOBILITY_LABELS[person.mobility_aid] ?? person.mobility_aid;
  }
  return null;
}

function formatAvailability(person: Person): string {
  const slots = person.availability ?? [];
  if (slots.length === 0) return "";
  return slots
    .slice()
    .sort((a, b) => a.weekday - b.weekday)
    .map(
      (s) =>
        `${WEEKDAYS[s.weekday] ?? `Day ${s.weekday}`} ${formatTimeHHMM(s.start_time)}–${formatTimeHHMM(s.end_time)}`,
    )
    .join(", ");
}

function csvCell(value: string | number | boolean | null | undefined): string {
  const str = String(value ?? "");
  const safe = /^[=+\-@]/.test(str) ? `'${str}` : str;
  return `"${safe.replaceAll('"', '""')}"`;
}

function downloadCsv(rows: Person[]) {
  const headers = [
    "ID",
    "Signed Up (SGT)",
    "Preferred Name",
    "Full Name",
    "NRIC Last 4",
    "Phone",
    "Email",
    "Age Band",
    "Source",
    "Assisted By",
    "Interests",
    "Availability",
    "Written Languages",
    "Spoken Languages",
    "Mobility",
    "Health Alert",
    "Health Conditions",
    "Health Notes",
    "Emergency Contact",
    "Emergency Phone",
    "Emergency Relationship",
    "Grassroots",
    "Grassroots Organisation",
    "WhatsApp Consent",
    "Photo Consent",
    "Tier",
  ];

  const lines = [
    headers.map(csvCell).join(","),
    ...rows.map((p) => {
      const mobility = getMobilityBadge(p) ?? "None";
      const healthList = (p.health_conditions ?? [])
        .map((c) => HEALTH_LABELS[c] ?? c)
        .join("; ");
      const interests = p.interests
        .map((i) => INTEREST_LABELS[i] ?? i)
        .join("; ");
      const written = (p.written_languages ?? [])
        .map((l) => LANGUAGE_LABELS[l] ?? l)
        .join("; ");
      const spoken = (p.spoken_languages ?? [])
        .map((l) => LANGUAGE_LABELS[l] ?? l)
        .join("; ");

      return [
        p.id,
        formatDateTime(p.created_at),
        p.preferred_name,
        p.full_name ?? "",
        p.nric_last4 ?? "",
        p.phone_e164,
        p.email ?? "",
        p.age_band ?? "",
        SOURCE_LABELS[p.registration_source] ?? p.registration_source,
        p.assisted_by ?? "",
        interests,
        formatAvailability(p),
        written,
        spoken,
        mobility,
        p.has_health_conditions ? "Yes" : "No",
        healthList,
        p.health_notes ?? "",
        p.emergency_contact_name ?? "",
        p.emergency_contact_phone ?? "",
        p.emergency_contact_relationship ?? "",
        p.is_grassroots_volunteer ? "Yes" : "No",
        p.grassroots_organisation ?? "",
        hasGrantedConsent(p, "whatsapp_messaging") ? "Yes" : "No",
        hasGrantedConsent(p, "photo_media") ? "Yes" : "No",
        p.tier?.tier_label ?? "Registered",
      ]
        .map(csvCell)
        .join(",");
    }),
  ];

  const blob = new Blob([lines.join("\r\n")], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `community-unlimited-signups-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function ConsentBadge({ consent }: { consent: ConsentRecord }) {
  const label = CONSENT_LABELS[consent.consent_type] ?? consent.consent_type;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-semibold ${
        consent.granted
          ? "border-cu-green/30 bg-cu-green-tint text-cu-green"
          : "border-cu-border bg-cu-line-soft text-cu-body-text"
      }`}
    >
      <span
        aria-hidden="true"
        className={`size-1.5 rounded-full ${
          consent.granted ? "bg-cu-green" : "bg-cu-muted"
        }`}
      />
      {label}: {consent.granted ? "Granted" : "Declined"}
    </span>
  );
}

type SegmentKey =
  | "all"
  | "whatsapp"
  | "needs_support"
  | "recent"
  | "assisted"
  | "grassroots";

export default function Signups() {
  const [search, setSearch] = useState("");
  const [interestFilter, setInterestFilter] = useState("");
  const [segmentFilter, setSegmentFilter] = useState<SegmentKey>("all");
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest" | "name">(
    "newest",
  );
  const [telemetryOpen, setTelemetryOpen] = useState(false);
  const [selectedPerson, setSelectedPerson] = useState<Person | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const {
    data: people,
    isLoading,
    isFetching,
    error,
    refetch,
  } = useQuery({
    queryKey: ["signups"],
    queryFn: () => get<Person[]>("/api/people?sort=newest&limit=5000"),
  });

  const stats = useMemo(() => {
    const list = people ?? [];
    const sevenDaysAgo = nowMs - 7 * 24 * 60 * 60 * 1000;
    let recent = 0;
    let whatsappOk = 0;
    let needsSupport = 0;
    let assisted = 0;
    let grassroots = 0;

    for (const p of list) {
      if (new Date(p.created_at).getTime() >= sevenDaysAgo) recent += 1;
      if (hasGrantedConsent(p, "whatsapp_messaging")) whatsappOk += 1;
      if (p.has_health_conditions || getMobilityBadge(p) !== null) {
        needsSupport += 1;
      }
      if (p.assisted_registration || p.registration_source === "assisted") {
        assisted += 1;
      }
      if (p.is_grassroots_volunteer) grassroots += 1;
    }

    return {
      total: list.length,
      recent,
      whatsappOk,
      needsSupport,
      assisted,
      grassroots,
    };
  }, [people, nowMs]);

  const filtered = useMemo(() => {
    const list = people ?? [];
    const q = search.trim().toLowerCase();
    const sevenDaysAgo = nowMs - 7 * 24 * 60 * 60 * 1000;

    const matched = list.filter((p) => {
      if (q) {
        const haystack = [
          p.preferred_name,
          p.full_name ?? "",
          p.phone_e164,
          p.nric_last4 ?? "",
          p.email ?? "",
          p.home_zone ?? "",
          p.home_precinct ?? "",
          formatCuId(p.id),
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }

      if (interestFilter && !p.interests.includes(interestFilter)) {
        return false;
      }

      switch (segmentFilter) {
        case "whatsapp":
          return hasGrantedConsent(p, "whatsapp_messaging");
        case "needs_support":
          return p.has_health_conditions || getMobilityBadge(p) !== null;
        case "recent":
          return new Date(p.created_at).getTime() >= sevenDaysAgo;
        case "assisted":
          return p.assisted_registration || p.registration_source === "assisted";
        case "grassroots":
          return p.is_grassroots_volunteer;
        default:
          return true;
      }
    });

    const sorted = matched.slice();
    if (sortOrder === "oldest") {
      sorted.sort(
        (a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime() ||
          a.id - b.id,
      );
    } else if (sortOrder === "name") {
      sorted.sort((a, b) =>
        a.preferred_name.localeCompare(b.preferred_name, "en-SG"),
      );
    } else {
      sorted.sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime() ||
          b.id - a.id,
      );
    }
    return sorted;
  }, [people, search, interestFilter, segmentFilter, sortOrder, nowMs]);

  if (isLoading) {
    return <Spinner label="Loading sign-ups" />;
  }

  return (
    <>
      <EmeraldBand>
        <EmeraldSearch
          value={search}
          onChange={setSearch}
          label="Search sign-ups"
          placeholder="Search sign-ups by name, phone, NRIC, or email..."
        />

        <div
          role="tablist"
          aria-label="Filter sign-ups"
          className="mt-3 flex gap-2 overflow-x-auto pb-1"
        >
          <FilterPill
            active={segmentFilter === "all"}
            onClick={() => setSegmentFilter("all")}
            label="All"
            count={stats.total}
          />
          <FilterPill
            active={segmentFilter === "needs_support"}
            onClick={() => setSegmentFilter("needs_support")}
            label="Health / Mobility"
            count={stats.needsSupport}
            tone="amber"
            icon={
              <span
                aria-hidden="true"
                className={`size-2 rounded-full ${
                  segmentFilter === "needs_support"
                    ? "bg-cu-emerald"
                    : "bg-amber-400"
                }`}
              />
            }
          />
          <FilterPill
            active={segmentFilter === "whatsapp"}
            onClick={() => setSegmentFilter("whatsapp")}
            label="WhatsApp OK"
            count={stats.whatsappOk}
            tone="green"
            icon={
              <CheckCircleIcon
                className={`size-3.5 ${
                  segmentFilter === "whatsapp" ? "text-white" : "text-emerald-300"
                }`}
              />
            }
          />
          <FilterPill
            active={segmentFilter === "recent"}
            onClick={() => setSegmentFilter("recent")}
            label="Last 7 Days"
            count={stats.recent}
          />
          <FilterPill
            active={segmentFilter === "assisted"}
            onClick={() => setSegmentFilter("assisted")}
            label="Assisted"
            count={stats.assisted}
          />
          <FilterPill
            active={segmentFilter === "grassroots"}
            onClick={() => setSegmentFilter("grassroots")}
            label="Grassroots"
            count={stats.grassroots}
          />
        </div>
      </EmeraldBand>

      <PageContent>
        <TelemetryBar
          title="Sign-up Directory & PDPA Telemetry"
          open={telemetryOpen}
          onToggle={() => setTelemetryOpen((v) => !v)}
        >
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              <TelemetryStat label="Total sign-ups" value={stats.total} />
              <TelemetryStat
                label="Last 7 days"
                value={stats.recent}
                tone="teal"
                hint="Recent registrations"
              />
              <TelemetryStat
                label="WhatsApp opted in"
                value={stats.whatsappOk}
                tone="green"
                hint="Can receive invites"
              />
              <TelemetryStat
                label="Health / mobility"
                value={stats.needsSupport}
                tone={stats.needsSupport > 0 ? "amber" : undefined}
                hint="Review before sessions"
              />
            </div>

            <div className="flex flex-wrap items-end justify-between gap-3 rounded-xl border border-cu-line-soft bg-[#f8fafb] p-3.5">
              <label className="min-w-[200px] flex-1">
                <span className="mb-1 block text-xs font-bold uppercase tracking-[0.06em] text-cu-body-text">
                  Filter by Interest
                </span>
                <select
                  className={`${inputClass} !py-2 !text-sm`}
                  value={interestFilter}
                  onChange={(e) => setInterestFilter(e.target.value)}
                >
                  <option value="">All interests</option>
                  {Object.entries(INTEREST_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setNowMs(Date.now());
                    refetch();
                  }}
                  disabled={isFetching}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-cu-border-strong bg-white px-3.5 py-2 text-xs font-semibold text-cu-teal-ink transition hover:bg-cu-teal-tint disabled:opacity-50"
                >
                  <RefreshIcon className={isFetching ? "animate-spin" : ""} />
                  {isFetching ? "Refreshing…" : "Refresh"}
                </button>
                <button
                  type="button"
                  onClick={() => downloadCsv(filtered)}
                  disabled={filtered.length === 0}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-cu-teal-ink px-3.5 py-2 text-xs font-bold text-white transition hover:brightness-110 disabled:opacity-50"
                >
                  <DownloadIcon />
                  Export CSV ({filtered.length})
                </button>
              </div>
            </div>
          </div>
        </TelemetryBar>

        {error && <Banner tone="red">{(error as Error).message}</Banner>}

        <RosterHeader
          title="Registrations"
          countLabel={`${filtered.length} shown`}
          right={
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => downloadCsv(filtered)}
                disabled={filtered.length === 0}
                className="inline-flex items-center gap-1.5 rounded-xl border border-cu-border-strong bg-cu-surface px-3 py-1.5 text-xs font-semibold text-cu-teal-ink transition hover:bg-cu-teal-tint disabled:opacity-50"
              >
                <DownloadIcon />
                CSV
              </button>
              <label className="flex items-center gap-2 text-xs text-cu-body-text sm:text-sm">
                <span>Sort:</span>
                <select
                  value={sortOrder}
                  onChange={(e) =>
                    setSortOrder(
                      e.target.value as "newest" | "oldest" | "name",
                    )
                  }
                  className="rounded-xl border border-cu-border-strong bg-cu-surface px-3 py-1.5 text-xs font-semibold text-cu-ink focus:border-cu-teal-ink focus:outline-none sm:text-sm"
                >
                  <option value="newest">Newest First</option>
                  <option value="oldest">Oldest First</option>
                  <option value="name">Name (A–Z)</option>
                </select>
              </label>
            </div>
          }
        />

        <section aria-label="Registrations list" className="flex flex-col gap-3.5">
          {filtered.map((person) => {
            const mobilityBadge = getMobilityBadge(person);
            const whatsappGranted = hasGrantedConsent(
              person,
              "whatsapp_messaging",
            );
            const photoGranted = hasGrantedConsent(person, "photo_media");
            const availabilityText = formatAvailability(person);
            const hasAlert =
              person.has_health_conditions || mobilityBadge !== null;
            const sourceLabel =
              SOURCE_LABELS[person.registration_source] ??
              person.registration_source;

            const avatarTone = hasAlert
              ? "bg-[#d97706]"
              : whatsappGranted
                ? "bg-[#0e6e68]"
                : "bg-[#475569]";
            const dotTone = hasAlert
              ? "bg-amber-400"
              : whatsappGranted
                ? "bg-emerald-500"
                : "bg-slate-400";
            const cardBorder = hasAlert
              ? "border-amber-300/90"
              : person.tier?.deployable
                ? "border-emerald-200"
                : "border-cu-border";

            const locationText = person.home_precinct || person.home_zone;
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
                        {locationText && (
                          <span aria-hidden="true" className="text-cu-muted">
                            •
                          </span>
                        )}
                        <span className="text-cu-body-text">
                          {sourceLabel}
                          {person.assisted_by ? ` (${person.assisted_by})` : ""}
                        </span>
                      </p>
                      <p className="mt-0.5 text-[11px] text-cu-muted">
                        Signed up {formatDateTime(person.created_at)}
                        {person.age_band ? ` · Age ${person.age_band}` : ""}
                      </p>
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span
                      className={`rounded-lg border px-2.5 py-0.5 text-xs font-bold ${
                        person.tier?.deployable
                          ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                          : "border-cu-border bg-cu-line-soft text-cu-body-text"
                      }`}
                    >
                      {person.tier?.tier_label ?? "Registered"}
                    </span>
                    <span className="text-[11px] font-medium tabular-nums text-cu-muted">
                      {formatCuId(person.id)}
                      {person.nric_last4 ? ` · •••${person.nric_last4}` : ""}
                    </span>
                  </div>
                </div>

                {/* Consent & safety pills */}
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  <span
                    className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold ${
                      whatsappGranted
                        ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                        : "border-cu-border bg-cu-line-soft text-cu-body-text"
                    }`}
                  >
                    {whatsappGranted ? "WhatsApp OK" : "No WhatsApp"}
                  </span>

                  {photoGranted && (
                    <span className="rounded-md border border-cu-teal-edge bg-cu-teal-tint px-2 py-0.5 text-[11px] font-semibold text-cu-teal-ink">
                      Photo OK
                    </span>
                  )}

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

                  {person.is_grassroots_volunteer && (
                    <span className="rounded-md border border-cu-teal-edge bg-cu-teal-tint px-2 py-0.5 text-[11px] font-bold text-cu-teal-ink">
                      Grassroots
                      {person.grassroots_organisation
                        ? `: ${person.grassroots_organisation}`
                        : ""}
                    </span>
                  )}
                </div>

                {/* Inner intake summary box */}
                <div className="mt-3 rounded-xl border border-cu-line-soft bg-[#f8fafb] px-3.5 py-2.5 text-xs text-cu-body-text">
                  <p>
                    <strong className="text-cu-ink">Interests:</strong>{" "}
                    {person.interests.length > 0
                      ? person.interests
                          .map((i) => INTEREST_LABELS[i] ?? i)
                          .join(", ")
                      : "None listed"}
                  </p>
                  {availabilityText && (
                    <p className="mt-1">
                      <strong className="text-cu-ink">Availability:</strong>{" "}
                      {availabilityText}
                    </p>
                  )}
                </div>

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

          {filtered.length === 0 && (
            <p className="rounded-2xl border border-cu-border bg-cu-surface p-8 text-center text-base text-cu-body-text">
              {stats.total === 0
                ? "No sign-ups yet."
                : "No sign-ups match that search or filter."}
            </p>
          )}
        </section>
      </PageContent>

      {selectedPerson && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="signup-modal-title"
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
          onClick={() => setSelectedPerson(null)}
        >
          <div
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-cu-surface p-5 shadow-2xl sm:rounded-2xl sm:p-6"
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
                  id="signup-modal-title"
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
                className="rounded-xl border border-cu-border px-3 py-1.5 text-sm font-semibold text-cu-body-text hover:bg-cu-line-soft"
              >
                Close
              </button>
            </div>

            <div className="mt-4 space-y-4 text-sm text-cu-body-text">
              <div className="grid grid-cols-1 gap-3 rounded-xl border border-cu-line-soft bg-cu-page p-4 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-bold uppercase text-cu-muted">
                    Phone &amp; Email
                  </p>
                  <p className="font-semibold text-cu-ink">
                    {selectedPerson.phone_e164}
                  </p>
                  {selectedPerson.email && (
                    <p className="text-xs text-cu-body-text">
                      {selectedPerson.email}
                    </p>
                  )}
                </div>
                <div>
                  <p className="text-xs font-bold uppercase text-cu-muted">
                    Languages &amp; Area
                  </p>
                  <p className="font-semibold text-cu-ink">
                    Preferred:{" "}
                    {LANGUAGE_LABELS[selectedPerson.preferred_language] ??
                      selectedPerson.preferred_language}
                  </p>
                  {(selectedPerson.home_zone || selectedPerson.home_precinct) && (
                    <p className="text-xs text-cu-body-text">
                      {[selectedPerson.home_zone, selectedPerson.home_precinct]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  )}
                </div>
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

              <div className="space-y-1.5 rounded-xl border border-cu-line-soft bg-[#f8fafb] p-4 text-xs">
                <p className="font-bold uppercase tracking-[0.06em] text-cu-body-text">
                  Safety &amp; Emergency Contact
                </p>
                <p className="text-cu-ink">
                  <strong>Mobility:</strong>{" "}
                  {getMobilityBadge(selectedPerson) ?? "No mobility aid needed"}
                </p>
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
                    <strong>Health note:</strong> {selectedPerson.health_notes}
                  </p>
                )}
                <p className="text-cu-ink">
                  <strong>Emergency contact:</strong>{" "}
                  {selectedPerson.emergency_contact_name
                    ? `${selectedPerson.emergency_contact_name}${
                        selectedPerson.emergency_contact_relationship
                          ? ` (${selectedPerson.emergency_contact_relationship})`
                          : ""
                      } ${selectedPerson.emergency_contact_phone ?? ""}`
                    : "Not provided"}
                </p>
                {selectedPerson.notes && (
                  <p className="text-cu-ink">
                    <strong>Notes:</strong> {selectedPerson.notes}
                  </p>
                )}
              </div>

              <div>
                <p className="mb-2 text-xs font-bold uppercase tracking-[0.06em] text-cu-body-text">
                  PDPA Consents
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {(selectedPerson.consents ?? []).length > 0 ? (
                    (selectedPerson.consents ?? []).map((c) => (
                      <ConsentBadge key={c.consent_type} consent={c} />
                    ))
                  ) : (
                    <span className="text-xs text-cu-body-text">
                      No consent records
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
