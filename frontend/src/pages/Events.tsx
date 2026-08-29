/**
 * Events & Academy.
 *
 * Covers both kinds of scheduling the operation needs: CB module sessions on
 * the locked calendar, and general community events. Both invite and collect
 * acknowledgment over WhatsApp through the same flow, so they share one card.
 */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { get, post } from "../api/client";
import type { Enrollment, Module, Person, ScheduledEvent } from "../api/types";
import {
  Banner,
  Button,
  Card,
  Field,
  SectionTitle,
  Spinner,
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

const KIND_STYLE: Record<string, string> = {
  training: "bg-cu-teal-tint text-cu-teal-ink border-cu-teal-edge",
  community: "bg-cu-orange-tint text-cu-orange-ink border-cu-orange/30",
  briefing: "bg-cu-line-soft text-cu-body-text border-cu-border",
};

export default function Events() {
  const queryClient = useQueryClient();
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

  if (events.isLoading) return <Spinner label="Loading events" />;

  return (
    <>
      <div>
        <h1 className="text-cu-h1 font-bold leading-[1.15] tracking-[-0.015em] text-cu-emerald">
          Events &amp; Academy
        </h1>
        <p className="mt-1.5 max-w-[70ch] text-[1.0625rem] text-cu-body-text">
          Training follows the locked calendar: Mon–Wed 0900–1200, Thu
          1400–1700, one Saturday a month, max 10 a session, no public holidays.
        </p>
      </div>

      {error && <Banner tone="red">{error}</Banner>}
      {notice && (
        <Banner tone="green" onDismiss={() => setNotice(null)}>
          {notice}
        </Banner>
      )}

      {/* --- create ------------------------------------------------------ */}
      <Card>
        <SectionTitle>Schedule an event</SectionTitle>
        <form
          className="grid gap-4 md:grid-cols-2"
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
            <Field label="Module" hint="Leave blank to keep the slot unassigned.">
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
      </Card>

      {/* --- list -------------------------------------------------------- */}
      <section aria-labelledby="sched-h">
        <div id="sched-h">
          <SectionTitle
            rule
            aside={
              <p className="text-cu-body text-cu-body-text">
                {events.data?.length ?? 0} on the calendar
              </p>
            }
          >
            Scheduled
          </SectionTitle>
        </div>

        <div className="flex flex-col gap-3.5">
          {events.data?.slice(0, 40).map((ev) => {
            const pct = ev.capacity
              ? Math.min(100, Math.round((ev.seats_taken / ev.capacity) * 100))
              : 0;
            const open = expanded === ev.id;
            return (
              <article
                key={ev.id}
                className="rounded-2xl border border-cu-border bg-cu-panel p-5 shadow-[0_1px_3px_rgba(31,42,46,.07)] sm:p-6"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-cu-h3 font-bold text-cu-emerald">
                      {ev.title}
                    </h3>
                    <p className="mt-1 text-cu-body text-cu-body-text">
                      {formatWhen(ev.starts_at)} · {ev.venue}
                    </p>
                  </div>
                  <span
                    className={`flex-none rounded-full border px-3 py-1 text-cu-caption font-bold ${
                      KIND_STYLE[ev.kind] ?? KIND_STYLE.briefing
                    }`}
                  >
                    {ev.module_code ?? ev.kind}
                  </span>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <span className="text-cu-body font-bold text-cu-ink">
                    {ev.seats_taken} / {ev.capacity} enrolled
                  </span>
                  <div className="flex h-2.5 min-w-[140px] max-w-[260px] flex-1 overflow-hidden rounded-full bg-cu-sage">
                    <div
                      className="h-full rounded-full bg-cu-teal-ink"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-cu-caption tabular-nums text-cu-body-text">
                    <span className="text-cu-green">{ev.acknowledged_yes} yes</span>
                    {" · "}
                    <span className="text-cu-red">{ev.acknowledged_no} no</span>
                    {" · "}
                    {ev.awaiting_reply} waiting
                  </span>
                  <Button
                    variant="ghost"
                    disabled={invite.isPending}
                    onClick={() => invite.mutate(ev.id)}
                  >
                    Send WhatsApp invites
                  </Button>
                </div>

                <div className="mt-4 flex flex-wrap items-end gap-2.5">
                  <div className="min-w-[220px] flex-1">
                    <Field label="Add someone to this event">
                      <select
                        className={inputClass}
                        value={picks[ev.id] ?? ""}
                        onChange={(e) =>
                          setPicks({ ...picks, [ev.id]: e.target.value })
                        }
                      >
                        <option value="">Choose a person</option>
                        {people.data?.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.preferred_name} — {p.phone_e164}
                          </option>
                        ))}
                      </select>
                    </Field>
                  </div>
                  <Button
                    variant="secondary"
                    disabled={!picks[ev.id] || enroll.isPending}
                    onClick={() => {
                      enroll.mutate({
                        eventId: ev.id,
                        personId: Number(picks[ev.id]),
                      });
                      setPicks({ ...picks, [ev.id]: "" });
                    }}
                  >
                    Enrol
                  </Button>
                  <Button
                    variant="quiet"
                    onClick={() => setExpanded(open ? null : ev.id)}
                  >
                    {open ? "Hide attendance" : "Attendance"}
                  </Button>
                </div>

                {open && (
                  <div className="mt-4 border-t border-cu-border pt-4">
                    {enrollments.isLoading ? (
                      <Spinner label="Loading attendance" />
                    ) : enrollments.data?.length ? (
                      <ul className="divide-y divide-cu-border">
                        {enrollments.data.map((row) => (
                          <li
                            key={row.id}
                            className="flex flex-wrap items-center justify-between gap-3 py-3"
                          >
                            <div>
                              <p className="text-cu-body font-semibold text-cu-ink">
                                {row.preferred_name}
                              </p>
                              <p className="text-cu-caption text-cu-body-text">
                                {row.status}
                              </p>
                            </div>
                            <div className="flex gap-2">
                              <Button
                                variant="secondary"
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
                              >
                                Attended
                              </Button>
                              <Button
                                variant="ghost"
                                disabled={mark.isPending}
                                onClick={() =>
                                  mark.mutate({
                                    eventId: ev.id,
                                    personId: row.person_id,
                                    attended: false,
                                  })
                                }
                              >
                                No show
                              </Button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-cu-body text-cu-body-text">
                        Nobody enrolled yet.
                      </p>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </section>
    </>
  );
}
