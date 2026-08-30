import { Meter } from "frontend";

/**
 * Progress against a target. Carries `role="progressbar"` plus an aria-label,
 * and the value is always shown as text — never colour alone.
 */
export const Default = () => (
  <div className="max-w-md">
    <Meter label="Progress to 300 deployment-ready" value={186} max={300} />
  </div>
);

export const Tones = () => (
  <div className="max-w-md space-y-5">
    <Meter label="Teal — default" value={62} max={100} tone="teal" />
    <Meter label="Green — on track" value={119} max={119} tone="green" />
    <Meter label="Red — behind" value={0} max={17} tone="red" />
  </div>
);

/**
 * The Command Centre trio. Values are a mid-programme snapshot rather than
 * today's zeros — an all-empty row would show the track and never the fill.
 */
export const CommandCentreRow = () => (
  <div className="grid max-w-4xl gap-5 md:grid-cols-3">
    <Meter label="Progress to 300 deployment-ready" value={186} max={300} tone="teal" />
    <Meter label="Leader coverage" value={94} max={119} tone="green" />
    <Meter label="Assets live" value={5} max={17} tone="red" />
  </div>
);
