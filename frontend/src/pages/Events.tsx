/**
 * Admin event scheduling.
 *
 * Covers both kinds the operation needs: CB module sessions on the locked
 * calendar, and general community events. Both invite and collect
 * acknowledgment over WhatsApp through the same flow.
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
  SeverityBadge,
  Spinner,
  inputClass,
} from "../components/ui";

/** Datetime-local gives us wall-clock text; stamp it as Singapore time. */
function toSgtIso(local: string): string {
  return `${local}:00+08:00`;
}

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString("en-SG", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Singapore",
  });
}

export default function Events() {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selected, setSelected] = useState<number | null>(null);

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
    queryKey: ["enrollments", selected],
    queryFn: () => get<Enrollment[]>(`/api/events/${selected}/enrollments`),
    enabled: selected !== null,
  });

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
      setNotice(`Created "${created.title}".`);
      setTitle("");
      setStart("");
      setEnd("");
      queryClient.invalidateQueries({ queryKey: ["events"] });
      queryClient.invalidateQueries({ queryKey: ["launch-control"] });
    },
    onError: (err) => {
      setNotice(null);
      setError((err as Error).message);
    },
  });

  const enroll = useMutation({
    mutationFn: ({ eventId, personId }: { eventId: number; personId: number }) =>
      post(`/api/events/${eventId}/enroll`, { person_id: personId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["enrollments", selected] });
      queryClient.invalidateQueries({ queryKey: ["events"] });
      queryClient.invalidateQueries({ queryKey: ["launch-control"] });
    },
    onError: (err) => setError((err as Error).message),
  });

  const invite = useMutation({
    mutationFn: (eventId: number) =>
      post<{ queued: number; skipped_no_consent: number }>(
        `/api/events/${eventId}/invite`,
        { send_now: true },
      ),
    onSuccess: (result) => {
      setError(null);
      setNotice(
        `Queued ${result.queued} WhatsApp invite(s).` +
          (result.skipped_no_consent
            ? ` ${result.skipped_no_consent} skipped — no messaging consent.`
            : ""),
      );
      queryClient.invalidateQueries({ queryKey: ["events"] });
    },
    onError: (err) => setError((err as Error).message),
  });

  const mark = useMutation({
    mutationFn: ({
      eventId,
      personId,
      attended,
      outcome,
    }: {
      eventId: number;
      personId: number;
      attended: boolean;
      outcome?: string;
    }) =>
      post(`/api/events/${eventId}/attendance`, {
        person_id: personId,
        attended,
        assessment_outcome: outcome ?? null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["enrollments", selected] });
      queryClient.invalidateQueries({ queryKey: ["launch-control"] });
      setNotice("Attendance recorded. The completion now awaits approval.");
    },
    onError: (err) => setError((err as Error).message),
  });

  if (events.isLoading) return <Spinner label="Loading events" />;

  const chosen = events.data?.find((e) => e.id === selected) ?? null;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-cu-h1 leading-tight text-cu-ink">
          Events &amp; Academy
        </h1>
        <p className="mt-1 text-cu-body text-cu-body-text">
          Training sessions follow the locked calendar: Mon–Wed 0900–1200,
          Thu 1400–1700, one Saturday a month, max 10 per session, no public
          holidays.
        </p>
      </div>

      {error && <Banner tone="red">{error}</Banner>}
      {notice && <Banner tone="green">{notice}</Banner>}

      {/* --- create -------------------------------------------------------- */}
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

      {/* --- list ---------------------------------------------------------- */}
      <section>
        <SectionTitle hint={`${events.data?.length ?? 0} scheduled`}>
          Scheduled
        </SectionTitle>
        <div className="overflow-x-auto rounded-cu-lg border border-cu-line bg-cu-surface">
          <table className="w-full min-w-[52rem] text-left">
            <thead className="border-b border-cu-line bg-cu-line-soft">
              <tr className="text-cu-caption uppercase tracking-wide text-cu-body-text">
                <th className="px-4 py-3 font-semibold">When</th>
                <th className="px-4 py-3 font-semibold">Event</th>
                <th className="px-4 py-3 font-semibold">Module</th>
                <th className="px-4 py-3 font-semibold">Seats</th>
                <th className="px-4 py-3 font-semibold">Replies</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {events.data?.slice(0, 60).map((event) => (
                <tr key={event.id} className="border-b border-cu-line last:border-0">
                  <td className="px-4 py-3 text-cu-body text-cu-ink">
                    {formatWhen(event.starts_at)}
                  </td>
                  <td className="px-4 py-3 text-cu-body text-cu-ink">
                    {event.title}
                    <span className="block text-cu-caption text-cu-body-text">
                      {event.venue}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-cu-body text-cu-body-text">
                    {event.module_code ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-cu-body tabular-nums text-cu-ink">
                    {event.seats_taken}/{event.capacity}
                  </td>
                  <td className="px-4 py-3 text-cu-caption tabular-nums text-cu-body-text">
                    <span className="text-cu-green">{event.acknowledged_yes} yes</span>
                    {" · "}
                    <span className="text-cu-red">{event.acknowledged_no} no</span>
                    {" · "}
                    {event.awaiting_reply} waiting
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-md bg-cu-line-soft px-2 py-1 text-cu-caption font-semibold text-cu-body-text">
                      {event.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        onClick={() => setSelected(event.id)}
                        className="px-3 py-1.5"
                      >
                        Manage
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => invite.mutate(event.id)}
                        disabled={invite.isPending}
                        className="px-3 py-1.5"
                      >
                        Invite
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* --- manage -------------------------------------------------------- */}
      {chosen && (
        <Card>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <SectionTitle hint={`${formatWhen(chosen.starts_at)} · ${chosen.venue}`}>
              {chosen.title}
            </SectionTitle>
            <Button variant="ghost" onClick={() => setSelected(null)} className="px-3 py-1.5">
              Close
            </Button>
          </div>

          <div className="mb-5">
            <Field label="Add someone to this event">
              <select
                className={inputClass}
                defaultValue=""
                onChange={(e) => {
                  if (!e.target.value) return;
                  enroll.mutate({
                    eventId: chosen.id,
                    personId: Number(e.target.value),
                  });
                  e.target.value = "";
                }}
              >
                <option value="">Choose a person…</option>
                {people.data?.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.preferred_name} — {p.phone_e164}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          {enrollments.isLoading ? (
            <Spinner label="Loading attendance" />
          ) : enrollments.data?.length ? (
            <ul className="divide-y divide-cu-line">
              {enrollments.data.map((row) => (
                <li
                  key={row.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <div>
                    <p className="text-cu-body font-semibold text-cu-ink">
                      {row.preferred_name}
                    </p>
                    <p className="text-cu-caption text-cu-body-text">{row.status}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
                      className="px-3 py-1.5"
                      disabled={mark.isPending}
                      onClick={() =>
                        mark.mutate({
                          eventId: chosen.id,
                          personId: row.person_id,
                          attended: true,
                          outcome: chosen.assessment_required ? "pass" : undefined,
                        })
                      }
                    >
                      Attended
                    </Button>
                    <Button
                      variant="ghost"
                      className="px-3 py-1.5"
                      disabled={mark.isPending}
                      onClick={() =>
                        mark.mutate({
                          eventId: chosen.id,
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
            <p className="py-4 text-cu-body text-cu-body-text">
              Nobody enrolled yet.
            </p>
          )}

          {chosen.assessment_required && (
            <p className="mt-4 flex items-center gap-2">
              <SeverityBadge severity="amber" label="Assessment required" />
              <span className="text-cu-caption text-cu-body-text">
                Marking attended records a pass. Completion still needs human
                approval before it counts.
              </span>
            </p>
          )}
        </Card>
      )}
    </div>
  );
}
