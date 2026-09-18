/**
 * Reports — placeholder.
 *
 * The rollups a reports view would show already live on Command Centre and
 * People & tiers. This becomes a real page once there is a second dimension
 * worth its own view — trend over time, per-zone breakdowns — rather than a
 * restatement of numbers that already exist elsewhere.
 */

import { Link } from "react-router-dom";
import { Card, SectionTitle } from "../components/ui";

export default function Reports() {
  return (
    <>
      <div>
        <h1 className="text-cu-h1 font-bold leading-[1.15] tracking-[-0.015em] text-cu-emerald">
          Reports
        </h1>
        <p className="mt-1.5 max-w-[70ch] text-[1.0625rem] text-cu-body-text">
          Trend and breakdown reporting isn't built yet.
        </p>
      </div>

      <Card className="max-w-2xl">
        <SectionTitle hint="Today's figures already live elsewhere in CU-OS.">
          Coming soon
        </SectionTitle>
        <p className="text-cu-body leading-relaxed text-cu-body-text">
          For the current snapshot, the{" "}
          <Link to="/" className="font-bold text-cu-teal-ink underline">
            Command Centre
          </Link>{" "}
          carries the capacity verdict and every blocking finding, and{" "}
          <Link to="/people" className="font-bold text-cu-teal-ink underline">
            People &amp; tiers
          </Link>{" "}
          carries the pipeline by module. This page will hold trend-over-time
          and per-zone reporting once that is worth a dedicated view.
        </p>
      </Card>
    </>
  );
}
