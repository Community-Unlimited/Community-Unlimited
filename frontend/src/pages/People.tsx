/**
 * View 3 - People pipeline and tier tracking (16).
 *
 * The funnel is deliberately non-linear: 4.1 allows CB1-CB4 in any order, so
 * "missing exactly one module" is a first-class view rather than a stage in a
 * straight line.
 */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { get, post } from "../api/client";
import type { PendingQualification, Person, PipelineSummary } from "../api/types";
import {
  Banner,
  Button,
  Card,
  SectionTitle,
  Spinner,
  StatTile,
  TierPills,
  inputClass,
} from "../components/ui";

const CORE = ["CB1", "CB2", "CB3", "CB4"];
const LEADERSHIP = ["CB5", "CB6", "CB7"];

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
    mutationFn: (row: PendingQualification) =>
      post("/api/qualifications/approve", {
        person_id: row.person_id,
        module_code: row.module_code,
      }),
    onSuccess: (_data, row) => {
      setError(null);
      setNotice(`${row.module_code} approved for ${row.preferred_name}.`);
      queryClient.invalidateQueries({ queryKey: ["pending-quals"] });
      queryClient.invalidateQueries({ queryKey: ["people"] });
      queryClient.invalidateQueries({ queryKey: ["pipeline"] });
      queryClient.invalidateQueries({ queryKey: ["launch-control"] });
    },
    onError: (err) => setError((err as Error).message),
  });

  if (people.isLoading || pipeline.isLoading) return <Spinner label="Loading people" />;

  const summary = pipeline.data;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-cu-h1 leading-tight text-cu-ink">
          People &amp; tiers
        </h1>
        <p className="mt-1 text-cu-body text-cu-body-text">
          CB1–CB4 is the deployment gate. CB5–CB7 is optional leadership
          progression — not everyone is expected to go further.
        </p>
      </div>

      {error && <Banner tone="red">{error}</Banner>}
      {notice && <Banner tone="green">{notice}</Banner>}

      {summary && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile label="Registered" value={summary.registered} />
          <StatTile
            label="Deployment-ready"
            value={summary.deployable}
            target={300}
            severity={summary.deployable ? "green" : "red"}
          />
          <StatTile
            label="Missing one module"
            value={summary.missing_exactly_one_module.length}
            caption="Closest to deployable"
            severity="amber"
          />
          <StatTile
            label="In the Disciple pathway"
            value={summary.disciples}
            caption="Learn it. Do it. Help someone do it."
          />
        </div>
      )}

      {/* --- funnel -------------------------------------------------------- */}
      {summary && (
        <Card>
          <SectionTitle hint="Approved qualifications only. Pending completions do not count.">
            Pipeline
          </SectionTitle>
          <div className="grid gap-3 sm:grid-cols-4 lg:grid-cols-7">
            {[...CORE, ...LEADERSHIP].map((code) => {
              const count = summary.by_module[code] ?? 0;
              const isCore = CORE.includes(code);
              return (
                <div
                  key={code}
                  className={`rounded-cu border p-3 ${
                    isCore
                      ? "border-cu-teal-edge bg-cu-teal-tint"
                      : "border-cu-line bg-cu-line-soft"
                  }`}
                >
                  <p className="text-cu-caption font-semibold uppercase tracking-wide text-cu-body-text">
                    {code}
                  </p>
                  <p className="font-display text-cu-h2 tabular-nums text-cu-ink">
                    {count}
                  </p>
                  <p className="text-cu-caption text-cu-body-text">
                    {isCore ? "required" : "leadership"}
                  </p>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* --- approvals ----------------------------------------------------- */}
      {pending.data && pending.data.length > 0 && (
        <Card>
          <SectionTitle hint="A human approves every qualification. The system never awards one on its own.">
            Awaiting approval
          </SectionTitle>
          <ul className="divide-y divide-cu-line">
            {pending.data.map((row) => (
              <li
                key={row.qualification_id}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <div>
                  <p className="text-cu-body font-semibold text-cu-ink">
                    {row.preferred_name}
                  </p>
                  <p className="text-cu-caption text-cu-body-text">
                    {row.module_code} — {row.module_name}
                  </p>
                </div>
                <Button
                  variant="secondary"
                  className="px-4 py-2"
                  disabled={approve.isPending}
                  onClick={() => approve.mutate(row)}
                >
                  Approve {row.module_code}
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* --- roster -------------------------------------------------------- */}
      <section>
        <SectionTitle>Everyone</SectionTitle>
        <div className="mb-4 flex flex-wrap gap-3">
          <input
            className={`${inputClass} max-w-xs`}
            placeholder="Search name or number"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search people"
          />
          <select
            className={`${inputClass} max-w-xs`}
            value={onlyMissing}
            onChange={(e) => setOnlyMissing(e.target.value)}
            aria-label="Filter by missing module"
          >
            <option value="">All people</option>
            {CORE.map((code) => (
              <option key={code} value={code}>
                Missing {code}
              </option>
            ))}
          </select>
        </div>

        <div className="overflow-x-auto rounded-cu-lg border border-cu-line bg-cu-surface">
          <table className="w-full min-w-[48rem] text-left">
            <thead className="border-b border-cu-line bg-cu-line-soft">
              <tr className="text-cu-caption uppercase tracking-wide text-cu-body-text">
                <th className="px-4 py-3 font-semibold">Name</th>
                <th className="px-4 py-3 font-semibold">Tier</th>
                <th className="px-4 py-3 font-semibold">Modules</th>
                <th className="px-4 py-3 font-semibold">Next</th>
              </tr>
            </thead>
            <tbody>
              {people.data?.map((person) => (
                <tr key={person.id} className="border-b border-cu-line last:border-0">
                  <td className="px-4 py-3">
                    <p className="text-cu-body font-semibold text-cu-ink">
                      {person.preferred_name}
                    </p>
                    <p className="text-cu-caption text-cu-body-text">
                      {person.phone_e164}
                      {person.assisted_registration && " · assisted"}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-md px-2 py-1 text-cu-caption font-semibold ${
                        person.tier?.deployable
                          ? "bg-cu-green-tint text-cu-green"
                          : "bg-cu-line-soft text-cu-body-text"
                      }`}
                    >
                      {person.tier?.tier_label ?? "Registered"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {person.tier && (
                      <TierPills
                        completed={person.tier.core_completed}
                        missing={person.tier.core_missing}
                        leadership={person.tier.leadership_held}
                        pending={person.tier.pending_approval}
                      />
                    )}
                  </td>
                  <td className="px-4 py-3 text-cu-body text-cu-body-text">
                    {person.tier?.next_module ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {people.data?.length === 0 && (
            <p className="px-4 py-8 text-center text-cu-body text-cu-body-text">
              Nobody matches that filter.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
