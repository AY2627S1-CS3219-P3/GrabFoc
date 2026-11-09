---
name: foc-design
description: FoC (GrabFoc) frontend design system, the "campus route slip" look. Use before building or restyling any UI in frontend/ (pages, components, modals, empty states, animations), so new screens match the existing tokens, type, motion and copy rules.
---

<!--
AI Assistance Disclosure:
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-08
Scope: Wrote this design skill to document the frontend redesign (tokens, type, signature elements, motion and copy rules, checklist).
Author review: Pending review by Jie Yang.
-->

# FoC design system: campus route slip

_Origin: AI doc. Documents the 2026-11-08 redesign requested by Jie Yang. The team reviews and owns it._

FoC is a campus errand app for NUS students. A requester posts an **order** to have items collected from a
**location** and dropped off; a **courier** (another student) delivers it for **credits**. The design is built
from that vocabulary: every order is a route from a pickup to a drop-off, and the UI draws it.

Source of truth: `frontend/app/globals.css` (tokens and component classes) and
`frontend/app/components/icons.tsx` (icons and illustrations). Reuse what is there before adding anything.

## 1. Tokens

Use the CSS variables; never hard-code a hex value in a component.

| Token | Value | Use |
|---|---|---|
| `--paper` | `#f3f5f1` | page background (cool off-white, not cream) |
| `--surface` | `#ffffff` | cards, inputs, modals |
| `--ink` | `#17213a` | text, strong borders, the dark credit card, mode switch track |
| `--muted` / `--faint` | `#5d6779` / `#8c95a3` | secondary text / icons and placeholders |
| `--line` / `--line-strong` | `#dce1d8` / `#b9c1b4` | resting borders / hover and dotted route lines |
| `--orange` | `#e8590c` | requester accent ("pickup orange") |
| `--blue` | `#2346c9` | courier accent ("route blue") |
| `--gold-bright` / `--gold` | `#ffc94a` / `#8a5d00` | credits only (coin, balances, PENDING badge) |
| `--green`, `--red` | | success, live indicator / errors, cancel |

**Accent is contextual.** Components use `--accent`, `--accent-deep` and `--accent-wash`, never `--orange` or
`--blue` directly. `AppShell`'s `mode` prop sets `data-mode` on the page, which swaps the accent:

- `mode="requester"` (default): orange.
- `mode="courier"`: blue.

