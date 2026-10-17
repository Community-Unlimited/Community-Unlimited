/**
 * Asset registry — the site register and its 12-point Site Ready Gate.
 *
 * Read-only here: gates are confirmed from field visits, not toggled from a
 * dashboard. This page answers "which sites, and what's blocking each one" —
 * the same question the Command Centre's Assets live tile points at. 2.2
 * says the authoritative site list may still hold placeholders; nothing here
 * invents a site that isn't in the register.
 */

import { useQuery } from "@tanstack/react-query";
import { get } from "../api/client";
import type { Asset } from "../api/types";
import { Banner, SectionTitle, Spinner } from "../components/ui";

const STATUS_LABEL: Record<string, string> = {
  not_started: "Not started",
  blocked: "Blocked",
  preparing: "Preparing",
  ready: "Ready",
  live: "Live",
  paused: "Paused",
  retired: "Retired",
};

const STATUS_STYLE: Record<string, string> = {
  not_started: "bg-cu-line-soft text-cu-body-text border-cu-border",
  blocked: "bg-cu-red-tint text-cu-red border-cu-red/30",
  preparing: "bg-cu-amber-tint text-cu-amber border-cu-amber/30",
  ready: "bg-cu-teal-tint text-cu-teal-ink border-cu-teal-edge",
  live: "bg-cu-green-tint text-cu-green border-cu-green/30",
  paused: "bg-cu-amber-tint text-cu-amber border-cu-amber/30",
  retired: "bg-cu-line-soft text-cu-muted border-cu-border",
};

// 6.3's checklist — see backend/app/models/asset.py:READINESS_GATES.
const TOTAL_GATES = 12;

function SummaryCell({ label, value, tone }: { label: string; value: number; tone?: "green" }) {
  return (
    <div className="rounded-2xl border border-cu-border bg-cu-panel p-5 shadow-[0_1px_3px_rgba(31,42,46,.07)]">
      <p className="text-cu-caption font-bold uppercase tracking-[0.08em] text-cu-body-text">
        {label}
      </p>
      <p
        className={`mt-2 text-[2.25rem] font-bold leading-none tracking-[-0.015em] tabular-nums ${
          tone === "green" ? "text-cu-green" : "text-cu-ink"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

export default function Assets() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["assets"],
    queryFn: () => get<Asset[]>("/api/assets"),
  });

  if (isLoading) return <Spinner label="Loading the asset registry" />;
  if (error) return <Banner tone="red">{(error as Error).message}</Banner>;

  const assets = data ?? [];
  const live = assets.filter((a) => a.status === "live").length;
  const allGatesMet = assets.filter((a) => a.is_ready_to_launch).length;

  return (
    <>
      <div>
        <h1 className="text-cu-h1 font-bold leading-[1.15] tracking-[-0.015em] text-cu-emerald">
          Assets
        </h1>
        <p className="mt-1.5 max-w-[70ch] text-[1.0625rem] text-cu-body-text">
          The site register and its 12-point Site Ready Gate. Readiness is 12
          separate checks, not one score — each row shows exactly what is
          still blocking it.
        </p>
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(185px,1fr))] gap-3">
        <SummaryCell label="Registered sites" value={assets.length} />
        <SummaryCell label="Live" value={live} tone="green" />
        <SummaryCell label="All gates met" value={allGatesMet} />
      </div>

      <section aria-labelledby="assets-h">
        <div id="assets-h">
          <SectionTitle rule>Site register</SectionTitle>
        </div>
        <div className="flex flex-col gap-2.5">
          {assets.map((asset) => (
            <div
              key={asset.id}
              className="rounded-2xl border border-cu-border bg-cu-panel px-5 py-4 shadow-[0_1px_3px_rgba(31,42,46,.07)] sm:px-6"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-baseline gap-2">
                    <span className="text-[1.125rem] font-bold text-cu-ink">
                      {asset.name}
                    </span>
                    <span className="text-cu-caption font-bold uppercase tracking-[0.06em] text-cu-body-text">
                      {asset.code}
                    </span>
                  </p>
                  <p className="mt-0.5 text-cu-body text-cu-body-text">
                    {[asset.zone, asset.precinct].filter(Boolean).join(" · ") ||
                      "Zone not yet assigned"}
                  </p>
                </div>
                <span
                  className={`flex-none rounded-full border px-3 py-1 text-cu-caption font-bold ${
                    STATUS_STYLE[asset.status] ?? STATUS_STYLE.not_started
                  }`}
                >
                  {STATUS_LABEL[asset.status] ?? asset.status}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <div className="flex h-2.5 min-w-[120px] max-w-[220px] flex-1 overflow-hidden rounded-full bg-cu-sage">
                  <div
                    className="h-full rounded-full bg-cu-teal-ink"
                    style={{ width: `${Math.round((asset.gates_met / TOTAL_GATES) * 100)}%` }}
                  />
                </div>
                <span className="text-cu-caption font-semibold text-cu-ink tabular-nums">
                  {asset.gates_met} / {TOTAL_GATES} gates met
                </span>
              </div>
              {asset.blockers.length > 0 && (
                <p className="mt-2.5 text-cu-caption text-cu-body-text">
                  <span className="font-bold text-cu-red">Blocking: </span>
                  {asset.blockers.join(" · ")}
                </p>
              )}
            </div>
          ))}
          {assets.length === 0 && (
            <p className="rounded-2xl border border-cu-border bg-cu-panel p-7 text-center text-[1.0625rem] text-cu-body-text">
              No sites registered yet.
            </p>
          )}
        </div>
      </section>
    </>
  );
}
