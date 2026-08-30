import { Spinner } from "frontend";

/** Loading state. Carries role="status" and always shows text, never a bare glyph. */
export const Default = () => (
  <div className="max-w-md">
    <Spinner />
  </div>
);

export const CustomLabel = () => (
  <div className="max-w-md space-y-2">
    <Spinner label="Reading the operating picture" />
    <Spinner label="Loading attendance" />
  </div>
);
