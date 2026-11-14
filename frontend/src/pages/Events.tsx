/**
 * Events & Academy.
 *
 * Uses the unified CU-OS command layout: emerald search & session-type
 * filter band, collapsible schedule-creation & calendar telemetry bar,
 * uniform session cards with capacity/RSVP tracks, and inline attendance.
 */

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { get, post } from "../api/client";
import type { Enrollment, Module, Person, ScheduledEvent } from "../api/types";
import {
  CalendarIcon,
  CheckCircleIcon,
  WhatsAppIcon,
} from "../components/icons";
import {
  Banner,
  Button,
  EmeraldBand,
  EmeraldSearch,
  Field,
  FilterPill,
  PageContent,
  RosterHeader,
  Spinner,
  TelemetryBar,
  TelemetryStat,
  inputClass,
} from "../components/ui";

/** datetime-local gives wall-clock text; stamp it as Singapore time. */
const toSgtIso = (local: string) => `${local}:00+08:00`;

const formatWhen = (iso: string) =>
  new Date(iso).toLocaleString("en-SG", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Singapore",
  });

type KindFilter = "all" | "training" | "community" | "briefing";
type SortOption = "upcoming" | "most_enrolled" | "title";

export default function Events() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");
  const [sortBy, setSortBy] = useState<SortOption>("upcoming");
  const [telemetryOpen, setTelemetryOpen] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [picks, setPicks] = useState<Record<number, string>>({});
  const [expanded, setExpanded] = useState<number | null>(null);

  const [title, setTitle] = useState("");
  const [kind, setKind] = useState("training");
  const [moduleCode, setModuleCode] = useState("");
  const [venue, setVenue] = useState("BLCC Culinary Studio");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [capacity, setCapacity] = useState(10);

  const events = useQuery({
    queryKey: ["events"],
    queryFn: () => get<ScheduledEvent[]>("/api/events"),
  });
  const modules = useQuery({
    queryKey: ["modules"],
    queryFn: () => get<Module[]>("/api/modules"),
  });
  const people = useQuery({
    queryKey: ["people"],
    queryFn: () => get<Person[]>("/api/people"),
  });
  const enrollments = useQuery({
    queryKey: ["enrollments", expanded],
    queryFn: () => get<Enrollment[]>(`/api/events/${expanded}/enrollments`),
    enabled: expanded !== null,
  });

  const refresh = (...keys: string[]) => {
    for (const k of keys) queryClient.invalidateQueries({ queryKey: [k] });
  };

  const createEvent = useMutation({
    mutationFn: () =>
      post<ScheduledEvent>("/api/events", {
        title,
        kind,
        module_code: kind === "training" && moduleCode ? moduleCode : null,
        venue,
        starts_at: toSgtIso(start),
        ends_at: toSgtIso(end),
        capacity,
      }),
    onSuccess: (created) => {
      setError(null);
      setNotice(`Created “${created.title}”.`);
      setTitle("");
      setStart("");
      setEnd("");
      setTelemetryOpen(false);
      refresh("events", "launch-control");
    },
    onError: (err) => {
      setNotice(null);
      setError((err as Error).message);
    },
  });

  const enroll = useMutation({
    mutationFn: ({ eventId, personId }: { eventId: number; personId: number }) =>
      post(`/api/events/${eventId}/enroll`, { person_id: personId }),
    onSuccess: () => refresh("events", "enrollments", "launch-control"),
    onError: (err) => setError((err as Error).message),
  });

  const invite = useMutation({
    mutationFn: (eventId: number) =>
      post<{ queued: number; skipped_no_consent: number }>(
        `/api/events/${eventId}/invite`,
        { send_now: true },
      ),
    onSuccess: (r) => {
      setError(null);
      setNotice(
        `Queued ${r.queued} WhatsApp invite(s).` +
          (r.skipped_no_consent
            ? ` ${r.skipped_no_consent} skipped — no messaging consent.`
            : ""),
      );
      refresh("events");
    },
    onError: (err) => setError((err as Error).message),
  });

  const mark = useMutation({
    mutationFn: (v: {
      eventId: number;
      personId: number;
      attended: boolean;
      outcome?: string;
    }) =>
      post(`/api/events/${v.eventId}/attendance`, {
        person_id: v.personId,
        attended: v.attended,
        assessment_outcome: v.outcome ?? null,
      }),
    onSuccess: () => {
      setNotice("Attendance recorded. The completion now awaits approval.");
      refresh("enrollments", "launch-control", "pending-quals", "people");
    },
    onError: (err) => setError((err as Error).message),
  });

  const counts = useMemo(() => {
    const list = events.data ?? [];
    let training = 0;
    let community = 0;
    let briefing = 0;
    let totalSeats = 0;
    let seatsTaken = 0;
    for (const ev of list) {
      if (ev.kind === "training") training += 1;
      else if (ev.kind === "community") community += 1;
      else briefing += 1;
      totalSeats += ev.capacity;
      seatsTaken += ev.seats_taken;
    }
    return {
      all: list.length,
      training,
      community,
      briefing,
      totalSeats,
      seatsTaken,
    };
  }, [events.data]);

  const filteredEvents = useMemo(() => {
    const list = events.data ?? [];
    const q = search.trim().toLowerCase();

    const matched = list.filter((ev) => {
      if (kindFilter !== "all" && ev.kind !== kindFilter) return false;
      if (!q) return true;
      return [ev.title, ev.venue, ev.module_code, ev.kind]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q);
    });

    return [...matched].sort((a, b) => {
      if (sortBy === "most_enrolled") return b.seats_taken - a.seats_taken;
      if (sortBy === "title") return a.title.localeCompare(b.title);
      return new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime();
    });
  }, [events.data, search, kindFilter, sortBy]);

  if (events.isLoading) return <Spinner label="Loading events" />;

  return (
    <>
      <EmeraldBand>
        <EmeraldSearch
          value={search}
          onChange={setSearch}
          label="Search events"
          placeholder="Search sessions by title, venue, or CB module..."
        />

        <div
          role="tablist"
          aria-label="Filter sessions by type"
          className="mt-3 flex gap-2 overflow-x-auto pb-1"
        >
          <FilterPill
            active={kindFilter === "all"}
            onClick={() => setKindFilter("all")}
            label="All Sessions"
            count={counts.all}
          />
          <FilterPill
            active={kindFilter === "training"}
            onClick={() => setKindFilter("training")}
            label="Training"
            count={counts.training}
            tone="green"
            icon={
              <CheckCircleIcon
                className={`size-3.5 ${
                  kindFilter === "training" ? "text-white" : "text-emerald-300"
                }`}
              />
            }
          />
          <FilterPill
            active={kindFilter === "community"}
            onClick={() => setKindFilter("community")}
            label="Community"
            count={counts.community}
            tone="amber"
            icon={
              <span
                aria-hidden="true"
                className={`size-2 rounded-full ${
                  kindFilter === "community" ? "bg-cu-emerald" : "bg-amber-400"
                }`}
              />
            }
          />
          <FilterPill
            active={kindFilter === "briefing"}
            onClick={() => setKindFilter("briefing")}
            label="Briefing"
            count={counts.briefing}
          />
        </div>
      </EmeraldBand>

      <PageContent>
        <TelemetryBar
          title="Schedule New Session & Calendar Telemetry"
          open={telemetryOpen}
          onToggle={() => setTelemetryOpen((v) => !v)}
        >
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              <TelemetryStat label="On Calendar" value={counts.all} />
              <TelemetryStat
                label="Training Slots"
                value={counts.training}
                tone="teal"
              />
              <TelemetryStat
                label="Seats Taken"
                value={`${counts.seatsTaken} / ${counts.totalSeats}`}
                tone="green"
              />
              <TelemetryStat
                label="Community Events"
                value={counts.community}
                tone="amber"
              />
            </div>

            <div className="rounded-xl border border-cu-line-soft bg-[#f8fafb] p-4">
              <div className="mb-3">
                <h2 className="text-sm font-bold text-cu-ink">
                  Schedule an event
                </h2>
                <p className="text-xs text-cu-body-text">
                  Locked calendar: Mon–Wed 0900–1200, Thu 1400–1700, one
                  Saturday a month, max 10 a session, no public holidays.
                </p>
              </div>
              <form
                className="grid gap-3.5 md:grid-cols-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  createEvent.mutate();
                }}
              >
                <Field label="Title" required>
                  <input
                    className={inputClass}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    required
                  />
                </Field>
                <Field label="Type">
                  <select
                    className={inputClass}
                    value={kind}
                    onChange={(e) => setKind(e.target.value)}
                  >
                    <option value="training">Training (CB module)</option>
                    <option value="community">Community event</option>
                    <option value="briefing">Briefing</option>
                  </select>
                </Field>
                {kind === "training" && (
                  <Field
                    label="Module"
                    hint="Leave blank to keep the slot unassigned."
                  >
                    <select
                      className={inputClass}
                      value={moduleCode}
                      onChange={(e) => setModuleCode(e.target.value)}
                    >
                      <option value="">Not assigned yet</option>
                      {modules.data?.map((m) => (
                        <option key={m.code} value={m.code}>
                          {m.code} — {m.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                )}
                <Field label="Venue" required>
                  <input
                    className={inputClass}
                    value={venue}
                    onChange={(e) => setVenue(e.target.value)}
                    required
                  />
                </Field>
                <Field label="Starts (Singapore time)" required>
                  <input
                    type="datetime-local"
                    className={inputClass}
                    value={start}
                    onChange={(e) => setStart(e.target.value)}
                    required
                  />
                </Field>
                <Field label="Ends (Singapore time)" required>
                  <input
                    type="datetime-local"
                    className={inputClass}
                    value={end}
                    onChange={(e) => setEnd(e.target.value)}
                    required
                  />
                </Field>
                <Field label="Capacity">
                  <input
                    type="number"
                    min={1}
                    className={inputClass}
                    value={capacity}
                    onChange={(e) => setCapacity(Number(e.target.value))}
                  />
                </Field>
                <div className="flex items-end">
                  <Button type="submit" disabled={createEvent.isPending}>
                    {createEvent.isPending ? "Creating…" : "Create event"}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        </TelemetryBar>

        {error && <Banner tone="red">{error}</Banner>}
        {notice && (
          <Banner tone="green" onDismiss={() => setNotice(null)}>
            {notice}
          </Banner>
        )}

        <RosterHeader
          title="Scheduled Sessions"
          countLabel={`${filteredEvents.length} shown`}
          right={
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setTelemetryOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-cu-teal-ink px-3 py-1.5 text-xs font-bold text-white transition hover:brightness-110"
              >
                <CalendarIcon className="size-3.5" />
                + Schedule
              </button>
              <label className="flex items-center gap-2 text-xs text-cu-body-text sm:text-sm">
                <span>Sort:</span>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as SortOption)}
                  className="rounded-xl border border-cu-border-strong bg-cu-surface px-3 py-1.5 text-xs font-semibold text-cu-ink focus:border-cu-teal-ink focus:outline-none sm:text-sm"
                >
                  <option value="upcoming">Upcoming First</option>
                  <option value="most_enrolled">Most Enrolled</option>
                  <option value="title">Title (A–Z)</option>
                </select>
              </label>
            </div>
          }
        />

        <section aria-label="Scheduled sessions" className="flex flex-col gap-3.5">
          {filteredEvents.slice(0, 40).map((ev) => {
            const pct = ev.capacity
              ? Math.min(100, Math.round((ev.seats_taken / ev.capacity) * 100))
              : 0;
            const open = expanded === ev.id;
            const isTraining = ev.kind === "training";
            const isCommunity = ev.kind === "community";

            const badgeBg = isTraining
              ? "bg-[#0e6e68]"
              : isCommunity
                ? "bg-[#d97706]"
                : "bg-[#475569]";
            const dotTone = isTraining
              ? "bg-emerald-500"
              : isCommunity
                ? "bg-amber-400"
                : "bg-slate-400";
            const cardBorder = isCommunity
              ? "border-amber-300/90"
              : isTraining
                ? "border-emerald-200"
                : "border-cu-border";
            const kindPill = isTraining
              ? "border-emerald-300 bg-emerald-50 text-emerald-800"
              : isCommunity
                ? "border-amber-300 bg-amber-50 text-amber-800"
                : "border-cu-border bg-cu-line-soft text-cu-body-text";

            return (
              <article
                key={ev.id}
                className={`rounded-2xl border bg-cu-surface p-4 shadow-[0_1px_3px_rgba(31,42,46,0.06)] sm:p-5 ${cardBorder}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <div
                      className={`relative flex size-12 shrink-0 items-center justify-center rounded-2xl text-xs font-extrabold tracking-tight text-white shadow-xs ${badgeBg}`}
                    >
                      {ev.module_code || (isCommunity ? "COM" : "BRF")}
                      <span
                        aria-hidden="true"
                        className={`absolute -right-0.5 -top-0.5 size-3 rounded-full ring-2 ring-white ${dotTone}`}
                      />
                    </div>

                    <div className="min-w-0">
                      <h2 className="text-[1.0625rem] font-bold leading-snug text-cu-ink">
                        {ev.title}
                      </h2>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs sm:text-sm">
                        <span className="font-medium text-cu-teal-ink">
                          {formatWhen(ev.starts_at)}
                        </span>
                        <span aria-hidden="true" className="text-cu-muted">
                          •
                        </span>
                        <span className="text-cu-body-text">{ev.venue}</span>
                      </p>
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span
                      className={`rounded-lg border px-2.5 py-0.5 text-xs font-bold ${kindPill}`}
                    >
                      {ev.module_code ? `${ev.module_code} • ${ev.kind}` : ev.kind}
                    </span>
                    <span className="text-[11px] font-medium tabular-nums text-cu-muted">
                      {ev.seats_taken}/{ev.capacity} seats
                    </span>
                  </div>
                </div>

                {/* Enrolment & WhatsApp RSVP Track */}
                <div className="mt-3.5 rounded-xl border border-cu-line-soft bg-[#f8fafb] px-3.5 py-3">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-medium text-cu-body-text">
                      Enrolment &amp; WhatsApp RSVP
                    </span>
                    <span className="font-bold tabular-nums text-cu-ink">
                      {ev.seats_taken} of {ev.capacity} enrolled ({pct}%)
                    </span>
                  </div>
                  <div className="mt-2 flex h-2 w-full overflow-hidden rounded-full bg-slate-200">
                    <div
                      className={`h-full rounded-full ${
                        pct >= 100 ? "bg-[#d97706]" : "bg-[#0f8a5f]"
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <p className="mt-2 text-xs tabular-nums text-cu-body-text">
                    <span className="font-semibold text-cu-green">
                      {ev.acknowledged_yes} yes
                    </span>
                    {" · "}
                    <span className="font-semibold text-cu-red">
                      {ev.acknowledged_no} no
                    </span>
                    {" · "}
                    <span>{ev.awaiting_reply} awaiting reply</span>
                  </p>
                </div>

                {/* Enrol someone row */}
                <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-cu-line-soft bg-cu-page px-3 py-2">
                  <select
                    aria-label={`Choose a person to enrol in ${ev.title}`}
                    className="min-w-0 flex-1 rounded-lg border border-cu-border-strong bg-white px-3 py-1.5 text-xs font-medium text-cu-ink focus:border-cu-teal-ink focus:outline-none sm:text-sm"
                    value={picks[ev.id] ?? ""}
                    onChange={(e) =>
                      setPicks({ ...picks, [ev.id]: e.target.value })
                    }
                  >
                    <option value="">Add someone to this session…</option>
                    {people.data?.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.preferred_name} — {p.phone_e164}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={!picks[ev.id] || enroll.isPending}
                    onClick={() => {
                      enroll.mutate({
                        eventId: ev.id,
                        personId: Number(picks[ev.id]),
                      });
                      setPicks({ ...picks, [ev.id]: "" });
                    }}
                    className="rounded-xl bg-cu-teal-ink px-3.5 py-1.5 text-xs font-bold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    Enrol
                  </button>
                </div>

                {/* Bottom action row */}
                <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2 border-t border-cu-line-soft pt-3">
                  <button
                    type="button"
                    disabled={invite.isPending}
                    onClick={() => invite.mutate(ev.id)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50/80 px-3 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-50"
                  >
                    <WhatsAppIcon />
                    Send WhatsApp Invites
                  </button>

                  <button
                    type="button"
                    onClick={() => setExpanded(open ? null : ev.id)}
                    className="text-xs font-bold text-cu-teal-ink transition hover:underline sm:text-sm"
                  >
                    {open ? "Hide Attendance ↑" : `Attendance (${ev.seats_taken}) →`}
                  </button>
                </div>

                {open && (
                  <div className="mt-3.5 rounded-xl border border-cu-line-soft bg-[#f8fafb] p-3.5">
                    {enrollments.isLoading ? (
                      <Spinner label="Loading attendance" />
                    ) : enrollments.data?.length ? (
                      <ul className="divide-y divide-cu-border">
                        {enrollments.data.map((row) => (
                          <li
                            key={row.id}
                            className="flex flex-wrap items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
                          >
                            <div>
                              <p className="text-sm font-bold text-cu-ink">
                                {row.preferred_name}
                              </p>
                              <p className="text-xs text-cu-body-text">
                                Status: {row.status}
                              </p>
                            </div>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                disabled={mark.isPending}
                                onClick={() =>
                                  mark.mutate({
                                    eventId: ev.id,
                                    personId: row.person_id,
                                    attended: true,
                                    outcome: ev.assessment_required
                                      ? "pass"
                                      : undefined,
                                  })
                                }
                                className="rounded-xl bg-[#0e6e68] px-3 py-1.5 text-xs font-bold text-white transition hover:brightness-110 disabled:opacity-50"
                              >
                                Attended
                              </button>
                              <button
                                type="button"
                                disabled={mark.isPending}
                                onClick={() =>
                                  mark.mutate({
                                    eventId: ev.id,
                                    personId: row.person_id,
                                    attended: false,
                                  })
                                }
                                className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 disabled:opacity-50"
                              >
                                No show
                              </button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-xs text-cu-body-text">
                        Nobody enrolled yet.
                      </p>
                    )}
                  </div>
                )}
              </article>
            );
          })}

          {filteredEvents.length === 0 && (
            <p className="rounded-2xl border border-cu-border bg-cu-surface p-8 text-center text-base text-cu-body-text">
              No sessions match your current filter.
            </p>
          )}
        </section>
      </PageContent>
    </>
  );
}
