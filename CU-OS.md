# CU-OS — the Community Unlimited capacity engine

> Coffee is the first use case. The product is the capacity engine.

Built from `Community_Unlimited_Master_CU-OS_AI_Dashboard_Designer_Handoff.md`
(v1.0, 28 Aug 2026) and `20260620 Community Unlimited Brandguide v0.7.pptx`.

Section references below (e.g. `5.2`) point at the handoff.

---

## Run it

Two terminals. **One API instance only** — reminder sweeps will be an
in-process loop, so a second worker double-sends.

```bash
# 1. API  (http://127.0.0.1:8010, docs at /docs)
cd backend
python -m venv .venv
./.venv/Scripts/python.exe -m pip install -e ".[dev]"
cp .env.example .env
CU_DATABASE_URL="sqlite:///./cuos.db" ./.venv/Scripts/python.exe -m alembic upgrade head
CU_DATABASE_URL="sqlite:///./cuos.db" ./.venv/Scripts/python.exe seed.py --demo
CU_DATABASE_URL="sqlite:///./cuos.db" ./.venv/Scripts/python.exe -m uvicorn app.main:app --port 8010 --workers 1

# 2. UI  (http://localhost:5173, proxies /api to 8010)
cd frontend
npm install
npm run dev
```

Sign in with `admin@communityunlimited.sg` / `cuos-admin` (from `seed.py`;
change both before this leaves your machine).

Tests: `cd backend && ./.venv/Scripts/python.exe -m pytest -q` — 93 tests.

Drop `--demo` to seed reference data without the six fake people.

---

## What is built

| Area | State |
|---|---|
| Registration — self + assisted, consent, availability | ✅ |
| Event scheduling — CB modules and community events | ✅ |
| Tier tracking — CB1–CB7, deployable gate, Disciple status | ✅ |
| Qualification rule engine with human approval + audited overrides | ✅ |
| Launch Control — derives the capacity gap | ✅ |
| Asset registry + 12-point Site Ready Gate | ✅ structure only |
| WhatsApp invite / acknowledgment | ✅ offline seam, **not connected to Meta** |
| Rostering, partners, programmes, equipment, incidents, impact | ⬜ modelled or deferred |

### The chain that works end to end

`register → enrol → attend → complete → approve → deployable → next module`

Verified against a live server: attendance alone leaves someone
`deployable=false` with four pending approvals; only after a human approves all
four does the tier flip to *Deployable Community Barista* with `next: CB5`.

---

## Decisions worth knowing

**Launch Control derives, it does not restate.** The 480-seat gap is computed
from the locked calendar rules, not typed in:

```
72 slots × 10 seats = 720 learner-seats available
300 people × 4 modules = 1,200 required
→ short 480; ceiling of 180 people completing CB1–CB4      [RED]
```

The generator independently reproduces the handoff's own 68 + 4 = 72 count.
Change a rule — parallel classes, another venue, Sundays — and the verdict
moves on its own. `calendar_capacity(seats_per_slot=20)` clears the target;
there is a test proving it. Nothing assumes which fix CU will choose (`22.1`).

**The brand's primary colour cannot carry text.** Harmony Green `#3CBFB8` is
2.25:1 on white — it fails WCAG AA for any text size, while `18` and slide 25
both demand high contrast for older users. The brand deck already solves this
quietly, using `#0E6E68` wherever teal carries type. So `#3CBFB8` is retained
as an identity fill only, and `#0E6E68` (6.09:1) is the interactive teal. Same
for RAG chips: the deck's `#2BB673` / `#F4BF4F` fail on white, so status uses
darkened equivalents on pale tints. Every pair in `index.css` was measured.

| Token | Hex | On white |
|---|---|---|
| `cu-teal` (fill only, never text) | `#3CBFB8` | 2.25:1 |
| `cu-teal-ink` (links, buttons) | `#0E6E68` | 6.09:1 |
| `cu-orange-ink` (primary action) | `#A83C17` | 6.32:1 |
| `cu-green` / `cu-amber` / `cu-red` | `#17804F` / `#845C00` / `#C62828` | 4.96 / 5.98 / 5.62 |

**Codes drive logic; titles are display only.** `4.3` says the public naming
ladder (Brew Kaki, Café Maestro…) is unconfirmed. Permissions key off `CB5`,
never off a label. `Module.display_title` exists and is deliberately empty.

**No invented sites.** `2.2` says the authoritative 17-asset register does not
exist. The seed creates 17 clearly-marked placeholders and prints the six
candidate Kopi Corner locations for a human to assign. Readiness is 12 separate
booleans, not a score — `2.3` rejects a black-box number, so the UI shows
*which* gates are open.

