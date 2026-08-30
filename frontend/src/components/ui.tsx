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
  red: "bg-cu-red-tint text-cu-red border-cu-red/30",
  amber: "bg-cu-amber-tint text-cu-amber border-cu-amber/30",
  green: "bg-cu-green-tint text-cu-green border-cu-green/30",
};

const SEVERITY_DOT: Record<Severity, string> = {
  red: "bg-cu-red",
  amber: "bg-cu-amber",
  green: "bg-cu-green",
};

const SEVERITY_LABEL: Record<Severity, string> = {
  red: "Blocking",
  amber: "Watch",
  green: "On track",
};

export function SeverityBadge({
  severity,
  label,
  size = "sm",
}: {
  severity: Severity;
  label?: string;
  size?: "sm" | "lg";
}) {
  const scale =
    size === "lg"
      ? "gap-2.5 px-4 py-2.5 text-cu-body"
      : "gap-1.5 px-3 py-1 text-cu-caption";
  return (
    <span
      className={`inline-flex flex-none items-center rounded-full border font-bold ${scale} ${SEVERITY_STYLES[severity]}`}
    >
      {/* A dot as well as colour — colour alone is not an accessible signal. */}
      <span
        aria-hidden="true"
        className={`inline-block rounded-full ${size === "lg" ? "size-2.5" : "size-2"} ${SEVERITY_DOT[severity]}`}
      />
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
  tone = "panel",
}: {
  children: ReactNode;
  className?: string;
  /** `panel` sits on the sage field; `surface` is the brighter finding card. */
  tone?: "panel" | "surface";
}) {
  const fill = tone === "surface" ? "bg-cu-surface" : "bg-cu-panel";
  return (
    <div
      className={`rounded-2xl border border-cu-border ${fill} p-5 shadow-[0_1px_3px_rgba(31,42,46,.07)] sm:p-7 ${className}`}
    >
      {children}
    </div>
  );
}

/** Section heading with the teal rule the Command Centre uses. */
export function SectionTitle({
  children,
  hint,
  aside,
  rule = false,
}: {
  children: ReactNode;
  hint?: string;
  aside?: ReactNode;
  rule?: boolean;
}) {
  return (
    <div
      className={`mb-4 flex flex-wrap items-baseline justify-between gap-3 ${
        rule ? "border-b-[3px] border-cu-teal pb-3" : ""
      }`}
    >
      <div>
        <h2 className="text-cu-h2 font-bold leading-tight tracking-[-0.015em] text-cu-emerald">
          {children}
        </h2>
        {hint && <p className="mt-1 text-cu-body text-cu-body-text">{hint}</p>}
      </div>
      {aside}
    </div>
  );
}

/** Compact metric card used in the Command Centre priority row. */
export function StatTile({
  label,
  value,
  target,
  caption,
  severity,
  chip,
}: {
  label: string;
  value: number | string;
  target?: number | string;
  caption?: string;
  severity?: Severity;
  chip?: string;
}) {
  return (
    <div className="flex flex-col justify-between gap-4 rounded-2xl border border-cu-border bg-cu-panel p-5 shadow-[0_1px_3px_rgba(31,42,46,.07)]">
      <div>
        <p className="text-cu-body font-semibold text-cu-ink">{label}</p>
        {caption && (
          <p className="mt-1 text-cu-caption text-cu-body-text">{caption}</p>
        )}
      </div>
      <div>
        <p className="text-[2rem] font-bold leading-none tracking-[-0.015em] text-cu-ink tabular-nums">
          {value}
          {target !== undefined && (
            <span className="text-[1.125rem] font-normal text-cu-body-text">
              {" "}
              / {target}
            </span>
          )}
        </p>
        {chip && severity && (
          <span
            className={`mt-1.5 inline-block rounded-md border px-2 py-0.5 text-cu-caption font-bold ${SEVERITY_STYLES[severity]}`}
          >
            {chip}
          </span>
        )}
      </div>
    </div>
  );
}

/** Progress bar with an accessible role and a text alternative. */
export function Meter({
  value,
  max,
  label,
  tone = "teal",
  right,
}: {
  value: number;
  max: number;
  label: string;
  tone?: "teal" | "red" | "green" | "orange";
  right?: ReactNode;
}) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  const fill = {
    teal: "bg-cu-teal-ink",
    red: "bg-cu-red",
    green: "bg-cu-green",
    orange: "bg-cu-orange",
  }[tone];
  return (
    <div>
      <div
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-label={`${label}: ${value} of ${max}`}
        className="flex h-3.5 w-full overflow-hidden rounded-full bg-cu-sage"
      >
        <div className={`h-full rounded-full ${fill}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-2 flex flex-wrap justify-between gap-3 text-cu-caption text-cu-body-text">
        <span className="font-semibold text-cu-ink">{pct}% there</span>
        {right ?? (
          <span className="tabular-nums">
            {value} / {max}
          </span>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------
 * controls
 * ---------------------------------------------------------------------- */

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "quiet" | "danger";
};

export function Button({
  variant = "primary",
  className = "",
  ...rest
}: ButtonProps) {
  // Slide 25: "orange signals every primary action". The label is emerald-ink
  // rather than white — white on #EA5C2A is 3.46:1 and fails outright.
  const styles = {
    primary: "bg-cu-orange text-cu-emerald-ink hover:brightness-110",
    secondary: "bg-cu-teal-ink text-white hover:brightness-110",
    ghost:
      "border border-cu-border-strong bg-cu-mist text-cu-teal-ink hover:bg-cu-teal-tint hover:border-cu-teal-edge",
    quiet: "bg-transparent text-cu-teal-ink hover:bg-cu-teal-tint",
    danger: "bg-cu-red text-white hover:brightness-110",
  }[variant];

  return (
    <button
      className={`tap-target inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-cu-body font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${styles} ${className}`}
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
      <span className="mb-1.5 block text-cu-body font-semibold text-cu-ink">
        {label}
        {required && (
          <span className="text-cu-red" aria-label="required">
            {" "}
            *
          </span>
        )}
      </span>
      {hint && (
        <span className="mb-1.5 block text-cu-caption text-cu-body-text">{hint}</span>
      )}
      {children}
      {error && (
        <span
          role="alert"
          className="mt-1.5 block text-cu-caption font-semibold text-cu-red"
        >
          {error}
        </span>
      )}
    </label>
  );
}

export const inputClass =
  "tap-target w-full rounded-xl border-[1.5px] border-cu-border-strong bg-cu-surface px-4 py-3 text-cu-body text-cu-ink placeholder:text-cu-muted focus:border-cu-teal-ink";

export function Banner({
  tone,
  children,
  onDismiss,
}: {
  tone: Severity;
  children: ReactNode;
  onDismiss?: () => void;
}) {
  return (
    <div
      role={tone === "red" ? "alert" : "status"}
      className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3.5 text-cu-body font-semibold ${SEVERITY_STYLES[tone]}`}
    >
      <p className="m-0">{children}</p>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="tap-target shrink-0 px-2 text-cu-body font-bold underline"
        >
          Dismiss
        </button>
      )}
    </div>
  );
}

export function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <p role="status" className="py-10 text-center text-cu-body text-cu-body-text">
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
              : "bg-cu-line-soft text-cu-body-text border-cu-border";
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
            className={`rounded-md border px-2 py-0.5 text-cu-caption font-bold ${style}`}
          >
            {code}
            <span className="sr-only"> {state}</span>
          </span>
        );
      })}
    </div>
  );
}
