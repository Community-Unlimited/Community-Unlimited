/**
 * Public registration (18).
 *
 * Age-friendly by construction: 16px floor, 44px tap targets, one column, no
 * account creation, plain-language errors, and an assisted-registration path
 * for a volunteer filling this in on someone's behalf.
 *
 * Captures identity (Last 3 digits + letter of NRIC & Phone), PMD / mobility
 * requirements, Kopi Brewing & Workout health/safety screening + emergency
 * contact, grassroots volunteering affiliation, and full Singapore PDPA
 * consent & activity indemnity.
 */

import { useState } from "react";
import { post } from "../api/client";
import type { Person, Tier } from "../api/types";
import { Banner, Button, Card, Field, SectionTitle, inputClass } from "../components/ui";

interface RegistrationResult {
  already_registered: boolean;
  person: Person | null;
  tier: Tier | null;
  message: string;
}

const INTERESTS = [
  { value: "coffee", label: "Kopi brewing" },
  { value: "exercise_hosting", label: "Community workouts" },
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

export default function Register() {
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

  function resetForm() {
    setDone(null);
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

    const cleanedNric = nricLast4.trim().toUpperCase().replace(/\s+/g, "");
    if (!/^\d{3}[A-Z]?$/.test(cleanedNric)) {
      setError(
        "Please enter the last 3 digits and letter of your NRIC/FIN (for example: 123A)."
      );
      return;
    }

    if (hasHealthConditions && healthConditions.length === 0 && !healthNotes.trim()) {
      setError(
        "Please tick at least one health condition or describe it in the notes box so we can keep you safe."
      );
      return;
    }

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
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="mx-auto max-w-xl">
        <Card>
          <h1 className="text-cu-h1 font-bold leading-tight tracking-[-0.015em] text-cu-emerald">
            {done.already_registered ? "You're already with us" : "Thank you"}
          </h1>
          <p className="mt-3 text-[1.0625rem] text-cu-body-text">{done.message}</p>
          {done.tier && (
            <p className="mt-4 rounded-xl bg-cu-teal-tint p-4 text-cu-body text-cu-ink">
              Your next step is <strong>{done.tier.next_module ?? "to be confirmed"}</strong>.
              We'll message you on WhatsApp when a session opens.
            </p>
          )}
          <div className="mt-6">
            <Button variant="ghost" onClick={resetForm}>
              Register someone else
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-cu-h1 font-bold leading-tight tracking-[-0.015em] text-cu-emerald">
        Join Community Unlimited
      </h1>
      <p className="mt-2 text-[1.0625rem] text-cu-body-text">
        Age is not the limit. Disconnection is. Register below for our{" "}
        <strong>Kopi Brewing</strong> and <strong>Community Workout</strong>{" "}
        sessions — tell us how to reach you and how we can keep you safe and
        comfortable.
      </p>

      <form onSubmit={submit} className="mt-6 space-y-5">
        {error && <Banner tone="red">{error}</Banner>}

        {/* 1. Identity & Contact */}
        <Card className="space-y-5">
          <SectionTitle
            rule
            hint="Required for event attendance, verification, and sending session updates."
          >
            1. Your Details
          </SectionTitle>

          <Field label="Preferred name" required hint="What would you like to be called?">
            <input
              className={inputClass}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoComplete="given-name"
              placeholder="e.g. Ah Huat / Mary"
            />
          </Field>

          <Field
            label="Full name (as in NRIC)"
            hint="Optional. Helpful for official event attendance and certificates."
          >
            <input
              className={inputClass}
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              autoComplete="name"
              placeholder="e.g. Tan Ah Huat"
            />
          </Field>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field
              label="Last 3 digits & letter of NRIC"
              required
              hint="E.g. 123A (do not enter your full NRIC)."
            >
              <input
                className={`${inputClass} uppercase`}
                value={nricLast4}
                onChange={(e) => setNricLast4(e.target.value.toUpperCase())}
                required
                maxLength={4}
                placeholder="123A"
              />
            </Field>

            <Field
              label="Mobile number"
              required
              hint="Singapore number for WhatsApp invites."
            >
              <input
                className={inputClass}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
                inputMode="tel"
                autoComplete="tel"
                placeholder="9123 4567"
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Age group" hint="Helps us plan suitable sessions.">
              <select
                className={inputClass}
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
                className={inputClass}
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
            <p className="mb-2.5 text-cu-caption text-cu-body-text">
              Languages you can read and write comfortably.
            </p>
            <div className="flex flex-wrap gap-2.5">
              {LANGUAGE_PROFICIENCY_OPTIONS.map((opt) => {
                const selected = writtenLanguages.includes(opt.value);
                return (
                  <label
                    key={opt.value}
                    className={`tap-target flex cursor-pointer items-center gap-2.5 rounded-cu border px-4 py-2 transition ${
                      selected
                        ? "border-cu-teal-ink bg-cu-teal-tint font-semibold"
                        : "border-cu-line bg-cu-surface hover:bg-cu-teal-tint/60"
                    }`}
                  >
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
            <p className="mb-2.5 text-cu-caption text-cu-body-text">
              Languages you can speak comfortably.
            </p>
            <div className="flex flex-wrap gap-2.5">
              {LANGUAGE_PROFICIENCY_OPTIONS.map((opt) => {
                const selected = spokenLanguages.includes(opt.value);
                return (
                  <label
                    key={opt.value}
                    className={`tap-target flex cursor-pointer items-center gap-2.5 rounded-cu border px-4 py-2 transition ${
                      selected
                        ? "border-cu-teal-ink bg-cu-teal-tint font-semibold"
                        : "border-cu-line bg-cu-surface hover:bg-cu-teal-tint/60"
                    }`}
                  >
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
        </Card>

        {/* 2. Mobility & PMD */}
        <Card className="space-y-4">
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
            <div className="space-y-2.5">
              {MOBILITY_OPTIONS.map((option) => {
                const selected = mobilityAid === option.value;
                return (
                  <label
                    key={option.value}
                    className={`tap-target flex cursor-pointer items-start gap-3 rounded-cu border px-4 py-3 transition ${
                      selected
                        ? "border-cu-teal-ink bg-cu-teal-tint"
                        : "border-cu-line hover:bg-cu-teal-tint/60"
                    }`}
                  >
                    <input
                      type="radio"
                      name="mobility_aid"
                      value={option.value}
                      checked={selected}
                      onChange={() => setMobilityAid(option.value)}
                      className="mt-1 h-5 w-5 accent-cu-teal-ink"
                    />
                    <span>
                      <span className="block text-cu-body font-semibold text-cu-ink">
                        {option.label}
                      </span>
                      <span className="block text-cu-caption text-cu-body-text">
                        {option.hint}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        </Card>

        {/* 3. Health Conditions & Emergency Contact */}
        <Card className="space-y-5">
          <SectionTitle
            rule
            hint="Kopi Brewing involves hot water/equipment and Workouts involve physical exercise. Please share any conditions so we can look out for you."
          >
            3. Health &amp; Safety Declaration
          </SectionTitle>

          <fieldset>
            <legend className="mb-3 text-cu-body font-semibold text-cu-ink">
              Do you have any medical or health conditions we should be aware of?{" "}
              <span className="text-cu-red">*</span>
            </legend>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <label
                className={`tap-target flex cursor-pointer items-center gap-3 rounded-cu border px-4 py-3 ${
                  !hasHealthConditions
                    ? "border-cu-teal-ink bg-cu-teal-tint font-semibold"
                    : "border-cu-line hover:bg-cu-teal-tint/60"
                }`}
              >
                <input
                  type="radio"
                  name="has_health"
                  checked={!hasHealthConditions}
                  onChange={() => {
                    setHasHealthConditions(false);
                    setHealthConditions([]);
                    setHealthNotes("");
                  }}
                  className="h-5 w-5 accent-cu-teal-ink"
                />
                <span className="text-cu-body text-cu-ink">
                  No — I have no known conditions
                </span>
              </label>

              <label
                className={`tap-target flex cursor-pointer items-center gap-3 rounded-cu border px-4 py-3 ${
                  hasHealthConditions
                    ? "border-cu-teal-ink bg-cu-teal-tint font-semibold"
                    : "border-cu-line hover:bg-cu-teal-tint/60"
                }`}
              >
                <input
                  type="radio"
                  name="has_health"
                  checked={hasHealthConditions}
                  onChange={() => setHasHealthConditions(true)}
                  className="h-5 w-5 accent-cu-teal-ink"
                />
                <span className="text-cu-body text-cu-ink">
                  Yes — I want to declare a condition
                </span>
              </label>
            </div>
          </fieldset>

          {hasHealthConditions && (
            <div className="space-y-4 rounded-xl border border-cu-border bg-cu-surface p-4">
              <fieldset>
                <legend className="mb-2.5 text-cu-body font-semibold text-cu-ink">
                  Please tick any conditions that apply to you:
                </legend>
                <div className="space-y-2">
                  {HEALTH_CONDITION_OPTIONS.map((item) => (
                    <label
                      key={item.value}
                      className="tap-target flex cursor-pointer items-start gap-3 rounded-cu border border-cu-line px-3.5 py-2.5 hover:bg-cu-teal-tint"
                    >
                      <input
                        type="checkbox"
                        className="mt-1 h-5 w-5 accent-cu-teal-ink"
                        checked={healthConditions.includes(item.value)}
                        onChange={() =>
                          setHealthConditions(toggle(healthConditions, item.value))
                        }
                      />
                      <span>
                        <span className="block text-cu-body font-medium text-cu-ink">
                          {item.label}
                        </span>
                        <span className="block text-cu-caption text-cu-body-text">
                          {item.hint}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <Field
                label="Details, allergies, or precautions"
                hint="E.g. type of allergy, medication carried, or if you need a chair during sessions."
              >
                <textarea
                  className={inputClass}
                  rows={3}
                  value={healthNotes}
                  onChange={(e) => setHealthNotes(e.target.value)}
                  placeholder="Share any details that help our facilitators keep you safe…"
                />
              </Field>
            </div>
          )}

          <div className="border-t border-cu-line pt-4">
            <p className="mb-3 text-cu-body font-semibold text-cu-ink">
              Emergency Contact (Next-of-Kin)
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field label="Contact name" required>
                <input
                  className={inputClass}
                  value={emergencyName}
                  onChange={(e) => setEmergencyName(e.target.value)}
                  required
                  placeholder="e.g. Tan Mei Ling"
                />
              </Field>

              <Field label="Contact mobile" required>
                <input
                  className={inputClass}
                  value={emergencyPhone}
                  onChange={(e) => setEmergencyPhone(e.target.value)}
                  required
                  inputMode="tel"
                  placeholder="9876 5432"
                />
              </Field>

              <Field label="Relationship">
                <input
                  className={inputClass}
                  value={emergencyRelationship}
                  onChange={(e) => setEmergencyRelationship(e.target.value)}
                  placeholder="e.g. Daughter / Spouse"
                />
              </Field>
            </div>
          </div>
        </Card>

        {/* 4. Grassroots Volunteering */}
        <Card className="space-y-4">
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
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <label
                className={`tap-target flex cursor-pointer items-center gap-3 rounded-cu border px-4 py-3 ${
                  !isGrassroots
                    ? "border-cu-teal-ink bg-cu-teal-tint font-semibold"
                    : "border-cu-line hover:bg-cu-teal-tint/60"
                }`}
              >
                <input
                  type="radio"
                  name="is_grassroots"
                  checked={!isGrassroots}
                  onChange={() => setIsGrassroots(false)}
                  className="h-5 w-5 accent-cu-teal-ink"
                />
                <span className="text-cu-body text-cu-ink">No, not currently</span>
              </label>

              <label
                className={`tap-target flex cursor-pointer items-center gap-3 rounded-cu border px-4 py-3 ${
                  isGrassroots
                    ? "border-cu-teal-ink bg-cu-teal-tint font-semibold"
                    : "border-cu-line hover:bg-cu-teal-tint/60"
                }`}
              >
                <input
                  type="radio"
                  name="is_grassroots"
                  checked={isGrassroots}
                  onChange={() => setIsGrassroots(true)}
                  className="h-5 w-5 accent-cu-teal-ink"
                />
                <span className="text-cu-body text-cu-ink">
                  Yes, I volunteer in grassroots
                </span>
              </label>
            </div>
          </fieldset>

        </Card>

        {/* 5. Activities & Availability */}
        <Card className="space-y-5">
          <SectionTitle rule>5. Activities &amp; Availability</SectionTitle>

          <fieldset>
            <legend className="mb-3 text-cu-body font-semibold text-cu-ink">
              What would you enjoy?{" "}
              <span className="font-normal text-cu-body-text">(choose any)</span>
            </legend>
            <div className="space-y-2">
              {INTERESTS.map((interest) => (
                <label
                  key={interest.value}
                  className="tap-target flex cursor-pointer items-center gap-3 rounded-cu border border-cu-line px-4 py-2 hover:bg-cu-teal-tint"
                >
                  <input
                    type="checkbox"
                    className="h-5 w-5 accent-cu-teal-ink"
                    checked={interests.includes(interest.value)}
                    onChange={() => setInterests(toggle(interests, interest.value))}
                  />
                  <span className="text-cu-body text-cu-ink">{interest.label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="mb-3 text-cu-body font-semibold text-cu-ink">
              Which mornings are usually free?{" "}
              <span className="font-normal text-cu-body-text">(optional)</span>
            </legend>
            <div className="flex flex-wrap gap-2">
              {DAYS.map((day, index) => {
                const on = days.includes(index);
                return (
                  <button
                    type="button"
                    key={day}
                    aria-pressed={on}
                    onClick={() => setDays(toggle(days, index))}
                    className={`tap-target rounded-cu border px-4 py-2 text-cu-body font-medium ${
                      on
                        ? "border-cu-teal-ink bg-cu-teal-ink text-white"
                        : "border-cu-line bg-cu-surface text-cu-ink hover:bg-cu-teal-tint"
                    }`}
                  >
                    {day.slice(0, 3)}
                  </button>
                );
              })}
            </div>
          </fieldset>
        </Card>

        {/* 6. PDPA Data Protection & Safety Consent */}
        <Card className="space-y-4">
          <SectionTitle
            rule
            hint="In compliance with Singapore's Personal Data Protection Act (PDPA)."
          >
            6. PDPA &amp; Safety Consent
          </SectionTitle>

          <div className="rounded-xl border border-cu-border bg-cu-surface">
            <button
              type="button"
              aria-expanded={showPdpaNotice}
              aria-controls="pdpa-notice-body"
              onClick={() => setShowPdpaNotice((v) => !v)}
              className="tap-target flex w-full items-center justify-between gap-3 rounded-xl px-4 py-3 text-left text-cu-body font-semibold text-cu-teal-ink hover:bg-cu-teal-tint/50"
            >
              <span>PDPA Notice &amp; Safety Declaration</span>
              <span className="shrink-0 text-cu-caption font-bold">
                {showPdpaNotice ? "Hide" : "Read terms"}
                <svg
                  aria-hidden="true"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className={`inline-block ml-1 h-4 w-4 transition-transform ${
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
                className="space-y-2 border-t border-cu-line px-4 py-3 text-cu-caption text-cu-body-text"
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

          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              className="mt-1 h-5 w-5 accent-cu-teal-ink"
              checked={consentTerms}
              onChange={(e) => setConsentTerms(e.target.checked)}
              required
            />
            <span className="text-cu-body text-cu-ink">
              <strong>PDPA &amp; Safety Agreement:</strong> I agree to the PDPA Notice
              and Safety Declaration above (use of my personal data for registration,
              safety/emergency contact, and partner coordination, and safe participation
              in Kopi Brewing &amp; Workouts). <span className="text-cu-red">*</span>
            </span>
          </label>

          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              className="mt-1 h-5 w-5 accent-cu-teal-ink"
              checked={whatsapp}
              onChange={(e) => setWhatsapp(e.target.checked)}
            />
            <span className="text-cu-body text-cu-ink">
              <strong>WhatsApp Updates (Optional):</strong> Send me session invites
              and reminders on WhatsApp.
              <span className="block text-cu-caption text-cu-body-text">
                Say no and we&apos;ll call you instead.
              </span>
            </span>
          </label>

          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              className="mt-1 h-5 w-5 accent-cu-teal-ink"
              checked={photoMedia}
              onChange={(e) => setPhotoMedia(e.target.checked)}
            />
            <span className="text-cu-body text-cu-ink">
              <strong>Photos &amp; Videos (Optional):</strong> I consent to event
              photos/videos being used for community outreach and reporting.
            </span>
          </label>
        </Card>

        <Button type="submit" disabled={busy} className="w-full">
          {busy ? "Sending…" : "Complete Registration"}
        </Button>
        <p className="text-center text-cu-caption text-cu-body-text">
          Prefer paper or a phone call? Ask any Community Unlimited volunteer —
          they can register you in person.
        </p>
      </form>
    </div>
  );
}
