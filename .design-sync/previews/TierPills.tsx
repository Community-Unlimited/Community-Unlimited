import { TierPills } from "frontend";

/**
 * A person's CB1–CB7 standing at a glance. Green = approved, amber = awaiting
 * human approval, red = required but not held, grey = optional leadership.
 * Each pill carries a screen-reader state, so the meaning never rests on
 * colour alone.
 */
export const Registered = () => (
  <TierPills completed={[]} missing={["CB1", "CB2", "CB3", "CB4"]} leadership={[]} pending={[]} />
);

/** Two approved, one awaiting sign-off, one still required. */
export const InTraining = () => (
  <TierPills
    completed={["CB1", "CB2"]}
    missing={["CB4"]}
    leadership={[]}
    pending={["CB3"]}
  />
);

/** All four core modules approved — the deployment gate is met. */
export const Deployable = () => (
  <TierPills
    completed={["CB1", "CB2", "CB3", "CB4"]}
    missing={[]}
    leadership={[]}
    pending={[]}
  />
);

/** Core complete plus CB5, so this person can lead a café shift. */
export const TeamLeader = () => (
  <TierPills
    completed={["CB1", "CB2", "CB3", "CB4"]}
    missing={[]}
    leadership={["CB5"]}
    pending={[]}
  />
);
