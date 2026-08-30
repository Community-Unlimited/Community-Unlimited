import { SectionTitle } from "frontend";

/** Headings are DM Serif Display; the optional hint sits beneath in Inter. */
export const Default = () => (
  <div className="max-w-xl">
    <SectionTitle>Launch Control</SectionTitle>
  </div>
);

export const WithHint = () => (
  <div className="max-w-xl">
    <SectionTitle hint="Its job is not to cheerlead. It asks whether the plan actually works.">
      Launch Control
    </SectionTitle>
  </div>
);

export const Stacked = () => (
  <div className="max-w-xl space-y-8">
    <SectionTitle hint="Approved qualifications only. Pending completions do not count.">
      Pipeline
    </SectionTitle>
    <SectionTitle hint="72 scheduled">Events &amp; Academy</SectionTitle>
  </div>
);
