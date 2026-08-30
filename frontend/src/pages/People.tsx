/**
 * View 3 — People pipeline and tier tracking.
 *
 * Row cards rather than a table: each person carries their CB1–CB7 standing and
 * the one action available on them. The funnel is deliberately non-linear —
 * CB1–CB4 may be taken in any order, so "missing exactly one module" is a
 * first-class filter rather than a stage in a straight line.
 */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { get, post } from "../api/client";
import type { PendingQualification, Person, PipelineSummary } from "../api/types";
import {
  Banner,
  Button,
  Card,
  Field,
  SectionTitle,
  Spinner,
  TierPills,
  inputClass,
} from "../components/ui";

const CORE = ["CB1", "CB2", "CB3", "CB4"];
const LEADERSHIP = ["CB5", "CB6", "CB7"];

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
    <div className="rounded-2xl border border-cu-border bg-cu-panel p-5 shadow-[0_1px_3px_rgba(31,42,46,.07)]">
      <p className="text-cu-caption font-bold uppercase tracking-[0.08em] text-cu-body-text">
        {label}
      </p>
      <p
        className={`mt-2 text-[2.25rem] font-bold leading-none tracking-[-0.015em] tabular-nums ${
          tone === "amber" ? "text-cu-amber" : "text-cu-ink"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

export default function People() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [onlyMissing, setOnlyMissing] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const params = new URLSearchParams();
  if (search.trim()) params.set("search", search.trim());
  if (onlyMissing) params.set("missing_module", onlyMissing);
  const query = params.toString();

  const people = useQuery({
    queryKey: ["people", query],
    queryFn: () => get<Person[]>(`/api/people${query ? `?${query}` : ""}`),
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
      setNotice(`${v.code} approved.`);
      for (const k of ["pending-quals", "people", "pipeline", "launch-control"]) {
        queryClient.invalidateQueries({ queryKey: [k] });
      }
    },
    onError: (err) => setError((err as Error).message),
  });

  if (people.isLoading || pipeline.isLoading)
    return <Spinner label="Loading people" />;

  const summary = pipeline.data;
  const pendingByPerson = new Map<number, string>();
  for (const row of pending.data ?? []) {
    if (!pendingByPerson.has(row.person_id)) {
      pendingByPerson.set(row.person_id, row.module_code);
    }
  }

  return (
    <>
      <div>
        <h1 className="text-cu-h1 font-bold leading-[1.15] tracking-[-0.015em] text-cu-emerald">
          People &amp; tiers
        </h1>
        <p className="mt-1.5 max-w-[70ch] text-[1.0625rem] text-cu-body-text">
          Learn it. Do it. Help someone do it. A human approves every
          qualification — the system never awards one on its own.
        </p>
      </div>

      {error && <Banner tone="red">{error}</Banner>}
      {notice && (
        <Banner tone="green" onDismiss={() => setNotice(null)}>
          {notice}
        </Banner>
      )}

      {summary && (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(185px,1fr))] gap-3">
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
      )}

      {/* --- filters ----------------------------------------------------- */}
      <Card>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] items-end gap-4">
          <Field label="Search people">
            <input
              className={inputClass}
              placeholder="Search name or number"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </Field>
          <Field label="Filter by missing module">
            <select
              className={inputClass}
              value={onlyMissing}
              onChange={(e) => setOnlyMissing(e.target.value)}
            >
              <option value="">All people</option>
              {CORE.map((c) => (
                <option key={c} value={c}>
                  Missing {c}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <p className="mt-3.5 text-cu-body text-cu-body-text">
          Showing {people.data?.length ?? 0} of {summary?.registered ?? 0} ·
          Approved qualifications only. Pending completions do not count.
        </p>
      </Card>

      {/* --- pipeline ---------------------------------------------------- */}
      {summary && (
        <section aria-labelledby="pipeline-h">
          <div id="pipeline-h">
            <SectionTitle rule>Pipeline</SectionTitle>
          </div>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(110px,1fr))] gap-3">
            {[...CORE, ...LEADERSHIP].map((code) => {
              const count = summary.by_module[code] ?? 0;
              const isCore = CORE.includes(code);
              return (
                <div
                  key={code}
                  className={`rounded-xl border p-3.5 ${
                    isCore
                      ? "border-cu-teal-edge bg-cu-teal-tint"
                      : "border-cu-border bg-cu-line-soft"
                  }`}
                >
                  <p className="text-cu-caption font-bold uppercase tracking-[0.08em] text-cu-body-text">
                    {code}
                  </p>
                  <p className="text-cu-h2 font-bold tabular-nums text-cu-ink">
                    {count}
                  </p>
                  <p className="text-cu-caption text-cu-body-text">
                    {isCore ? "required" : "leadership"}
                  </p>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* --- roster ------------------------------------------------------ */}
      <section aria-labelledby="roster-h">
        <div id="roster-h">
          <SectionTitle rule>Everyone</SectionTitle>
        </div>
        <div className="flex flex-col gap-2.5">
          {people.data?.map((person) => {
            const nextPending = pendingByPerson.get(person.id);
            return (
              <div
                key={person.id}
                className="flex flex-wrap items-center justify-between gap-x-5 gap-y-4 rounded-2xl border border-cu-border bg-cu-panel px-5 py-4 shadow-[0_1px_3px_rgba(31,42,46,.07)] sm:px-6"
              >
                <div className="min-w-0 flex-1 basis-[260px]">
                  <div className="flex flex-wrap items-baseline gap-2.5">
                    <p className="text-[1.125rem] font-bold text-cu-ink">
                      {person.preferred_name}
                    </p>
                    <p className="text-cu-body text-cu-body-text">
                      {person.phone_e164}
                    </p>
                    <span
                      className={`rounded-md px-2 py-0.5 text-cu-caption font-bold ${
                        person.tier?.deployable
                          ? "bg-cu-green-tint text-cu-green"
                          : "bg-cu-line-soft text-cu-body-text"
                      }`}
                    >
                      {person.tier?.tier_label ?? "Registered"}
                    </span>
                  </div>
                  {person.tier && (
                    <div className="mt-2.5">
                      <TierPills
                        completed={person.tier.core_completed}
                        missing={person.tier.core_missing}
                        leadership={person.tier.leadership_held}
                        pending={person.tier.pending_approval}
                      />
                    </div>
                  )}
                </div>
                <div className="flex-none">
                  {nextPending ? (
                    <Button
                      variant="secondary"
                      disabled={approve.isPending}
                      onClick={() =>
                        approve.mutate({
                          personId: person.id,
                          code: nextPending,
                        })
                      }
                    >
                      Approve {nextPending}
                    </Button>
                  ) : (
                    <span className="text-cu-body text-cu-body-text">
                      Nothing to approve
                    </span>
                  )}
                </div>
              </div>
            );
          })}
          {people.data?.length === 0 && (
            <p className="rounded-2xl border border-cu-border bg-cu-panel p-7 text-center text-[1.0625rem] text-cu-body-text">
              Nobody matches that filter.
            </p>
          )}
        </div>
      </section>
    </>
  );
}
