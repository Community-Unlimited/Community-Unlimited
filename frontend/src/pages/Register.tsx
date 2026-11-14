/**
 * Public registration (18).
 *
 * Age-friendly by construction: 16px floor, 44px tap targets, one column, no
 * account creation, plain-language errors, and a calm 3-step flow so seniors
 * and volunteers aren't faced with a wall of fields at once.
 *
 * Captures identity (Last 3 digits + letter of NRIC & Phone), PMD / mobility
 * requirements, Kopi Brewing & Workout health/safety screening + emergency
 * contact, grassroots volunteering affiliation, and full Singapore PDPA
 * consent & activity indemnity.
 */

import { useRef, useState } from "react";
import { post } from "../api/client";
import type { Person, Tier } from "../api/types";
import { Banner, Button, Field, SectionTitle } from "../components/ui";

const registerCardClass =
  "rounded-3xl border border-cu-border bg-cu-surface p-6 shadow-[0_8px_28px_rgba(5,53,49,0.06)] sm:p-8";

const registerInputClass =
  "tap-target w-full rounded-xl border-[1.5px] border-cu-border-strong bg-cu-surface px-4 py-3 text-cu-body text-cu-ink shadow-[0_1px_2px_rgba(5,53,49,0.04)] transition-all duration-150 placeholder:text-cu-muted hover:border-cu-teal-mid focus:border-cu-teal-ink focus:bg-cu-surface focus:outline-2 focus:outline-transparent focus:ring-4 focus:ring-cu-teal/25";

function optionCardClass(selected: boolean, align: "center" | "start" = "start") {
  return `tap-target flex cursor-pointer ${
    align === "center" ? "items-center" : "items-start"
  } gap-3.5 rounded-2xl border-[1.5px] px-4 py-3.5 transition-all duration-150 focus-within:border-cu-teal-ink focus-within:ring-4 focus-within:ring-cu-teal/25 ${
    selected
      ? "border-cu-teal-ink bg-cu-teal-tint shadow-[0_2px_6px_rgba(14,110,104,0.10)]"
      : "border-cu-border bg-cu-page hover:border-cu-teal-mid/80 hover:bg-cu-teal-tint/45"
  }`;
}

function chipOptionClass(selected: boolean) {
  return `tap-target flex cursor-pointer items-center gap-2.5 rounded-xl border-[1.5px] px-4 py-2.5 transition-all duration-150 focus-within:border-cu-teal-ink focus-within:ring-4 focus-within:ring-cu-teal/25 ${
    selected
      ? "border-cu-teal-ink bg-cu-teal-tint font-semibold shadow-[0_1px_3px_rgba(14,110,104,0.10)]"
      : "border-cu-border bg-cu-page hover:border-cu-teal-mid/80 hover:bg-cu-teal-tint/45"
  }`;
}

function OptionalBadge() {
  return (
    <span className="ml-2 inline-flex items-center rounded-full border border-cu-border bg-cu-panel px-2.5 py-0.5 text-cu-caption font-semibold text-cu-body-text">
      Optional
    </span>
  );
}

interface RegistrationResult {
  already_registered: boolean;
  person: Person | null;
  tier: Tier | null;
  message: string;
}

const STEPS = [
  { id: 1, title: "Your Details", short: "Details" },
  { id: 2, title: "Mobility & Health", short: "Health" },
  { id: 3, title: "Activities & Consent", short: "Consent" },
] as const;

type StepId = (typeof STEPS)[number]["id"];

const INTERESTS = [
  {
    value: "coffee",
    label: "Kopi brewing",
    hint: "Learn traditional kopi & teh pulling and host community brews.",
  },
  {
    value: "exercise_hosting",
    label: "Community workouts",
    hint: "Join or co-lead friendly neighbourhood stretch and movement sessions.",
  },
];

const MOBILITY_OPTIONS = [
  {
    value: "none",
    label: "No mobility aid needed",
    hint: "I can move around and stand comfortably without a device.",
  },
  {
    value: "pmd",
    label: "Yes — I use a Personal Mobility Device (PMD)",
    hint: "Motorised scooter or motorised wheelchair. We will arrange accessible space and safe parking.",
  },
  {
    value: "wheelchair",
    label: "Yes — I use a manual wheelchair",
    hint: "We will prepare wheelchair-friendly counter height and workout space.",
  },
  {
    value: "walking_aid",
    label: "Yes — I use a walking stick or walking frame",
    hint: "We will make sure seating is nearby during kopi brewing and exercise.",
  },
];

