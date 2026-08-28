/**
 * Shared primitives.
 *
 * Status colour lives here and nowhere else. Every RAG value maps to a
 * pre-verified foreground/background pair, so no component can accidentally
 * put text on the 2.25:1 brand teal or the 1.69:1 deck amber.
 */

import type { ReactNode } from "react";
import type { Severity } from "../api/types";

/* -------------------------------------------------------------------------
 * status
 * ---------------------------------------------------------------------- */

const SEVERITY_STYLES: Record<Severity, string> = {
  red: "bg-cu-red-tint text-cu-red border-cu-red/25",
  amber: "bg-cu-amber-tint text-cu-amber border-cu-amber/25",
  green: "bg-cu-green-tint text-cu-green border-cu-green/25",
};

const SEVERITY_LABEL: Record<Severity, string> = {
  red: "Action required",
  amber: "Watch",
  green: "On track",
};

export function SeverityBadge({
  severity,
  label,
}: {
  severity: Severity;
  label?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-cu-caption font-semibold uppercase tracking-wide ${SEVERITY_STYLES[severity]}`}
    >
      {/* Shape as well as colour - colour alone is not an accessible signal. */}
      <span aria-hidden="true">
        {severity === "red" ? "●" : severity === "amber" ? "▲" : "✓"}
      </span>
      {label ?? SEVERITY_LABEL[severity]}
    </span>
  );
}

/* -------------------------------------------------------------------------
 * layout
 * ---------------------------------------------------------------------- */

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-cu-lg border border-cu-line bg-cu-surface p-5 ${className}`}
    >
      {children}
    </div>
  );
}

export function SectionTitle({
  children,
  hint,
}: {
  children: ReactNode;
  hint?: string;
}) {
  return (
    <div className="mb-4">
      <h2 className="font-display text-cu-h2 leading-tight text-cu-ink">
        {children}
      </h2>
      {hint && <p className="mt-1 text-cu-body text-cu-body-text">{hint}</p>}
    </div>
  );
}

/** Big number tile for the Command Centre. */
export function StatTile({
  label,
  value,
  target,
  caption,
  severity,
}: {
  label: string;
  value: number | string;
  target?: number | string;
  caption?: string;
  severity?: Severity;
}) {
  const accent =
    severity === "red"
      ? "text-cu-red"
      : severity === "amber"
        ? "text-cu-amber"
        : severity === "green"
          ? "text-cu-green"
          : "text-cu-ink";
  return (
    <Card className="flex flex-col justify-between">
      <p className="text-cu-caption font-semibold uppercase tracking-wide text-cu-body-text">
        {label}
      </p>
      <p className="mt-2 flex items-baseline gap-2">
        <span className={`font-display text-cu-h1 leading-none ${accent}`}>
          {value}
        </span>
        {target !== undefined && (
          <span className="text-cu-body text-cu-muted">of {target}</span>
        )}
      </p>
      {caption && <p className="mt-2 text-cu-caption text-cu-body-text">{caption}</p>}
    </Card>
  );
}

/** Progress bar with an accessible role and text alternative. */
export function Meter({
  value,
  max,
  label,
  tone = "teal",
}: {
  value: number;
  max: number;
  label: string;
  tone?: "teal" | "red" | "green";
}) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  const fill =
    tone === "red"
      ? "bg-cu-red"
      : tone === "green"
        ? "bg-cu-green"
        : "bg-cu-teal-ink";
  return (
    <div>
      <div className="mb-1 flex justify-between text-cu-caption text-cu-body-text">
        <span>{label}</span>
        <span className="font-semibold tabular-nums">
          {value} / {max} ({pct}%)
        </span>
      </div>
      <div
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-label={`${label}: ${value} of ${max}`}
        className="h-2.5 w-full overflow-hidden rounded-full bg-cu-line-soft"
      >
        <div className={`h-full rounded-full ${fill}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------
 * controls
 * ---------------------------------------------------------------------- */

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
};

export function Button({
  variant = "primary",
  className = "",
  ...rest
}: ButtonProps) {
  // Slide 25: "orange signals every primary action" - using the accessible
  // orange, since the raw #EA5C2A cannot carry white text.
  const styles = {
    primary: "bg-cu-orange-ink text-white hover:brightness-110",
    secondary:
      "bg-cu-teal-ink text-white hover:brightness-110",
    ghost:
      "bg-transparent text-cu-teal-ink border border-cu-line hover:bg-cu-teal-tint",
    danger: "bg-cu-red text-white hover:brightness-110",
  }[variant];

  return (
    <button
      className={`tap-target inline-flex items-center justify-center gap-2 rounded-cu px-5 py-2.5 text-cu-body font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${styles} ${className}`}
      {...rest}
    />
  );
}

export function Field({
  label,
  hint,
  error,
  required,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-cu-body font-semibold text-cu-ink">
        {label}
        {required && (
          <span className="text-cu-red" aria-label="required">
            {" "}
            *
          </span>
        )}
      </span>
      {hint && <span className="mb-1.5 block text-cu-caption text-cu-body-text">{hint}</span>}
      {children}
      {error && (
        <span role="alert" className="mt-1 block text-cu-caption font-semibold text-cu-red">
          {error}
        </span>
      )}
    </label>
  );
}

export const inputClass =
  "tap-target w-full rounded-cu border border-cu-line bg-cu-surface px-4 py-3 text-cu-body text-cu-ink placeholder:text-cu-muted focus:border-cu-teal-ink";

export function Banner({
  tone,
  children,
}: {
  tone: Severity;
  children: ReactNode;
}) {
  return (
    <div
      role={tone === "red" ? "alert" : "status"}
      className={`rounded-cu border px-4 py-3 text-cu-body ${SEVERITY_STYLES[tone]}`}
    >
      {children}
    </div>
  );
}

export function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <p role="status" className="py-8 text-center text-cu-body text-cu-body-text">
      {label}…
    </p>
  );
}

/** Tier pill: CB1–CB7 progress at a glance. */
export function TierPills({
  completed,
  missing,
  leadership,
  pending,
}: {
  completed: string[];
  missing: string[];
  leadership: string[];
  pending: string[];
}) {
  const all = ["CB1", "CB2", "CB3", "CB4", "CB5", "CB6", "CB7"];
  return (
    <div className="flex flex-wrap gap-1.5">
      {all.map((code) => {
        const isDone = completed.includes(code) || leadership.includes(code);
        const isPending = pending.includes(code);
        const isMissing = missing.includes(code);
        const style = isDone
          ? "bg-cu-green-tint text-cu-green border-cu-green/30"
          : isPending
            ? "bg-cu-amber-tint text-cu-amber border-cu-amber/30"
            : isMissing
              ? "bg-cu-red-tint text-cu-red border-cu-red/25"
              : "bg-cu-line-soft text-cu-body-text border-cu-line";
        const state = isDone
          ? "approved"
          : isPending
            ? "awaiting approval"
            : isMissing
              ? "required, not held"
              : "optional";
        return (
          <span
            key={code}
            title={`${code}: ${state}`}
            className={`rounded-md border px-2 py-0.5 text-cu-caption font-semibold ${style}`}
          >
            {code}
            <span className="sr-only"> {state}</span>
          </span>
        );
      })}
    </div>
  );
}
