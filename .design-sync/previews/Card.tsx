import { Card, SeverityBadge } from "frontend";

/** The surface every panel sits on: white, hairline border, generous radius. */
export const Basic = () => (
  <div className="max-w-md">
    <Card>
      <p className="text-cu-body text-cu-ink">
        Community cafés run 0730–1030 daily. Each shift is one trained team
        leader plus one operator.
      </p>
    </Card>
  </div>
);

/** A Launch Control finding — the composition Card is used for most often. */
export const Finding = () => (
  <div className="max-w-2xl">
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h3 className="text-cu-h3 font-semibold text-cu-ink">
          Training capacity intervention required
        </h3>
        <SeverityBadge severity="red" />
      </div>
      <p className="mt-2 text-cu-body text-cu-body-text">
        300 people × 4 modules = 1,200 learner-seats required, but the locked
        calendar yields 72 slots × 10 = 720. Short by 480.
      </p>
    </Card>
  </div>
);

/** `className` composes — here a tinted callout inside the card. */
export const WithTintedPanel = () => (
  <div className="max-w-md">
    <Card>
      <p className="text-cu-body font-semibold text-cu-ink">Next step</p>
      <p className="mt-3 rounded-cu bg-cu-teal-tint p-4 text-cu-body text-cu-ink">
        Your next module is <strong>CB1 Brew Techniques</strong>. We'll message
        you on WhatsApp when a session opens.
      </p>
    </Card>
  </div>
);
