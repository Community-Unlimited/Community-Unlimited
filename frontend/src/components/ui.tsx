/**
 * Shared primitives.
 *
 * Status colour lives here and nowhere else. Every RAG value maps to a
 * pre-verified foreground/background pair, so no component can accidentally
 * put text on the 2.25:1 brand teal or the 1.69:1 deck amber.
 */

import type { ReactNode } from "react";
import type { Severity } from "../api/types";
import { ChevronIcon, SearchIcon, TelemetryIcon } from "./icons";

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

/* -------------------------------------------------------------------------
 * CU-OS command layout primitives
 * ---------------------------------------------------------------------- */

/** Full-width emerald command band sitting flush below the sticky header. */
export function EmeraldBand({ children }: { children: ReactNode }) {
  return (
    <section className="w-full bg-cu-emerald text-white shadow-[0_4px_16px_rgba(5,53,49,0.16)]">
      <div className="mx-auto max-w-[1760px] px-4 pb-4 pt-2 sm:px-8 sm:pb-5 sm:pt-3 lg:px-11">
        {children}
      </div>
    </section>
  );
}

/** Main centered page content column below the EmeraldBand. */
export function PageContent({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`mx-auto flex w-full max-w-[1760px] flex-col gap-4 px-4 pt-4 sm:gap-5 sm:px-8 sm:pt-6 lg:px-11 ${className}`}
    >
      {children}
    </div>
  );
}

/** Dark emerald search bar used inside EmeraldBand. */
export function EmeraldSearch({
  value,
  onChange,
  placeholder,
  label,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
  label: string;
}) {
  return (
    <label className="relative flex items-center">
      <span className="sr-only">{label}</span>
      <span className="pointer-events-none absolute left-3.5 flex items-center">
        <SearchIcon />
      </span>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-white/15 bg-[#032623] py-2.5 pl-10 pr-4 text-sm text-white placeholder:text-cu-teal-edge/65 focus:border-cu-teal focus:outline-none"
      />
    </label>
  );
}

type FilterPillTone = "neutral" | "amber" | "green" | "red";

/** Scrollable filter pill used inside EmeraldBand. */
export function FilterPill({
  active,
  onClick,
  label,
  count,
  tone = "neutral",
  icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count?: number;
  tone?: FilterPillTone;
  icon?: ReactNode;
}) {
  const pillStyle = active
    ? {
        neutral: "border-white bg-white text-cu-emerald",
        amber: "border-amber-400 bg-amber-400 text-cu-emerald-ink",
        green: "border-emerald-400 bg-emerald-500 text-white",
        red: "border-red-400 bg-red-500 text-white",
      }[tone]
    : {
        neutral: "border-white/20 bg-[#07423d] text-white hover:border-white/40",
        amber:
          "border-amber-400/45 bg-[#07423d] text-white hover:border-amber-400/80",
        green:
          "border-emerald-400/40 bg-[#07423d] text-white hover:border-emerald-400/80",
        red: "border-red-400/45 bg-[#07423d] text-white hover:border-red-400/80",
      }[tone];

  const badgeStyle = active
    ? {
        neutral: "bg-cu-teal-tint text-cu-teal-ink",
        amber: "bg-cu-emerald text-amber-300",
        green: "bg-white text-emerald-800",
        red: "bg-white text-red-700",
      }[tone]
    : {
        neutral: "bg-white/15 text-white",
        amber: "bg-amber-400 text-cu-emerald-ink",
        green: "bg-emerald-600 text-white",
        red: "bg-red-500 text-white",
      }[tone];

  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition ${pillStyle}`}
    >
      {icon}
      {label}
      {count !== undefined && (
        <span
          className={`rounded-full px-1.5 py-0.5 text-[11px] font-bold tabular-nums ${badgeStyle}`}
        >
          {count}
        </span>
      )}
    </button>
  );
}

/** Collapsible telemetry / audit bar directly under the EmeraldBand. */
export function TelemetryBar({
  title,
  badge = "CU-OS",
  open,
  onToggle,
  children,
}: {
  title: string;
  badge?: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section className="-mx-4 -mt-4 border-y border-cu-border bg-cu-surface px-4 py-2.5 sm:mx-0 sm:mt-0 sm:rounded-2xl sm:border sm:px-5">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 py-1 text-left"
      >
        <div className="flex min-w-0 items-center gap-2">
          <TelemetryIcon />
          <span className="truncate text-sm font-bold text-cu-ink">{title}</span>
          <span className="shrink-0 rounded-md bg-cu-teal-tint px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.06em] text-cu-teal-ink">
            {badge}
          </span>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-cu-body-text">
          {open ? "Collapse" : "Expand"}
          <ChevronIcon open={open} />
        </span>
      </button>

      {open && (
        <div className="mt-3 border-t border-cu-line-soft pb-1 pt-3.5">
          {children}
        </div>
      )}
    </section>
  );
}

/** Compact metric cell inside TelemetryBar or summary panels. */
export function TelemetryStat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: number | string;
  hint?: string;
  tone?: "amber" | "teal" | "red" | "green";
}) {
  const valueTone = {
    amber: "text-cu-amber",
    teal: "text-cu-teal-ink",
    red: "text-cu-red",
    green: "text-cu-green",
  }[tone ?? "teal"];

  return (
    <div className="rounded-xl border border-cu-border bg-cu-panel p-3.5">
      <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-cu-body-text">
        {label}
      </p>
      <p
        className={`mt-1.5 text-[1.75rem] font-bold leading-none tracking-[-0.015em] tabular-nums ${
          tone ? valueTone : "text-cu-ink"
        }`}
      >
        {value}
      </p>
      {hint && <p className="mt-1 text-[11px] text-cu-body-text">{hint}</p>}
    </div>
  );
}

/** Section header with green count pill and optional right control. */
export function RosterHeader({
  title,
  countLabel,
  right,
}: {
  title: string;
  countLabel?: string;
  right?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
      <div className="flex items-center gap-2.5">
        <h1 className="text-xl font-bold tracking-[-0.015em] text-cu-ink sm:text-2xl">
          {title}
        </h1>
        {countLabel && (
          <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold tabular-nums text-emerald-800">
            {countLabel}
          </span>
        )}
      </div>
      {right}
    </div>
  );
}
