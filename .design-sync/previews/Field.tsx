import { Field, inputClass } from "frontend";

/**
 * Form row: label, optional hint, optional error. Pair it with `inputClass`
 * on the control — that is what gives the 44px tap target the age-friendly
 * brief requires.
 */
export const Default = () => (
  <div className="max-w-sm">
    <Field label="Your name">
      <input className={inputClass} defaultValue="Tan Ah Huat" />
    </Field>
  </div>
);

export const WithHint = () => (
  <div className="max-w-sm">
    <Field
      label="Mobile number"
      hint="Singapore number. We'll send session invites here on WhatsApp."
    >
      <input className={inputClass} defaultValue="9123 4567" inputMode="tel" />
    </Field>
  </div>
);

/** Required fields carry a red asterisk with an accessible label. */
export const Required = () => (
  <div className="max-w-sm">
    <Field label="Preferred name" required hint="What would you like to be called?">
      <input className={inputClass} placeholder="e.g. Ah Huat" />
    </Field>
  </div>
);

/** The error is announced via role="alert". */
export const WithError = () => (
  <div className="max-w-sm">
    <Field
      label="Mobile number"
      required
      error="Not a valid Singapore number — expected 8 digits starting with 6, 8 or 9."
    >
      <input className={inputClass} defaultValue="12345" />
    </Field>
  </div>
);

/** A select works the same way — the control just needs `inputClass`. */
export const WithSelect = () => (
  <div className="max-w-sm">
    <Field label="Age group" hint="Optional. Helps us plan suitable sessions.">
      <select className={inputClass} defaultValue="60-69">
        <option value="">Prefer not to say</option>
        <option value="50-59">50 to 59</option>
        <option value="60-69">60 to 69</option>
        <option value="70-79">70 to 79</option>
      </select>
    </Field>
  </div>
);
