import { SeverityBadge } from "frontend";

/**
 * Status carries a shape as well as a colour (● ▲ ✓) — colour alone is not an
 * accessible signal. The deck's own RAG hues fail WCAG on white, so these use
 * darkened equivalents on pale tints.
 */
export const Severities = () => (
  <div className="flex flex-wrap items-center gap-3">
    <SeverityBadge severity="red" />
    <SeverityBadge severity="amber" />
    <SeverityBadge severity="green" />
  </div>
);

/** `label` overrides the default wording — used for counts in Launch Control. */
export const CustomLabels = () => (
  <div className="flex flex-wrap items-center gap-3">
    <SeverityBadge severity="red" label="3 blocking issues" />
    <SeverityBadge severity="amber" label="1 to watch" />
    <SeverityBadge severity="green" label="On track" />
  </div>
);
