/**
 * Sign-ups directory for coordinators/admins.
 *
 * Shows every resident and volunteer registration newest-first with search,
 * segment filters, full intake details (availability, health/mobility notes,
 * emergency contact, PDPA consents), and CSV export.
 */

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { get } from "../api/client";
import type { ConsentRecord, Person } from "../api/types";
import {
  Banner,
  Button,
  Card,
  Field,
  SectionTitle,
  Spinner,
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
  // Prefix formula-leading characters to keep spreadsheet exports safe.
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

function SummaryTile({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: number;
  hint?: string;
  tone?: "teal" | "amber";
}) {
  return (
    <div className="rounded-2xl border border-cu-border bg-cu-panel p-5 shadow-[0_1px_3px_rgba(31,42,46,.07)]">
      <p className="text-cu-caption font-bold uppercase tracking-[0.08em] text-cu-body-text">
        {label}
      </p>
      <p
        className={`mt-2 text-[2.25rem] font-bold leading-none tracking-[-0.015em] tabular-nums ${
          tone === "amber"
            ? "text-cu-amber"
            : tone === "teal"
              ? "text-cu-teal-ink"
              : "text-cu-ink"
        }`}
      >
        {value}
      </p>
      {hint && <p className="mt-1.5 text-cu-caption text-cu-body-text">{hint}</p>}
    </div>
  );
}

function ConsentBadge({ consent }: { consent: ConsentRecord }) {
  const label = CONSENT_LABELS[consent.consent_type] ?? consent.consent_type;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-cu-caption font-semibold ${
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

export default function Signups() {
  const [search, setSearch] = useState("");
  const [interestFilter, setInterestFilter] = useState("");
  const [segmentFilter, setSegmentFilter] = useState("all");
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest" | "name">(
    "newest",
  );
  const [expandedId, setExpandedId] = useState<number | null>(null);
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

    for (const p of list) {
      if (new Date(p.created_at).getTime() >= sevenDaysAgo) recent += 1;
      if (hasGrantedConsent(p, "whatsapp_messaging")) whatsappOk += 1;
      if (p.has_health_conditions || getMobilityBadge(p) !== null) {
        needsSupport += 1;
      }
    }

    return {
      total: list.length,
      recent,
      whatsappOk,
      needsSupport,
    };
  }, [people, nowMs]);

  const filtered = useMemo(() => {
    const list = people ?? [];
    const q = search.trim().toLowerCase();

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
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }

      if (interestFilter && !p.interests.includes(interestFilter)) {
        return false;
      }

      switch (segmentFilter) {
        case "self":
          return !p.assisted_registration && p.registration_source === "self";
        case "assisted":
          return p.assisted_registration || p.registration_source === "assisted";
        case "whatsapp":
          return hasGrantedConsent(p, "whatsapp_messaging");
        case "mobility":
          return getMobilityBadge(p) !== null;
        case "health":
          return p.has_health_conditions;
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
  }, [people, search, interestFilter, segmentFilter, sortOrder]);

  if (isLoading) {
    return <Spinner label="Loading sign-ups" />;
  }

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[1.875rem] font-bold leading-[1.15] tracking-[-0.015em] text-cu-emerald sm:text-cu-h1">
            Sign-ups
          </h1>
          <p className="mt-1.5 max-w-[68ch] text-[1.0625rem] text-cu-body-text">
            Every community registration submitted through the public form or
            assisted sign-up, with availability, safety screening, and PDPA
            consents.
          </p>
        </div>

        <div className="flex w-full flex-wrap items-center gap-2.5 sm:w-auto">
          <Button
            variant="ghost"
            onClick={() => {
              setNowMs(Date.now());
              refetch();
            }}
            disabled={isFetching}
          >
            {isFetching ? "Refreshing..." : "Refresh"}
          </Button>
          <Button
            variant="ghost"
            onClick={() => downloadCsv(filtered)}
            disabled={filtered.length === 0}
          >
            Export CSV ({filtered.length})
          </Button>
          <Link
            to="/register"
            className="tap-target inline-flex items-center justify-center rounded-xl bg-cu-teal-ink px-4 py-2.5 text-cu-body font-semibold text-white hover:bg-cu-emerald"
          >
            Open sign-up form
          </Link>
        </div>
      </div>

      {error && <Banner tone="red">{(error as Error).message}</Banner>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryTile label="Total sign-ups" value={stats.total} />
        <SummaryTile
          label="Last 7 days"
          value={stats.recent}
          tone="teal"
          hint="Recent registrations"
        />
        <SummaryTile
          label="WhatsApp opted in"
          value={stats.whatsappOk}
          hint="Can receive session invites"
        />
        <SummaryTile
          label="Health / mobility noted"
          value={stats.needsSupport}
          tone={stats.needsSupport > 0 ? "amber" : undefined}
          hint="Review before sessions"
        />
      </div>

      <Card>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Search sign-ups">
            <input
              className={inputClass}
              placeholder="Name, phone, NRIC, or email"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </Field>

          <Field label="Interest">
            <select
              className={inputClass}
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
          </Field>

          <Field label="Segment">
            <select
              className={inputClass}
              value={segmentFilter}
              onChange={(e) => setSegmentFilter(e.target.value)}
            >
              <option value="all">All sign-ups</option>
              <option value="self">Self-registered</option>
              <option value="assisted">Assisted registration</option>
              <option value="whatsapp">WhatsApp opted in</option>
              <option value="mobility">PMD / mobility aid</option>
              <option value="health">Health alert flagged</option>
              <option value="grassroots">Grassroots volunteer</option>
            </select>
          </Field>

          <Field label="Sort by">
            <select
              className={inputClass}
              value={sortOrder}
              onChange={(e) =>
                setSortOrder(e.target.value as "newest" | "oldest" | "name")
              }
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="name">Name (A–Z)</option>
            </select>
          </Field>
        </div>

        <p className="mt-3.5 text-cu-body text-cu-body-text">
          Showing <strong>{filtered.length}</strong> of{" "}
          <strong>{stats.total}</strong> sign-ups
        </p>
      </Card>

      <section aria-labelledby="signups-list-h">
        <div id="signups-list-h">
          <SectionTitle rule>Registrations ({filtered.length})</SectionTitle>
        </div>

        <div className="flex flex-col gap-3">
          {filtered.map((person) => {
            const expanded = expandedId === person.id;
            const mobilityBadge = getMobilityBadge(person);
            const whatsappGranted = hasGrantedConsent(
              person,
              "whatsapp_messaging",
            );
            const photoGranted = hasGrantedConsent(person, "photo_media");
            const availabilityText = formatAvailability(person);
            const healthList = (person.health_conditions ?? []).map(
              (c) => HEALTH_LABELS[c] ?? c,
            );
            const sourceLabel =
              SOURCE_LABELS[person.registration_source] ??
              person.registration_source;

            return (
              <article
                key={person.id}
                className="rounded-2xl border border-cu-border bg-cu-surface p-5 shadow-[0_1px_3px_rgba(31,42,46,.07)] sm:p-6"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
                      <h3 className="text-[1.1875rem] font-bold text-cu-emerald">
                        {person.preferred_name}
                      </h3>
                      {person.full_name &&
                        person.full_name.toLowerCase() !==
                          person.preferred_name.toLowerCase() && (
                          <span className="text-cu-body text-cu-body-text">
                            ({person.full_name})
                          </span>
                        )}
                      {person.nric_last4 && (
                        <span className="rounded-md bg-cu-panel px-2 py-0.5 text-cu-caption font-semibold text-cu-ink">
                          NRIC •••{person.nric_last4}
                        </span>
                      )}
                      <a
                        href={`tel:${person.phone_e164}`}
                        className="text-cu-body font-medium text-cu-teal-ink hover:underline"
                      >
                        {person.phone_e164}
                      </a>
                      {person.email && (
                        <span className="text-cu-body text-cu-body-text">
                          {person.email}
                        </span>
                      )}
                    </div>

                    <p className="mt-1 text-cu-caption text-cu-body-text">
                      Signed up{" "}
                      <span className="font-semibold text-cu-ink">
                        {formatDateTime(person.created_at)}
                      </span>{" "}
                      · {sourceLabel}
                      {person.assisted_by ? ` (${person.assisted_by})` : ""}
                      {person.age_band ? ` · Age ${person.age_band}` : ""}
                    </p>

                    <div className="mt-3 flex flex-wrap gap-1.5">
                      <span
                        className={`rounded-md px-2.5 py-0.5 text-cu-caption font-bold ${
                          person.tier?.deployable
                            ? "bg-cu-green-tint text-cu-green"
                            : "bg-cu-panel text-cu-body-text"
                        }`}
                      >
                        {person.tier?.tier_label ?? "Registered"}
                      </span>

                      <span
                        className={`rounded-md border px-2.5 py-0.5 text-cu-caption font-semibold ${
                          whatsappGranted
                            ? "border-cu-green/30 bg-cu-green-tint text-cu-green"
                            : "border-cu-border bg-cu-line-soft text-cu-body-text"
                        }`}
                      >
                        {whatsappGranted ? "WhatsApp OK" : "No WhatsApp"}
                      </span>

                      {photoGranted && (
                        <span className="rounded-md border border-cu-teal-edge bg-cu-teal-tint px-2.5 py-0.5 text-cu-caption font-semibold text-cu-teal-ink">
                          Photo OK
                        </span>
                      )}

                      {mobilityBadge && (
                        <span className="rounded-md border border-cu-amber/30 bg-cu-amber-tint px-2.5 py-0.5 text-cu-caption font-bold text-cu-amber">
                          {mobilityBadge}
                        </span>
                      )}

                      {person.has_health_conditions && (
                        <span className="rounded-md border border-cu-red/30 bg-cu-red-tint px-2.5 py-0.5 text-cu-caption font-bold text-cu-red">
                          Health Alert
                          {healthList.length > 0
                            ? `: ${healthList.join(", ")}`
                            : ""}
                        </span>
                      )}

                      {person.is_grassroots_volunteer && (
                        <span className="rounded-md border border-cu-teal-edge bg-cu-teal-tint px-2.5 py-0.5 text-cu-caption font-bold text-cu-teal-ink">
                          Grassroots
                          {person.grassroots_organisation
                            ? `: ${person.grassroots_organisation}`
                            : ""}
                        </span>
                      )}
                    </div>

                    <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-cu-body text-cu-body-text">
                      <span>
                        <strong className="text-cu-ink">Interests:</strong>{" "}
                        {person.interests.length > 0
                          ? person.interests
                              .map((i) => INTEREST_LABELS[i] ?? i)
                              .join(", ")
                          : "None listed"}
                      </span>
                      {availabilityText && (
                        <span>
                          <strong className="text-cu-ink">Availability:</strong>{" "}
                          {availabilityText}
                        </span>
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    aria-expanded={expanded}
                    onClick={() =>
                      setExpandedId((cur) =>
                        cur === person.id ? null : person.id,
                      )
                    }
                    className="tap-target w-full shrink-0 rounded-xl border border-cu-border bg-cu-mist px-4 py-2 text-cu-body font-semibold text-cu-teal-ink hover:border-cu-teal-ink hover:bg-cu-teal-tint sm:w-auto"
                  >
                    {expanded ? "Hide details" : "Full details"}
                  </button>
                </div>

                {expanded && (
                  <div className="mt-4 grid gap-4 border-t border-cu-line pt-4 sm:grid-cols-2 lg:grid-cols-3">
                    <div>
                      <p className="text-cu-caption font-bold uppercase tracking-[0.07em] text-cu-body-text">
                        Languages &amp; Location
                      </p>
                      <dl className="mt-1.5 space-y-1 text-cu-body text-cu-body-text">
                        <div>
                          <dt className="inline font-semibold text-cu-ink">
                            Preferred:{" "}
                          </dt>
                          <dd className="inline">
                            {LANGUAGE_LABELS[person.preferred_language] ??
                              person.preferred_language}
                          </dd>
                        </div>
                        {person.written_languages &&
                          person.written_languages.length > 0 && (
                            <div>
                              <dt className="inline font-semibold text-cu-ink">
                                Written:{" "}
                              </dt>
                              <dd className="inline">
                                {person.written_languages
                                  .map((l) => LANGUAGE_LABELS[l] ?? l)
                                  .join(", ")}
                              </dd>
                            </div>
                          )}
                        {person.spoken_languages &&
                          person.spoken_languages.length > 0 && (
                            <div>
                              <dt className="inline font-semibold text-cu-ink">
                                Spoken:{" "}
                              </dt>
                              <dd className="inline">
                                {person.spoken_languages
                                  .map((l) => LANGUAGE_LABELS[l] ?? l)
                                  .join(", ")}
                              </dd>
                            </div>
                          )}
                        {(person.home_zone || person.home_precinct) && (
                          <div>
                            <dt className="inline font-semibold text-cu-ink">
                              Area:{" "}
                            </dt>
                            <dd className="inline">
                              {[person.home_zone, person.home_precinct]
                                .filter(Boolean)
                                .join(" · ")}
                            </dd>
                          </div>
                        )}
                      </dl>
                    </div>

                    <div>
                      <p className="text-cu-caption font-bold uppercase tracking-[0.07em] text-cu-body-text">
                        Safety &amp; Emergency Contact
                      </p>
                      <dl className="mt-1.5 space-y-1 text-cu-body text-cu-body-text">
                        <div>
                          <dt className="inline font-semibold text-cu-ink">
                            Mobility:{" "}
                          </dt>
                          <dd className="inline">
                            {mobilityBadge ?? "No mobility aid needed"}
                          </dd>
                        </div>
                        {person.health_notes && (
                          <div>
                            <dt className="inline font-semibold text-cu-ink">
                              Health note:{" "}
                            </dt>
                            <dd className="inline">{person.health_notes}</dd>
                          </div>
                        )}
                        <div>
                          <dt className="inline font-semibold text-cu-ink">
                            Emergency contact:{" "}
                          </dt>
                          <dd className="inline">
                            {person.emergency_contact_name
                              ? `${person.emergency_contact_name}${
                                  person.emergency_contact_relationship
                                    ? ` (${person.emergency_contact_relationship})`
                                    : ""
                                } ${person.emergency_contact_phone ?? ""}`
                              : "Not provided"}
                          </dd>
                        </div>
                        {person.notes && (
                          <div>
                            <dt className="inline font-semibold text-cu-ink">
                              Notes:{" "}
                            </dt>
                            <dd className="inline">{person.notes}</dd>
                          </div>
                        )}
                      </dl>
                    </div>

                    <div>
                      <p className="text-cu-caption font-bold uppercase tracking-[0.07em] text-cu-body-text">
                        PDPA Consents
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {(person.consents ?? []).length > 0 ? (
                          (person.consents ?? []).map((c) => (
                            <ConsentBadge key={c.consent_type} consent={c} />
                          ))
                        ) : (
                          <span className="text-cu-body text-cu-body-text">
                            No consent records
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </article>
            );
          })}

          {filtered.length === 0 && (
            <p className="rounded-2xl border border-cu-border bg-cu-panel p-7 text-center text-[1.0625rem] text-cu-body-text">
              {stats.total === 0
                ? "No sign-ups yet."
                : "No sign-ups match that search or filter."}
            </p>
          )}
        </div>
      </section>
    </>
  );
}