const HEALTH_CONDITION_OPTIONS = [
  {
    value: "heart_blood_pressure",
    label: "Heart condition, chest pain, or uncontrolled high blood pressure",
    hint: "Important for safe pacing during workout sessions.",
  },
  {
    value: "epilepsy_seizures",
    label: "Epilepsy, seizures/fits, dizziness, fainting spells, or blackouts",
    hint: "Critical for your safety near hot water/coffee equipment and during workouts.",
  },
  {
    value: "joint_balance_mobility",
    label: "Joint, bone, back, knee, or balance issues",
    hint: "Helps us provide seated exercise options or a stool at the kopi booth.",
  },
  {
    value: "asthma_respiratory",
    label: "Asthma, breathlessness, or breathing difficulties",
    hint: "Helps trainers monitor exertion levels during workouts.",
  },
  {
    value: "heat_grip_sensitivity",
    label: "Hand tremors, weak grip, or numbness / sensitivity to heat",
    hint: "Important when handling hot kopi pots, kettles, and steam wands.",
  },
  {
    value: "allergies",
    label: "Food or drink allergies (e.g. coffee, milk/dairy, condensed milk, nuts)",
    hint: "For safe tasting and preparation during kopi brewing sessions.",
  },
  {
    value: "other",
    label: "Other medical condition or recent surgery",
    hint: "Please share details in the box below.",
  },
];

const LANGUAGE_PROFICIENCY_OPTIONS = [
  { value: "en", label: "English" },
  { value: "zh", label: "Chinese (中文)" },
  { value: "ms", label: "Malay (Bahasa Melayu)" },
  { value: "ta", label: "Tamil (தமிழ்)" },
  { value: "other", label: "Other" },
];

const DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