Set `mode` wherever the user acts in one role: Home (the toggle), My Orders (the tab), order detail (the
viewer's role). Pages with no role (Profile, admin) leave it unset.

Radius follows hierarchy: `--radius-s` (8px) inputs, `--radius-m` (12px) inner panels and images,
`--radius-l` (18px) cards and modals, `999px` buttons, chips and the mode switch.

## 2. Type

- **Display: Bricolage Grotesque** (`--font-display`), weights 700–800, tracking −0.02 to −0.035em. All `h1`–`h3`,
  big numbers (credit balances, credit offers, OTP digits).
- **Body: Figtree** (`--font-body`), 400 and 700. Everything else. (Atkinson Hyperlegible was tried and dropped:
  its slashed zero made opening hours read like strikethrough.)
- Both load through `next/font/google` in `app/layout.tsx` as CSS variables.
- Sentence case everywhere: headings, buttons, badges. No all-caps labels, no tracked-out eyebrows above headings.

## 3. Signature elements

Spend boldness here; keep everything else quiet.

1. **The route line.** Pickup = hollow accent ring; drop-off = solid ink square; joined by a dotted line.
   It appears on order slips (`.order-route`), the order form (`RoutePreview`), the logo (`RouteMark`) and the
   lifecycle tracker. New order-related UI should reuse it instead of a plain "Pickup: X / Drop-off: Y" list.
2. **Order slips.** `OrderCard` is a ticket: description and route above a dashed perforation with side notches;
   credits (coin + number in display type) and actions below it.
3. **Hard ink shadows** on the auth card and modals (`8–10px 8px 0 var(--ink)`). Ordinary cards use a soft lift
   shadow only on hover. Don't add the hard shadow to ordinary cards; it belongs to the "focus" surfaces.
4. **The dark credit card** on Profile: ink background, gold available balance.

## 4. Motion

Motion answers what the user did. There are no entrance animations on page load and no staggered card reveals.

| Moment | What moves | Where |
|---|---|---|
| Hover a location card | lifts 5px, ink border, image zooms 1.07, type chip takes accent, "Order from here" drops in, building icon hops | `.location-card` (only `@media (hover: hover)`; on touch the button is always visible) |
| Hover an order slip | lifts 3px, coin flips | `.order-card` |
| Toggle requester/courier | thumb slides with spring, page accent cross-fades | `.mode-switch` |
| Both route ends chosen | nodes fill, courier dot rides the route on loop | `.route-preview.is-ready` |
| Order created | parcel drops, speed trail draws, check pops | `DispatchedArt` in `OrderFormModal` |
| Order status | completed segments fill; current step pulses | `.order-lifecycle` |
| Modal / toast / proposal | spring scale-in, slide-in | `.order-modal[open]`, `.error-toast`, `.proposal-box--action` |
| Live polling | green pulsing dot | `.live-dot` |

Rules:
- Easing: `--ease-out` for movement, `--ease-spring` for things that pop or settle. 150–400ms; loops only for
  "live" or "in progress" signals.
- `prefers-reduced-motion: reduce` collapses every animation and transition (bottom of `globals.css`).
  Any new keyframes are covered automatically; check that the end state still makes sense without motion.
- Animate `transform` and `opacity`; avoid animating layout properties.

## 5. Components and classes

Prefer the existing classes; add Tailwind utilities for layout (grids, responsive columns), as the frontend's
`AGENTS.md` requires.

- Buttons: `.primary-button` (accent pill), `.secondary-button`, `.danger-button`, `.icon-button` (+ `--danger`).
  Put an icon from `icons.tsx` before the label when it helps scanning (`<PlusIcon size={16} />Create Order`).
- Fields: any `input`/`select`/`textarea` inside `.order-form`, `.manage-form`, `.location-filters` or `.auth-field`
  gets the shared field style with an accent focus ring.
- Status: `StatusBadge` (colours in `lib/orders.ts` `STATUS_COLORS`); `.status-pill` for other chips.
- Empty states: `.home-empty` with `<EmptyArt kind="orders" | "locations" />`, a bold one-line `strong`, and a
  `p` that says what to do next.
- Modals: `Modal` / `ConfirmModal` from `components/modal.tsx` (native `<dialog>`).
- Icons: 24-grid stroke icons in `icons.tsx`, `aria-hidden`. Add new ones there in the same style
  (2px stroke, round caps) rather than importing an icon library.

## 6. Copy

Follow the terminology rules in the root `AGENTS.md` §2 (order, requester, courier, location). Plus:
- Say what happens: "Create Order", "Order from here", "View order". The success state reuses the action's noun
  ("Order placed").
- Headings speak to the student's goal in each mode ("What do you need picked up?", "Deliver on your way").
- Errors say what went wrong and what to do; empty states invite the next action.
- No `→` glued onto link text, no "A · B · C" meta strings in new UI.

## 7. Checklist before you finish a UI change

- [ ] Uses tokens and `--accent`, no new hex values; works in both `data-mode`s.
- [ ] Reuses the route line / slip / empty-state pieces where the content is an order or location.
- [ ] Keyboard: every action reachable, `:focus-visible` ring visible; hover-only actions also appear on `:focus-within`.
- [ ] Responsive at 375px and 1280px (the header nav scrolls horizontally on mobile).
- [ ] Reduced motion leaves a sensible static state.
- [ ] Live data only (no mock locations or orders), per the root `AGENTS.md` D2 UI rules.
- [ ] AI disclosure header and `// AI-generated` markers added, as the root `AGENTS.md` requires.
