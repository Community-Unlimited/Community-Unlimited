/**
 * Public registration (18).
 *
 * Age-friendly by construction: 16px floor, 44px tap targets, one column, no
 * account creation, minimal required fields (name + phone + consent), and an
 * assisted-registration path for a volunteer filling this in on someone's
 * behalf. Errors are plain language, never a raw validation dump.
 */

import { useState } from "react";
import { post } from "../api/client";
import type { Person, Tier } from "../api/types";
import { Banner, Button, Card, Field, inputClass } from "../components/ui";

interface RegistrationResult {
  already_registered: boolean;
  person: Person | null;
  tier: Tier | null;
  message: string;
}

const INTERESTS = [
  { value: "coffee", label: "Community café / barista" },
  { value: "exercise_hosting", label: "Hosting exercise sessions" },
  { value: "digital_support", label: "Helping others with phones and apps" },
  { value: "facilitation", label: "Bringing people together" },
  { value: "soundtech", label: "Sound and AV" },
  { value: "other", label: "Something else" },
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
  const [phone, setPhone] = useState("");
  const [ageBand, setAgeBand] = useState("");
  const [language, setLanguage] = useState("en");
  const [interests, setInterests] = useState<string[]>([]);
  const [days, setDays] = useState<number[]>([]);
  const [consent, setConsent] = useState(false);
  const [whatsapp, setWhatsapp] = useState(true);
  const [assisted, setAssisted] = useState(false);
  const [assistedBy, setAssistedBy] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<RegistrationResult | null>(null);

  function toggle<T>(list: T[], value: T): T[] {
    return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const result = await post<RegistrationResult>("/api/register", {
        preferred_name: name,
        phone,
        age_band: ageBand || null,
        preferred_language: language,
        interests,
        availability: days.map((weekday) => ({
          weekday,
          start_time: "09:00",
          end_time: "12:00",
        })),
        consent_participation: consent,
        consent_whatsapp: whatsapp,
        assisted_registration: assisted,
        assisted_by: assisted ? assistedBy || null : null,
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
          <h1 className="font-display text-cu-h1 leading-tight text-cu-ink">
            {done.already_registered ? "You're already with us" : "Thank you"}
          </h1>
          <p className="mt-3 text-cu-body text-cu-body-text">{done.message}</p>
          {done.tier && (
            <p className="mt-4 rounded-cu bg-cu-teal-tint p-4 text-cu-body text-cu-ink">
              Your next step is <strong>{done.tier.next_module ?? "to be confirmed"}</strong>.
              We'll message you on WhatsApp when a session opens.
            </p>
          )}
          <div className="mt-6">
            <Button
              variant="ghost"
              onClick={() => {
                setDone(null);
                setName("");
                setPhone("");
                setInterests([]);
                setDays([]);
                setConsent(false);
              }}
            >
              Register someone else
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="font-display text-cu-h1 leading-tight text-cu-ink">
        Join Community Unlimited
      </h1>
      <p className="mt-2 text-cu-body text-cu-body-text">
        Age is not the limit. Disconnection is. Tell us how to reach you and
        what you'd enjoy — that's all we need to start.
      </p>

      <form onSubmit={submit} className="mt-6 space-y-5">
        {error && <Banner tone="red">{error}</Banner>}

        <Card className="space-y-5">
          <Field label="Your name" required hint="What would you like to be called?">
            <input
              className={inputClass}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoComplete="given-name"
            />
          </Field>

          <Field
            label="Mobile number"
            required
            hint="Singapore number. We'll send session invites here on WhatsApp."
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

          <Field label="Age group" hint="Optional. Helps us plan suitable sessions.">
            <select
              className={inputClass}
              value={ageBand}
              onChange={(e) => setAgeBand(e.target.value)}
            >
              <option value="">Prefer not to say</option>
              <option value="50-59">50 to 59</option>
              <option value="60-69">60 to 69</option>
              <option value="70-79">70 to 79</option>
              <option value="80+">80 and above</option>
            </select>
          </Field>

          <Field label="Preferred language">
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
        </Card>

        <Card>
          <fieldset>
            <legend className="mb-3 text-cu-body font-semibold text-cu-ink">
              What would you enjoy? <span className="font-normal text-cu-body-text">(choose any)</span>
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
        </Card>

        <Card>
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

        <Card className="space-y-4">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              className="mt-1 h-5 w-5 accent-cu-teal-ink"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              required
            />
            <span className="text-cu-body text-cu-ink">
              I'm happy for Community Unlimited to keep my details so they can
              contact me about activities. <span className="text-cu-red">*</span>
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
              Send me invites and reminders on WhatsApp.
              <span className="block text-cu-caption text-cu-body-text">
                You can say no and still take part — we'll ring you instead.
              </span>
            </span>
          </label>

          <hr className="border-cu-line" />

          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              className="mt-1 h-5 w-5 accent-cu-teal-ink"
              checked={assisted}
              onChange={(e) => setAssisted(e.target.checked)}
            />
            <span className="text-cu-body text-cu-ink">
              I'm filling this in for someone else
            </span>
          </label>
          {assisted && (
            <Field label="Your name (the helper)">
              <input
                className={inputClass}
                value={assistedBy}
                onChange={(e) => setAssistedBy(e.target.value)}
              />
            </Field>
          )}
        </Card>

        <Button type="submit" disabled={busy} className="w-full">
          {busy ? "Sending…" : "Register"}
        </Button>
        <p className="text-center text-cu-caption text-cu-body-text">
          Prefer paper or a phone call? Ask any Community Unlimited volunteer —
          they can register you in person.
        </p>
      </form>
    </div>
  );
}
