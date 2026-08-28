/**
 * View 1 - Command Centre and Launch Control (16, 15).
 *
 * The Launch Control panel is the point of the screen: it surfaces
 * contradictions rather than celebrating totals. Findings arrive already
 * sorted worst-first from the API.
 */

import { useQuery } from "@tanstack/react-query";
import { get } from "../api/client";
import type { LaunchControl } from "../api/types";
import {
  Banner,
  Card,
  Meter,
  SectionTitle,
  SeverityBadge,
  Spinner,
  StatTile,
} from "../components/ui";

const MILESTONES = [
  { date: "1 Oct 2026", label: "Training starts" },
  { date: "31 Jan 2027", label: "Training window ends" },
  { date: "6–7 Feb 2027", label: "CNY 2027 — 300 target" },
  { date: "31 Mar 2027", label: "All 17 assets live" },
];

export default function CommandCentre() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["launch-control"],
    queryFn: () => get<LaunchControl>("/api/launch-control"),
  });

  if (isLoading) return <Spinner label="Reading the operating picture" />;
  if (error)
    return <Banner tone="red">{(error as Error).message}</Banner>;
  if (!data) return null;

  const h = data.headline;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-cu-h1 leading-tight text-cu-ink">
            Command Centre
          </h1>
          <p className="mt-1 text-cu-body text-cu-body-text">
            Coffee is the first use case. The product is the capacity engine.
          </p>
        </div>
        <SeverityBadge
          severity={data.worst_severity}
          label={
            data.worst_severity === "red"
              ? `${h.red_findings} blocking issue${h.red_findings === 1 ? "" : "s"}`
              : data.worst_severity === "amber"
                ? `${h.amber_findings} to watch`
                : "On track"
          }
        />
      </div>

      {/* --- headline tiles ------------------------------------------------ */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Deployment-ready"
          value={h.deployable}
          target={h.deployable_target}
          caption={`${h.registered} registered`}
          severity={h.deployable >= h.deployable_target ? "green" : "red"}
        />
        <StatTile
          label="CB5 team leaders"
          value={h.cb5_leaders}
          target={h.leader_duties_per_week}
          caption="Weekly leader duties at full rollout"
          severity={h.cb5_leaders >= h.leader_duties_per_week ? "green" : "red"}
        />
        <StatTile
          label="Assets live"
          value={h.assets_live}
          target={h.assets_target}
          caption="Target 31 Mar 2027"
          severity={h.assets_live >= h.assets_target ? "green" : "amber"}
        />
        <StatTile
          label="Learner seats left"
          value={h.learner_seats_remaining}
          target={h.learner_seats_total}
          caption={`${h.training_slots} slots on the locked calendar`}
          severity={h.learner_seat_gap > 0 ? "red" : "green"}
        />
      </div>

      {/* --- meters -------------------------------------------------------- */}
      <Card>
        <div className="grid gap-5 md:grid-cols-3">
          <Meter
            label="Progress to 300 deployment-ready"
            value={h.deployable}
            max={h.deployable_target}
            tone={h.deployable ? "teal" : "red"}
          />
          <Meter
            label="Leader coverage"
            value={h.cb5_leaders}
            max={h.leader_duties_per_week}
            tone={h.cb5_leaders ? "teal" : "red"}
          />
          <Meter
            label="Assets live"
            value={h.assets_live}
            max={h.assets_target}
            tone={h.assets_live ? "teal" : "red"}
          />
        </div>
      </Card>

      {/* --- Launch Control ------------------------------------------------ */}
      <section aria-labelledby="launch-control-heading">
        <div id="launch-control-heading">
          <SectionTitle hint="Its job is not to cheerlead. It asks whether the plan actually works.">
            Launch Control
          </SectionTitle>
        </div>

        <div className="space-y-3">
          {data.findings.map((finding) => (
            <Card key={finding.code}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <h3 className="text-cu-h3 font-semibold text-cu-ink">
                  {finding.title}
                </h3>
                <SeverityBadge severity={finding.severity} />
              </div>
              <p className="mt-2 max-w-3xl text-cu-body text-cu-body-text">
                {finding.detail}
              </p>

              {finding.code === "training_capacity" && (
                <dl className="mt-4 grid gap-3 rounded-cu bg-cu-teal-tint p-4 sm:grid-cols-4">
                  {[
                    ["Seats required", finding.metrics.learner_seats_required],
                    ["Seats available", finding.metrics.total_learner_seats],
                    ["Shortfall", finding.metrics.learner_seat_gap],
                    [
                      "Max completers",
                      finding.metrics.max_people_completing_pathway,
                    ],
                  ].map(([label, value]) => (
                    <div key={String(label)}>
                      <dt className="text-cu-caption font-semibold uppercase tracking-wide text-cu-body-text">
                        {String(label)}
                      </dt>
                      <dd className="font-display text-cu-h2 text-cu-ink tabular-nums">
                        {String(value)}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
            </Card>
          ))}
        </div>
      </section>

      {/* --- timeline ------------------------------------------------------ */}
      <section aria-labelledby="timeline-heading">
        <div id="timeline-heading">
          <SectionTitle>Timeline</SectionTitle>
        </div>
        <Card>
          <ol className="grid gap-4 sm:grid-cols-4">
            {MILESTONES.map((m) => (
              <li key={m.date}>
                <p className="font-display text-cu-h3 text-cu-teal-ink">{m.date}</p>
                <p className="text-cu-body text-cu-body-text">{m.label}</p>
              </li>
            ))}
          </ol>
        </Card>
      </section>

      <p className="text-cu-caption text-cu-muted">
        Generated {new Date(data.generated_at).toLocaleString()}
      </p>
    </div>
  );
}