**The machine never awards a qualification.** Attendance records a completion
as `pending_approval`. An override is refused without a written reason and
writes an `AuditEvent` naming the approver (`11.3`, `17.2`).

**No health data.** `11.2` is explicit: focusing on robust seniors is not a
reason to store a frailty label. There is no such field.

---

## WhatsApp — ready for next session

Nothing here talks to Meta yet. `CU_WHATSAPP_PROVIDER=fake` renders the real
Cloud API body with no network, so the whole round trip is exercisable offline:

```bash
curl -X POST localhost:8010/api/dev/simulate-reply \
     -H 'Content-Type: application/json' \
     -d '{"phone":"91234567","response":"yes"}'
```

That signs a Meta-shaped envelope and pushes it through the *same*
`webhook_handler.handle_payload` the live route uses. The dev endpoints
disappear automatically once a real provider is configured.

To go live: set `CU_WHATSAPP_PROVIDER=cloud` plus the four `CU_WHATSAPP_*`
credentials, and point Meta at `POST /api/whatsapp/webhook`.

**Start the template approval now — it is the long-lead item and gates nothing
else.** Submit `cu_event_invite` as a **UTILITY** template with three
quick-reply buttons (`ack_yes`, `ack_no`, `ack_maybe`) and four body variables:
name, event title, when, venue.

Three constraints in the messaging code exist because of specific past bugs:

- `outbound_messages.dedupe_key` is UNIQUE — that is what stops a double send.
  Cancelling **mangles** the key, or the cancelled row blocks that message
  forever.
- `inbound_messages.provider_message_id` is UNIQUE — Meta redelivers on any
  non-200, so the webhook always returns 200 on a well-formed body.
- The acknowledgment guard rejects only **strictly older** timestamps. Meta
  timestamps are whole seconds, so two taps inside one second share a
  timestamp; requiring strictly-greater would discard a real change of mind.
  Duplicates are already handled by the UNIQUE above, so this is safe.

Signature verification hashes the **raw request bytes** — re-serialising the
parsed JSON produces different bytes and never matches.

---

## Layout

```
backend/
  app/
    models/        base.py has UtcDateTime + the naming convention
    services/      calendar · qualification · launch_control · audit
    whatsapp/      provider (fake|cloud) · templates · outbox · webhook_handler
    api/           auth · public · people · academy · assets · launch · whatsapp · dev
  alembic/         render_as_batch + render_item hook for UtcDateTime
  tests/           93 tests
  seed.py
frontend/
  src/index.css    design tokens, every contrast ratio measured
  src/components/  ui.tsx — status colour lives here and nowhere else
  src/pages/       CommandCentre · People · Events · Register · Login
```

### Two things that will bite if changed carelessly

- **All datetimes go through `UtcDateTime`** (`app/models/base.py`). SQLite
  drops `tzinfo`; a plain `DateTime(timezone=True)` returns naive values and
  the first comparison against an aware `now()` raises `TypeError` at query
  time, far from the code that stored it. Naive input is rejected at the API
  boundary too.
- **`PRAGMA foreign_keys=ON` is set per connection** (`app/db.py`). SQLite
  defaults it off, and without it every `ON DELETE` in the schema is
  decorative.

---

## Open questions the build deliberately did not answer

These are `[TO CONFIRM]` in the handoff. The system tolerates them being open;
none is silently invented.

1. **How the 480-seat gap gets closed.** Parallel classes, more venues, extra
   Saturdays, train-the-trainer — the model supports any of them, and picks
   none.
2. **The real 17 assets** — site, address, zone, precinct, owner, readiness,
   launch order.
3. **Public identity titles** — the naming ladder.
4. **CB5–CB7 selection rules** — who nominates, what Disciple contribution is
   required, assessment, renewal.
5. **Volunteer workload** — is one session a week a preference, a default, or a
   hard cap?
6. **Data custodian** — who is the legal controller.
7. **Donations** — deliberately absent. `3.1` locks free, donation-supported,
   **no sales**, and a beverage is never conditional on a donation.

---

## Not yet built

Rostering (`Shift` / `DeploymentAssignment` are modelled but have no UI or
assignment engine), partner registry, hybrid programmes and Community
Stewards, equipment, incidents, and the impact/learning report. The generic
pathway engine is in place — `Pathway` and `Module` are configurable, so Sound
Stewards or Digital Buddies need seed rows, not new tables.
