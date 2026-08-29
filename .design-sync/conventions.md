# Building with CU-OS

The design system behind **Community Unlimited** — a senior-led community
activation programme in Singapore. Tone: warm, plain-spoken, dignified. Never
infantilising, never clinical. The audience includes people in their 60s–80s,
so legibility is a hard requirement, not a preference.

## Setup

**No provider or theme wrapper is required.** Every component is a plain
function with no React context — render it directly. The only setup is the
stylesheet, which is already loaded for you.

```jsx
<Button variant="primary">Register</Button>
```

## Styling idiom

Tailwind utilities, all brand values under a `cu-` prefix. **Use these names —
do not invent colour values or write raw hex.** Everything below exists in the
shipped stylesheet; anything else silently does nothing, because designs render
static CSS with no Tailwind compiler.

| Family | Values |
|---|---|
| Brand | `teal` `teal-ink` `teal-mid` `teal-tint` `teal-tint-strong` `teal-edge` `orange` `orange-ink` `orange-tint` `emerald` |
| Neutral | `ink` `body-text` `muted` `line` `line-soft` `page` `surface` |
| Status | `green` `green-tint` `amber` `amber-tint` `red` `red-tint` |

Each combines with `bg-`, `text-` and `border-` — e.g. `bg-cu-teal-tint`,
`text-cu-body-text`, `border-cu-line`.

**The one rule that must not be broken:** `cu-teal` (#3CBFB8) is the brand
identity fill and measures 2.25:1 on white — it can never carry text and is
never a button fill. Use **`cu-teal-ink`** (6.09:1) for any teal that carries
type or interaction. The same applies to `cu-orange` (decorative) versus
**`cu-orange-ink`** (actions). Status text uses `cu-green` / `cu-amber` /
`cu-red` on their `-tint` backgrounds — those pairs are contrast-verified.
Signal status with shape or words as well as colour, never colour alone.

Type: `text-cu-h1` (40) · `text-cu-h2` (28) · `text-cu-h3` (20) ·
`text-cu-body` (16) · `text-cu-caption` (12). Body never goes below 16px.
`font-display` is DM Serif Display — headings and big numbers only.
`font-sans` is Inter, the default for everything else.

Radius `rounded-cu` / `rounded-cu-lg`. Use `tap-target` on anything clickable:
it enforces the 44px minimum these users need.

## Components

`Banner` `Button` `Card` `Field` `Meter` `SectionTitle` `SeverityBadge`
`Spinner` `StatTile` `TierPills`, plus **`inputClass`** — a string, not a
component. Put it on the `<input>`/`<select>` inside a `Field`; it carries the
border, padding and tap target.

Read `<Name>.prompt.md` for a component's props and examples, and `styles.css`
(with its imports) for the actual token values.

## Idiomatic example

Library components for the controls; `cu-` utilities for your own layout glue.

```jsx
<Card>
  <SectionTitle hint="Approved qualifications only.">Pipeline</SectionTitle>
  <div className="mt-4 grid gap-4 sm:grid-cols-2">
    <StatTile label="Deployment-ready" value={186} target={300} severity="amber" />
    <StatTile label="Assets live" value={5} target={17} severity="red" />
  </div>
  <p className="mt-4 rounded-cu bg-cu-teal-tint p-4 text-cu-body text-cu-ink">
    Next intake opens 1 Oct.
  </p>
  <div className="mt-4 flex gap-3">
    <Button variant="primary">Register</Button>
    <Button variant="ghost">View roster</Button>
  </div>
</Card>
```