function HighFiveIllustration() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 96 96"
      className="h-16 w-16 shrink-0 sm:h-20 sm:w-20"
      fill="none"
    >
      <circle cx="48" cy="48" r="44" fill="#E8F6F5" />
      <path
        d="M31 68c-2-10-4-19-2-27 1-4 4-6 7-4 2 2 2 6 3 10l2-18c0-3 3-5 5-5 3 0 4 3 4 6l1 15 4-14c1-3 3-5 6-4 2 1 3 3 2 7l-4 17 5-8c2-3 5-3 7-1 2 2 1 5-1 8l-9 17c-2 4-7 7-13 7-8 0-15-2-17-6z"
        fill="#3CBFB8"
        stroke="#053531"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <path
        d="M65 68c2-10 4-19 2-27-1-4-4-6-7-4-2 2-2 6-3 10l-2-18c0-3-3-5-5-5-3 0-4 3-4 6l-1 15-4-14c-1-3-3-5-6-4-2 1-3 3-2 7l4 17-5-8c-2-3-5-3-7-1-2 2-1 5 1 8l9 17c2 4 7 7 13 7 8 0 15-2 17-6z"
        fill="#EA5C2A"
        stroke="#053531"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <path
        d="M48 10v7M38 14l3 6M58 14l-3 6"
        stroke="#053531"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function Register() {
  const formTopRef = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState<StepId>(1);

  const [name, setName] = useState("");
  const [fullName, setFullName] = useState("");
  const [nricLast4, setNricLast4] = useState("");
  const [phone, setPhone] = useState("");
  const [ageBand, setAgeBand] = useState("");
  const [language, setLanguage] = useState("en");
  const [writtenLanguages, setWrittenLanguages] = useState<string[]>([]);
  const [spokenLanguages, setSpokenLanguages] = useState<string[]>([]);

  // Mobility & PMD
  const [mobilityAid, setMobilityAid] = useState("none");

  // Health & Safety
  const [hasHealthConditions, setHasHealthConditions] = useState(false);
  const [healthConditions, setHealthConditions] = useState<string[]>([]);
  const [healthNotes, setHealthNotes] = useState("");
  const [emergencyName, setEmergencyName] = useState("");
  const [emergencyPhone, setEmergencyPhone] = useState("");
  const [emergencyRelationship, setEmergencyRelationship] = useState("");

  // Grassroots Volunteering
  const [isGrassroots, setIsGrassroots] = useState(false);

  // Interests & Availability
  const [interests, setInterests] = useState<string[]>([]);
  const [days, setDays] = useState<number[]>([]);

  // PDPA & Safety Consents
  const [consentTerms, setConsentTerms] = useState(false);
  const [whatsapp, setWhatsapp] = useState(false);
  const [photoMedia, setPhotoMedia] = useState(false);
  const [showPdpaNotice, setShowPdpaNotice] = useState(false);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<RegistrationResult | null>(null);

  function toggle<T>(list: T[], value: T): T[] {
    return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
  }

  function scrollToFormTop() {
    formTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function validateStep1(): string | null {
    if (!name.trim()) {
      return "Please enter your preferred name so we know what to call you.";
    }
    const cleanedNric = nricLast4.trim().toUpperCase().replace(/\s+/g, "");
    if (!/^\d{3}[A-Z]?$/.test(cleanedNric)) {
      return "Please enter the last 3 digits and letter of your NRIC/FIN (for example: 123A).";
    }
    if (!phone.trim()) {
      return "Please enter your mobile number so we can send you session updates.";
    }
    return null;
  }

  function validateStep2(): string | null {
    if (hasHealthConditions && healthConditions.length === 0 && !healthNotes.trim()) {
      return "Please tick at least one health condition or describe it in the notes box so we can keep you safe.";
    }
    if (!emergencyName.trim()) {
      return "Please enter an emergency contact name (Next-of-Kin).";
    }
    if (!emergencyPhone.trim()) {
      return "Please enter an emergency contact mobile number.";
    }
    return null;
  }

  function goNext() {
    const validationError = step === 1 ? validateStep1() : step === 2 ? validateStep2() : null;
    if (validationError) {
      setError(validationError);
      scrollToFormTop();
      return;
    }
    setError(null);
    if (step < 3) {
      setStep((step + 1) as StepId);
      scrollToFormTop();
    }
  }

  function goBack() {
    setError(null);
    if (step > 1) {
      setStep((step - 1) as StepId);
      scrollToFormTop();
    }
  }

  function jumpToStep(target: StepId) {
    if (target === step) return;
    if (target < step) {
      setError(null);
      setStep(target);
      scrollToFormTop();
      return;
    }
    // Validate current step (and intermediate step if jumping 1 -> 3) before advancing
    const err1 = validateStep1();
    if (err1) {
      setError(err1);
      setStep(1);
      scrollToFormTop();
      return;
    }
    if (target === 3) {
      const err2 = validateStep2();
      if (err2) {
        setError(err2);
        setStep(2);
        scrollToFormTop();
        return;
      }
    }
    setError(null);
    setStep(target);
    scrollToFormTop();
  }

  function resetForm() {
    setDone(null);
    setStep(1);
    setName("");
    setFullName("");
    setNricLast4("");
    setPhone("");
    setAgeBand("");
    setLanguage("en");
    setWrittenLanguages([]);
    setSpokenLanguages([]);
    setMobilityAid("none");
    setHasHealthConditions(false);
    setHealthConditions([]);
    setHealthNotes("");
    setEmergencyName("");
    setEmergencyPhone("");
    setEmergencyRelationship("");
    setIsGrassroots(false);
    setInterests([]);
    setDays([]);
    setConsentTerms(false);
    setWhatsapp(false);
    setPhotoMedia(false);
    setShowPdpaNotice(false);
    setError(null);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    const err1 = validateStep1();
    if (err1) {
      setError(err1);
      setStep(1);
      scrollToFormTop();
      return;
    }

    const err2 = validateStep2();
    if (err2) {
      setError(err2);
      setStep(2);
      scrollToFormTop();
      return;
    }

    if (!consentTerms) {
      setError("Please tick the PDPA & Safety Agreement box to complete registration.");
      scrollToFormTop();
      return;
    }

    const cleanedNric = nricLast4.trim().toUpperCase().replace(/\s+/g, "");

    setBusy(true);
    try {
      const result = await post<RegistrationResult>("/api/register", {
        preferred_name: name,
        full_name: fullName.trim() || null,
        nric_last4: cleanedNric,
        phone,
        age_band: ageBand || null,
        preferred_language: language,
        written_languages: writtenLanguages,
        spoken_languages: spokenLanguages,
        requires_pmd: mobilityAid === "pmd",
        mobility_aid: mobilityAid,
        has_health_conditions:
          hasHealthConditions || healthConditions.length > 0 || Boolean(healthNotes.trim()),
        health_conditions: hasHealthConditions ? healthConditions : [],
        health_notes: hasHealthConditions ? healthNotes.trim() || null : null,
        emergency_contact_name: emergencyName.trim() || null,
        emergency_contact_phone: emergencyPhone.trim() || null,
        emergency_contact_relationship: emergencyRelationship.trim() || null,
        is_grassroots_volunteer: isGrassroots,
        grassroots_organisation: null,
        interests,
        availability: days.map((weekday) => ({
          weekday,
          start_time: "09:00",
          end_time: "12:00",
        })),
        consent_participation: consentTerms,
        consent_health_safety: consentTerms,
        consent_whatsapp: whatsapp,
        consent_photo_media: photoMedia,
        assisted_registration: false,
        assisted_by: null,
      });
      setDone(result);
    } catch (err) {
      setError((err as Error).message);
      scrollToFormTop();
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="mx-auto max-w-2xl">
        <section className="overflow-hidden rounded-3xl border border-cu-border bg-cu-surface shadow-[0_10px_30px_rgba(5,53,49,0.08)]">
          <div className="h-1.5 bg-gradient-to-r from-cu-teal-ink via-cu-teal to-cu-orange" />
          <div className="flex flex-wrap items-center justify-between gap-3 bg-cu-emerald px-5 py-4 sm:px-8 sm:py-5">
            <img
              src="/Community-Unlimited-Logo.png"
              alt="Community Unlimited"
              className="h-10 w-auto object-contain sm:h-12"
            />
            <span className="inline-flex items-center gap-2 rounded-full border border-cu-green/30 bg-cu-green-tint px-3.5 py-1 text-cu-caption font-bold uppercase tracking-[0.06em] text-cu-green">
              <span aria-hidden="true" className="size-2 rounded-full bg-cu-green" />
              Registration received
            </span>
          </div>
          <div className="p-5 sm:p-9">
            <div className="flex items-start gap-4">
              <div
                aria-hidden="true"
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-cu-green-tint text-cu-green"
              >
                <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <h1 className="text-cu-h1 font-bold leading-tight tracking-[-0.015em] text-cu-emerald">
                  {done.already_registered ? "You're already with us" : "Thank you"}
                </h1>
                <p className="mt-2 text-[1.0625rem] leading-relaxed text-cu-body-text">
                  {done.message}
                </p>
              </div>
            </div>

            {done.tier && (
              <div className="mt-6 rounded-2xl border border-cu-teal-edge/70 bg-cu-teal-tint p-5 text-cu-body text-cu-ink">
                <p className="font-semibold text-cu-teal-ink">What happens next</p>
                <p className="mt-1">
                  Your next step is{" "}
                  <strong>{done.tier.next_module ?? "to be confirmed"}</strong>.
                  We&apos;ll message you on WhatsApp (or call you) when a session opens.
                </p>
              </div>
            )}

            <div className="mt-7 flex flex-wrap gap-3">
              <Button
                variant="ghost"
                onClick={resetForm}
                className="focus-visible:outline-2 focus-visible:outline-transparent focus-visible:ring-4 focus-visible:ring-cu-teal-ink/25"
              >
                Register someone else
              </Button>
            </div>
          </div>
        </section>
      </div>
    );
  }

  const currentStep = STEPS.find((s) => s.id === step) ?? STEPS[0];

  return (
    <div className="mx-auto max-w-2xl">
      {/* Hero / Welcome header */}
      <header className="overflow-hidden rounded-3xl border border-cu-border bg-cu-surface shadow-[0_10px_30px_rgba(5,53,49,0.07)]">
        <div className="h-1.5 bg-gradient-to-r from-cu-teal-ink via-cu-teal to-cu-orange" />
        <div className="bg-cu-emerald px-5 py-4 sm:px-8 sm:py-5">
          <img
            src="/Community-Unlimited-Logo.png"
            alt="Community Unlimited"
            className="h-10 w-auto object-contain sm:h-12"
          />
        </div>
        <div className="p-5 sm:p-8">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0 flex-1">
              <h1 className="text-[1.875rem] font-bold leading-[1.12] tracking-[-0.015em] text-cu-emerald sm:text-cu-h1">
                Join Community Unlimited
              </h1>
            </div>
            <HighFiveIllustration />
          </div>
        </div>
      </header>

      {/* Step progress bar */}
      <div
        ref={formTopRef}
        className="mt-6 scroll-mt-4 rounded-2xl border border-cu-border bg-cu-surface p-4 shadow-[0_4px_14px_rgba(5,53,49,0.05)] sm:p-5"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-cu-body font-bold text-cu-teal-ink">
            Step {step} of {STEPS.length}: {currentStep.title}
          </p>
          <span className="text-cu-caption font-semibold text-cu-body-text">
            {Math.round((step / STEPS.length) * 100)}% complete
          </span>
        </div>

        <div
          role="progressbar"
          aria-valuenow={step}
          aria-valuemin={1}
          aria-valuemax={STEPS.length}
          aria-label={`Registration progress: Step ${step} of ${STEPS.length}`}
          className="mt-3 grid grid-cols-3 gap-2"
        >
          {STEPS.map((s) => {
            const active = s.id === step;
            const completed = s.id < step;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => jumpToStep(s.id)}
                className="group text-left focus:outline-none"
              >
                <span
                  className={`block h-2.5 w-full rounded-full transition-colors ${
                    completed || active
                      ? "bg-cu-teal-ink"
                      : "bg-cu-sage group-hover:bg-cu-teal-edge"
                  }`}
                />
                <span
                  className={`mt-1.5 block text-cu-caption transition-colors ${
                    active
                      ? "font-bold text-cu-emerald"
                      : completed
                        ? "font-semibold text-cu-teal-ink"
                        : "font-medium text-cu-body-text"
                  }`}
                >
                  {s.id}. {s.short}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <form onSubmit={submit} noValidate className="mt-5 space-y-6">
        {error && <Banner tone="red">{error}</Banner>}

        {/* STEP 1: Identity & Contact */}
        {step === 1 && (
          <section className={`${registerCardClass} space-y-6`}>
            <SectionTitle
              rule
              hint="Required for event attendance, verification, and sending session updates."
            >
              1. Your Details
            </SectionTitle>

            <Field
              label="Preferred name"
              required
              hint="What would you like us to call you?"
            >
              <input
                className={registerInputClass}
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoComplete="given-name"
                placeholder="e.g. Ah Huat / Mary"
              />
            </Field>

            <div>
              <label className="block">
                <span className="mb-1.5 flex flex-wrap items-center text-cu-body font-semibold text-cu-ink">
                  Full name (as in NRIC)
                  <OptionalBadge />
                </span>
                <span className="mb-1.5 block text-cu-caption text-cu-body-text">
                  For official event attendance and certificates.
                </span>
                <input
                  className={registerInputClass}
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  autoComplete="name"
                  placeholder="e.g. Tan Ah Huat"
                />
              </label>
            </div>

            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-cu-body font-semibold text-cu-ink">
                  Last 3 digits &amp; letter of NRIC{" "}
                  <span className="text-cu-red" aria-label="required">
                    *
                  </span>
                </span>
                <span className="mb-1.5 flex items-center gap-1.5 text-cu-caption text-cu-body-text">
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    className="h-4 w-4 shrink-0 text-cu-orange-ink"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z"
                      clipRule="evenodd"
                    />
                  </svg>
                  E.g. 123A (please do not enter your full NRIC).
                </span>
                <input
                  className={`${registerInputClass} uppercase`}
                  value={nricLast4}
                  onChange={(e) => setNricLast4(e.target.value.toUpperCase())}
                  required
                  maxLength={4}
                  placeholder="e.g. 123A"
                />
              </label>

              <Field
                label="Mobile number"
                required
                hint="Singapore number for WhatsApp invites."
              >
                <input
                  className={registerInputClass}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="e.g. 9123 4567"
                />
              </Field>
            </div>

            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <Field label="Age group" hint="Helps us plan suitable sessions.">
                <select
                  className={registerInputClass}
                  value={ageBand}
                  onChange={(e) => setAgeBand(e.target.value)}
                >
                  <option value="">Prefer not to say</option>
                  <option value="<30">Below 30 (&lt;30)</option>
                  <option value="30-40">30 to 40</option>
                  <option value="40-50">40 to 50</option>
                  <option value="50-59">50 to 59</option>
                  <option value="60-69">60 to 69</option>
                  <option value="70-79">70 to 79</option>
                  <option value="80+">80 and above</option>
                </select>
              </Field>

              <Field label="Preferred language" hint="For WhatsApp invites and updates.">
                <select
                  className={registerInputClass}
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                >
                  <option value="en">English</option>
                  <option value="zh">中文</option>
                  <option value="ms">Bahasa Melayu</option>
                  <option value="ta">தமிழ்</option>
                </select>
              </Field>
            </div>

            <fieldset>
              <legend className="mb-1 text-cu-body font-semibold text-cu-ink">
                Written language proficiency{" "}
                <span className="font-normal text-cu-body-text">
                  (choose all that apply)
                </span>
              </legend>
              <p className="mb-3 text-cu-caption text-cu-body-text">
                Languages you can read and write comfortably.
              </p>
              <div className="flex flex-wrap gap-2.5">
                {LANGUAGE_PROFICIENCY_OPTIONS.map((opt) => {
                  const selected = writtenLanguages.includes(opt.value);
                  return (
                    <label key={opt.value} className={chipOptionClass(selected)}>
                      <input
                        type="checkbox"
                        className="h-5 w-5 accent-cu-teal-ink"
                        checked={selected}
                        onChange={() =>
                          setWrittenLanguages(toggle(writtenLanguages, opt.value))
                        }
                      />
                      <span className="text-cu-body text-cu-ink">{opt.label}</span>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            <fieldset>
              <legend className="mb-1 text-cu-body font-semibold text-cu-ink">
                Spoken language proficiency{" "}
                <span className="font-normal text-cu-body-text">
                  (choose all that apply)
                </span>
              </legend>
              <p className="mb-3 text-cu-caption text-cu-body-text">
                Languages you can speak comfortably.
              </p>
              <div className="flex flex-wrap gap-2.5">
                {LANGUAGE_PROFICIENCY_OPTIONS.map((opt) => {
                  const selected = spokenLanguages.includes(opt.value);
                  return (
                    <label key={opt.value} className={chipOptionClass(selected)}>
                      <input
                        type="checkbox"
                        className="h-5 w-5 accent-cu-teal-ink"
                        checked={selected}
                        onChange={() =>
                          setSpokenLanguages(toggle(spokenLanguages, opt.value))
                        }
                      />
                      <span className="text-cu-body text-cu-ink">{opt.label}</span>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            <div className="border-t border-cu-line pt-5">
              <Button
                type="button"
                onClick={goNext}
                className="w-full py-3.5 text-[1.0625rem] shadow-[0_6px_18px_rgba(234,92,42,0.22)] focus-visible:outline-2 focus-visible:outline-transparent focus-visible:ring-4 focus-visible:ring-cu-teal-ink/30"
              >
                Next: Mobility &amp; Health
                <span aria-hidden="true">→</span>
              </Button>
            </div>
          </section>
        )}

        {/* STEP 2: Mobility, Health & Emergency Contact */}
        {step === 2 && (
          <section className={`${registerCardClass} space-y-6`}>
            <SectionTitle
              rule
              hint="Helps us arrange counter space for Kopi Brewing, seated Workout options, and PMD parking."
            >
              2. Mobility &amp; PMD Needs
            </SectionTitle>

            <fieldset>
              <legend className="mb-3 text-cu-body font-semibold text-cu-ink">
                Do you require a Personal Mobility Device (PMD) or mobility aid?{" "}
                <span className="text-cu-red">*</span>
              </legend>
              <div className="space-y-3">
                {MOBILITY_OPTIONS.map((option) => {
                  const selected = mobilityAid === option.value;
                  return (
                    <label key={option.value} className={optionCardClass(selected)}>
                      <input
                        type="radio"
                        name="mobility_aid"
                        value={option.value}
                        checked={selected}
                        onChange={() => setMobilityAid(option.value)}
                        className="mt-1 h-5 w-5 shrink-0 accent-cu-teal-ink"
                      />
                      <span>
                        <span className="block text-cu-body font-semibold text-cu-ink">
                          {option.label}
                        </span>
                        <span className="mt-0.5 block text-cu-caption text-cu-body-text">
                          {option.hint}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            <div className="border-t border-cu-line pt-6">
              <SectionTitle
                rule
                hint="Kopi Brewing involves hot water/equipment and Workouts involve physical exercise. Please share any conditions so we can look out for you."
              >
                3. Health &amp; Safety Declaration
              </SectionTitle>

              <fieldset className="mt-4">
                <legend className="mb-3 text-cu-body font-semibold text-cu-ink">
                  Do you have any medical or health conditions we should be aware of?{" "}
                  <span className="text-cu-red">*</span>
                </legend>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className={optionCardClass(!hasHealthConditions, "center")}>
                    <input
                      type="radio"
                      name="has_health"
                      checked={!hasHealthConditions}
                      onChange={() => {
                        setHasHealthConditions(false);
                        setHealthConditions([]);
                        setHealthNotes("");
                      }}
                      className="h-5 w-5 shrink-0 accent-cu-teal-ink"
                    />
                    <span
                      className={`text-cu-body text-cu-ink ${
                        !hasHealthConditions ? "font-semibold" : ""
                      }`}
                    >
                      No — I have no known conditions
                    </span>
                  </label>

                  <label className={optionCardClass(hasHealthConditions, "center")}>
                    <input
                      type="radio"
                      name="has_health"
                      checked={hasHealthConditions}
                      onChange={() => setHasHealthConditions(true)}
                      className="h-5 w-5 shrink-0 accent-cu-teal-ink"
                    />
                    <span
                      className={`text-cu-body text-cu-ink ${
                        hasHealthConditions ? "font-semibold" : ""
                      }`}
                    >
                      Yes — I want to declare a condition
                    </span>
                  </label>
                </div>
              </fieldset>

              {hasHealthConditions && (
                <div className="mt-5 space-y-5 rounded-2xl border border-cu-border bg-cu-panel p-5">
                  <fieldset>
                    <legend className="mb-3 text-cu-body font-semibold text-cu-ink">
                      Please tick any conditions that apply to you:
                    </legend>
                    <div className="space-y-2.5">
                      {HEALTH_CONDITION_OPTIONS.map((item) => {
                        const selected = healthConditions.includes(item.value);
                        return (
                          <label key={item.value} className={optionCardClass(selected)}>
                            <input
                              type="checkbox"
                              className="mt-1 h-5 w-5 shrink-0 accent-cu-teal-ink"
                              checked={selected}
                              onChange={() =>
                                setHealthConditions(toggle(healthConditions, item.value))
                              }
                            />
                            <span>
                              <span className="block text-cu-body font-medium text-cu-ink">
                                {item.label}
                              </span>
                              <span className="mt-0.5 block text-cu-caption text-cu-body-text">
                                {item.hint}
                              </span>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </fieldset>

                  <Field
                    label="Details, allergies, or precautions"
                    hint="E.g. type of allergy, medication carried, or if you need a chair during sessions."
                  >
                    <textarea
                      className={registerInputClass}
                      rows={3}
                      value={healthNotes}
                      onChange={(e) => setHealthNotes(e.target.value)}
                      placeholder="Share any details that help our facilitators keep you safe…"
                    />
                  </Field>
                </div>
              )}
            </div>

            <div className="border-t border-cu-line pt-6">
              <p className="mb-1 text-cu-h3 font-bold text-cu-emerald">
                Emergency Contact (Next-of-Kin)
              </p>
              <p className="mb-4 text-cu-caption text-cu-body-text">
                Someone we can reach quickly if you ever feel unwell during a session.
              </p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Field label="Contact name" required>
                  <input
                    className={registerInputClass}
                    value={emergencyName}
                    onChange={(e) => setEmergencyName(e.target.value)}
                    required
                    placeholder="e.g. Tan Mei Ling"
                  />
                </Field>

                <Field label="Contact mobile" required>
                  <input
                    className={registerInputClass}
                    value={emergencyPhone}
                    onChange={(e) => setEmergencyPhone(e.target.value)}
                    required
                    inputMode="tel"
                    placeholder="e.g. 9876 5432"
                  />
                </Field>

                <label className="block">
                  <span className="mb-1.5 flex items-center text-cu-body font-semibold text-cu-ink">
                    Relationship
                    <OptionalBadge />
                  </span>
                  <input
                    className={registerInputClass}
                    value={emergencyRelationship}
                    onChange={(e) => setEmergencyRelationship(e.target.value)}
                    placeholder="e.g. Daughter / Spouse"
                  />
                </label>
              </div>
            </div>

            <div className="flex flex-col-reverse gap-3 border-t border-cu-line pt-5 sm:flex-row">
              <Button
                type="button"
                variant="ghost"
                onClick={goBack}
                className="sm:w-1/3"
              >
                <span aria-hidden="true">←</span>
                Back
              </Button>
              <Button
                type="button"
                onClick={goNext}
                className="py-3.5 text-[1.0625rem] shadow-[0_6px_18px_rgba(234,92,42,0.22)] focus-visible:outline-2 focus-visible:outline-transparent focus-visible:ring-4 focus-visible:ring-cu-teal-ink/30 sm:flex-1"
              >
                Next: Activities &amp; Consent
                <span aria-hidden="true">→</span>
              </Button>
            </div>
          </section>
        )}

        {/* STEP 3: Volunteering, Activities & PDPA Consent */}
        {step === 3 && (
          <section className={`${registerCardClass} space-y-6`}>
            <SectionTitle
              rule
              hint="Let us know if you already serve in a Residents' Network (RN), RC/NC, CC, Active Ageing Centre (AAC), or PA grassroots group."
            >
              4. Grassroots &amp; Community Volunteering
            </SectionTitle>

            <fieldset>
              <legend className="mb-3 text-cu-body font-semibold text-cu-ink">
                Are you currently volunteering with any grassroots or community
                organisation? <span className="text-cu-red">*</span>
              </legend>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className={optionCardClass(!isGrassroots, "center")}>
                  <input
                    type="radio"
                    name="is_grassroots"
                    checked={!isGrassroots}
                    onChange={() => setIsGrassroots(false)}
                    className="h-5 w-5 shrink-0 accent-cu-teal-ink"
                  />
                  <span
                    className={`text-cu-body text-cu-ink ${
                      !isGrassroots ? "font-semibold" : ""
                    }`}
                  >
                    No, not currently
                  </span>
                </label>

                <label className={optionCardClass(isGrassroots, "center")}>
                  <input
                    type="radio"
                    name="is_grassroots"
                    checked={isGrassroots}
                    onChange={() => setIsGrassroots(true)}
                    className="h-5 w-5 shrink-0 accent-cu-teal-ink"
                  />
                  <span
                    className={`text-cu-body text-cu-ink ${
                      isGrassroots ? "font-semibold" : ""
                    }`}
                  >
                    Yes, I volunteer in grassroots
                  </span>
                </label>
              </div>
            </fieldset>

            <div className="space-y-5 border-t border-cu-line pt-6">
              <SectionTitle rule>5. Activities &amp; Availability</SectionTitle>

              <fieldset>
                <legend className="mb-3 text-cu-body font-semibold text-cu-ink">
                  What would you enjoy?{" "}
                  <span className="font-normal text-cu-body-text">(choose any)</span>
                </legend>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {INTERESTS.map((interest) => {
                    const selected = interests.includes(interest.value);
                    return (
                      <label
                        key={interest.value}
                        className={optionCardClass(selected)}
                      >
                        <input
                          type="checkbox"
                          className="mt-1 h-5 w-5 shrink-0 accent-cu-teal-ink"
                          checked={selected}
                          onChange={() =>
                            setInterests(toggle(interests, interest.value))
                          }
                        />
                        <span>
                          <span
                            className={`block text-cu-body text-cu-ink ${
                              selected ? "font-semibold" : "font-medium"
                            }`}
                          >
                            {interest.label}
                          </span>
                          <span className="mt-0.5 block text-cu-caption text-cu-body-text">
                            {interest.hint}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>

              <fieldset>
                <legend className="mb-3 text-cu-body font-semibold text-cu-ink">
                  Which mornings are usually free?{" "}
                  <span className="font-normal text-cu-body-text">(optional)</span>
                </legend>
                <div className="flex flex-wrap gap-2.5">
                  {DAYS.map((day, index) => {
                    const on = days.includes(index);
                    return (
                      <button
                        type="button"
                        key={day}
                        aria-pressed={on}
                        onClick={() => setDays(toggle(days, index))}
                        className={`tap-target rounded-xl border-[1.5px] px-4 py-2 text-cu-body font-medium transition-all duration-150 focus:outline-2 focus:outline-transparent focus-visible:border-cu-teal-ink focus-visible:ring-4 focus-visible:ring-cu-teal/25 ${
                          on
                            ? "border-cu-teal-ink bg-cu-teal-ink text-white shadow-[0_2px_6px_rgba(14,110,104,0.2)]"
                            : "border-cu-border bg-cu-page text-cu-ink hover:border-cu-teal-mid/80 hover:bg-cu-teal-tint/50"
                        }`}
                      >
                        {day.slice(0, 3)}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            </div>

            <div className="space-y-5 border-t border-cu-line pt-6">
              <SectionTitle
                rule
                hint="In compliance with Singapore's Personal Data Protection Act (PDPA)."
              >
                6. PDPA &amp; Safety Consent
              </SectionTitle>

              <div className="overflow-hidden rounded-2xl border border-cu-border bg-cu-page">
                <button
                  type="button"
                  aria-expanded={showPdpaNotice}
                  aria-controls="pdpa-notice-body"
                  onClick={() => setShowPdpaNotice((v) => !v)}
                  className="tap-target flex w-full items-center justify-between gap-3 rounded-2xl px-4 py-3.5 text-left text-cu-body font-semibold text-cu-teal-ink transition-colors duration-150 hover:bg-cu-teal-tint/50 focus:outline-2 focus:outline-transparent focus-visible:ring-4 focus-visible:ring-cu-teal/25"
                >
                  <span>PDPA Notice &amp; Safety Declaration</span>
                  <span className="shrink-0 text-cu-caption font-bold">
                    {showPdpaNotice ? "Hide" : "Read terms"}
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      className={`ml-1 inline-block h-4 w-4 transition-transform ${
                        showPdpaNotice ? "rotate-180" : ""
                      }`}
                    >
                      <path
                        fillRule="evenodd"
                        d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </span>
                </button>
                {showPdpaNotice && (
                  <div
                    id="pdpa-notice-body"
                    className="space-y-2 border-t border-cu-line bg-cu-surface px-4 py-3.5 text-cu-caption leading-relaxed text-cu-body-text"
                  >
                    <p>
                      <strong className="text-cu-ink">Personal Data (PDPA):</strong>{" "}
                      Community Unlimited collects your name, NRIC (last 3 digits &amp;
                      letter), phone, grassroots affiliation, emergency contact, and
                      health/mobility declarations to:
                    </p>
                    <ul className="list-disc space-y-1 pl-5">
                      <li>
                        Verify identity and manage Kopi Brewing &amp; Workout training and
                        community deployments;
                      </li>
                      <li>
                        Arrange venue accessibility (including PMD space), ensure safety,
                        and contact your Next-of-Kin in an emergency;
                      </li>
                      <li>
                        Coordinate programmes with grassroots/community partners in your
                        precinct.
                      </li>
                    </ul>
                    <p>
                      <strong className="text-cu-ink">Safety Declaration:</strong> You
                      confirm your health and mobility details are accurate. Kopi Brewing
                      uses hot equipment and Workouts involve physical exercise; you agree
                      to go at your own pace, follow safety instructions, and tell
                      facilitators immediately if you feel unwell.
                    </p>
                    <p>
                      You may withdraw consent or request data access/correction anytime via
                      a Community Unlimited coordinator.
                    </p>
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <label className={optionCardClass(consentTerms)}>
                  <input
                    type="checkbox"
                    className="mt-1 h-5 w-5 shrink-0 accent-cu-teal-ink"
                    checked={consentTerms}
                    onChange={(e) => setConsentTerms(e.target.checked)}
                    required
                  />
                  <span className="text-cu-body text-cu-ink">
                    <strong>PDPA &amp; Safety Agreement:</strong> I agree to the PDPA
                    Notice and Safety Declaration above (use of my personal data for
                    registration, safety/emergency contact, and partner coordination, and
                    safe participation in Kopi Brewing &amp; Workouts).{" "}
                    <span className="text-cu-red">*</span>
                  </span>
                </label>

                <label className={optionCardClass(whatsapp)}>
                  <input
                    type="checkbox"
                    className="mt-1 h-5 w-5 shrink-0 accent-cu-teal-ink"
                    checked={whatsapp}
                    onChange={(e) => setWhatsapp(e.target.checked)}
                  />
                  <span className="text-cu-body text-cu-ink">
                    <strong>WhatsApp Updates (Optional):</strong> Send me session invites
                    and reminders on WhatsApp.
                    <span className="mt-0.5 block text-cu-caption text-cu-body-text">
                      Say no and we&apos;ll call you instead.
                    </span>
                  </span>
                </label>

                <label className={optionCardClass(photoMedia)}>
                  <input
                    type="checkbox"
                    className="mt-1 h-5 w-5 shrink-0 accent-cu-teal-ink"
                    checked={photoMedia}
                    onChange={(e) => setPhotoMedia(e.target.checked)}
                  />
                  <span className="text-cu-body text-cu-ink">
                    <strong>Photos &amp; Videos (Optional):</strong> I consent to event
                    photos/videos being used for community outreach and reporting.
                  </span>
                </label>
              </div>
            </div>

            <div className="space-y-3 border-t border-cu-line pt-5">
              <div className="flex flex-col-reverse gap-3 sm:flex-row">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={goBack}
                  disabled={busy}
                  className="sm:w-1/3"
                >
                  <span aria-hidden="true">←</span>
                  Back
                </Button>
                <Button
                  type="submit"
                  disabled={busy}
                  className="py-3.5 text-[1.0625rem] shadow-[0_6px_18px_rgba(234,92,42,0.22)] focus-visible:outline-2 focus-visible:outline-transparent focus-visible:ring-4 focus-visible:ring-cu-teal-ink/30 sm:flex-1"
                >
                  {busy ? "Sending…" : "Complete Registration"}
                </Button>
              </div>
              <p className="text-center text-cu-caption text-cu-body-text">
                Prefer paper or a phone call? Ask any Community Unlimited volunteer —
                they can register you in person.
              </p>
            </div>
          </section>
        )}
      </form>
    </div>
  );
}
