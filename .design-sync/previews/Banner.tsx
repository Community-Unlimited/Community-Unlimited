import { Banner } from "frontend";

/**
 * Inline message. `red` renders with role="alert" so it is announced
 * immediately; amber and green use role="status".
 */
export const Tones = () => (
  <div className="max-w-2xl space-y-3">
    <Banner tone="red">
      Not a valid Singapore number — expected 8 digits starting with 6, 8 or 9.
    </Banner>
    <Banner tone="amber">
      <strong>No API connected.</strong> Sign-in needs the backend running.
    </Banner>
    <Banner tone="green">Queued 14 WhatsApp invite(s).</Banner>
  </div>
);

export const Success = () => (
  <div className="max-w-2xl">
    <Banner tone="green">CB4 approved for Mary Tan.</Banner>
  </div>
);

export const Error = () => (
  <div className="max-w-2xl">
    <Banner tone="red">
      09 Nov 2026 is a public holiday — no training is scheduled.
    </Banner>
  </div>
);
