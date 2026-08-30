import { StatTile } from "frontend";

/** The Command Centre headline tiles. Numbers are set in DM Serif Display. */
export const Default = () => (
  <div className="max-w-xs">
    <StatTile label="Registered" value={62} />
  </div>
);

/** `target` renders as "of N" — progress against a locked programme target. */
export const AgainstTarget = () => (
  <div className="grid max-w-2xl gap-4 sm:grid-cols-2">
    <StatTile
      label="Deployment-ready"
      value={1}
      target={300}
      caption="62 registered"
      severity="red"
    />
    <StatTile
      label="Assets live"
      value={0}
      target={17}
      caption="Target 31 Mar 2027"
      severity="amber"
    />
  </div>
);

/** The severity axis. Omitting `severity` leaves the number in ink. */
export const Severities = () => (
  <div className="grid max-w-4xl gap-4 sm:grid-cols-2 lg:grid-cols-4">
    <StatTile label="Neutral" value={72} caption="Training slots" />
    <StatTile label="On track" value={119} caption="Leader duties covered" severity="green" />
    <StatTile label="Watch" value={4} caption="Sessions this week" severity="amber" />
    <StatTile label="Action required" value={480} caption="Learner-seat gap" severity="red" />
  </div>
);
