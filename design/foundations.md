# HECATE — foundations

These are the values chosen for each category in `DESIGN-STANDARD.md` §4, with the reason for each. This file records decisions. The numbers live in `packages/ui/src/theme.css` (the source) and `tokens/tokens.json` (generated), and are not repeated here (§4: values are data).

**Status:** `draft`. Every category is decided and covered by the checks in `packages/ui/test/`; the owner approves by merging.

---

## Tiers and how they are enforced

| Tier | What | Where in `theme.css` | Reachable from components? |
|---|---|---|---|
| 1, primitive (T-01) | Colour ramps, the 4 px space scale, font sizes, weights, leading, tracking, radii, border widths, shadow levels | Plain custom properties in `@layer theme { :root }` | **No.** They are outside `@theme`, so Tailwind generates no utility for them (T-04 by construction) |
| 2, semantic (T-02) | Colour roles, space roles, the text composites, radius roles, elevation roles | `@theme static` | Yes, as utilities: `bg-bg-surface`, `text-text-muted`, `p-inset-md`, `text-body-md`, `rounded-control`, `shadow-raised` |
| Scales consumed directly | Size, breakpoint, grid, z, motion, opacity | `@theme static` | Yes: `min-h-(--size-control-default)`, `z-(--z-modal)`, `duration-(--motion-duration-fast)`, `md:` |
| 3, component (T-03) | None yet | Created only when a component needs an override | — |

`@theme { --*: initial; }` removes Tailwind's default theme. HECATE's tokens are therefore the only vocabulary utilities can use: `p-4`, `bg-slate-500`, `text-sm` and `shadow-md` generate nothing (`test/theme.test.ts`). What Tailwind can still produce without a theme (arbitrary values, `z-10`, `duration-200`, `border-2`) is caught by `test/literals.test.ts` (R-15).

**Themes and density re-map Tier 2 only (T-05).** `theme.css` re-maps semantic tokens under `@media (prefers-color-scheme: dark)` and under the touch-first condition. Components contain no `dark:` utilities and no pointer logic.

**Tailwind namespaces → standard names.** The generator maps Tailwind's namespaces onto the standard's categories when it writes `tokens.json`:

| Tailwind | Standard |
|---|---|
| `--spacing-*` | `space.*` |
| `--font-*` | `font.family.*` |
| `--container-*` | `size.container.*` |
| `--ease-*` | `motion.easing.*` |

Primitive families follow their CSS spelling (`--font-line-height-*` → `font.lineHeight.*`). The `--default-*` properties are Tailwind's own settings pointed at tokens; they are not tokens themselves.

## Colour

**Model.** Six primitive ramps (`neutral`, `amber`, `orange`, `green`, `red`, `blue`) plus `white`.

- **Lightness steps.** Every ramp uses the standard's OKLCH lightness steps (Appendix A.1), from 0.985 at `50` to 0.199 at `950`. A semantic role therefore keeps its contrast whichever hue it draws from.
- **Brand neutral.** `neutral` is tinted toward the brand's indigo: the hue moves from silver-blue at the light end to indigo at the dark end.
  - `neutral.950` is the brand's indigo black exactly.
  - `neutral.300` is within a step of moonlight silver.
- **Accent: torch amber.** `amber.400` is the brand's torch amber exactly, and it is the **only accent** (P-04).
  - Torch amber is 2.2:1 on white, so it never carries text or boundaries in light mode. It is a fill (`accent.default`) under dark text (`text.on-accent`).
  - Amber text and strokes in light mode come from `amber.800`/`amber.700`.

**Status roles (R-21, R-22).** HECATE's status roles are the standard's outcome set: `success`, `warning`, `danger` and `info`.

- **Warning is orange.** It takes hue 50, not the standard's default amber, so a warning can never be mistaken for the accent (P-04, R-22). It stays well apart from `danger` (ΔE2000 ≈ 14–17 between the icon colours).
- **Light mapping:** `bg` 50, `text` 800, `border` and `icon` 600, as in the standard's defaults.
- **Dark mapping:** `bg` 950, `text` 200, `border` and `icon` 400.
- **Never colour alone:** status colour always comes with an icon or a word (R-04).

**Roles beyond the standard's minimum.** All of these were declared before use (T-07):

- `color.bg.surface.hover`: the hover tint of rows and cards.
- `color.bg.overlay`: the dialog scrim, the canvas mixed at 60%, or 70% in dark.
- `color.text.on-accent`: text on accent fills, the same dark ink in both themes.

**Dark theme (T-15).** Dark is validated separately, not derived from light.

- **Backgrounds:** the canvas is indigo black, and surfaces step up the neutral ramp.
- **Accent and status:** taken from steps 200–400, which the tests enforce.

**Validation.** `test/tokens.test.ts` checks every text-on-background pair (4.5:1), every boundary, focus and icon pair (3:1), each status trio, and accent fills under their text, in both themes, on every CI run (R-02, R-03, T-14). It replaces the upstream kit's `check_palette.py`. Every pair passes. The tightest margins are muted text on the subtle backgrounds and the light theme's focus ring on the subtle background, each within about 5% of its threshold.

**No categorical palette.** HECATE has no data series. Tags are neutral text chips, so R-14's colour-vision check has nothing to run on until a categorical palette is added.

## Typography

- **Scale (T-16):** option (a), the **1.25 major third** on a 16 px base. The steps run `xs` to `4xl` (12 → 49 px, rounded as in Appendix A.4). One scale serves the whole app: Today is reading and the Board is scanning, and neither needs a second.
- **Families (R-19, T-18):** system stacks only. `font.family.sans` is the platform UI face and `font.family.mono` the platform monospace (P-11). There are no web fonts, so nothing to self-host, subset or precache.
- **Composites (T-17):** `text.display`, `text.heading.1`–`4`, `text.body.lg`/`md`/`sm`, `text.label`, `text.caption`, `text.code` and `text.data`. Each uses one utility (`text-heading-2`).
  - **Leading:** body styles use 1.5 and headings 1.2–1.3 (R-17). Body is 16 px; captions are 12 px and never primary content (R-16).
  - **Family:** Tailwind's `text-*` utilities set size, leading, weight and tracking, not family. `text.code` records `font.family.mono`, but code gets it from `<code>` (base.css) or `font-mono`.
  - **Data:** `text.data` is used with `tabular-nums`, right-aligned (R-20).
- **Weights:** `regular` 400, `medium` 500 (labels), `semibold` 600 (headings, `<strong>`).

## Space and size

- **Space (§4.6):** the 4 px scale (`space.1`–`24`) is Tier 1. Layout code uses three role families and `space.0` (`p-0`, `inset-0`):
  - `inset` for padding inside a container;
  - `stack` for vertical rhythm;
  - `inline` for horizontal gaps.
  - Each family has steps `xs`–`xl`.
- **Grid:** 4/8/12 columns at `sm`/`md`/`lg`. The page gutter is `space.inline.lg`, and `space.inline.xl` from `lg` up.
- **Controls and targets (R-07, M-app-01):** `size.control.sm`/`md`/`lg` (32/40/48 px), `size.target.min` (24) and `size.target.touch` (44). Components size from two density tokens that the touch-first condition re-maps (`DLS.md` §1):
  - `size.control.default` is `md`, or `lg` when touch-first;
  - `size.target.default` is `min`, or `touch` when touch-first.
- **Icons:** `size.icon.sm`/`md`/`lg` (16/20/24 px).
- **Containers:** `size.container.prose` (72ch, R-18) for running text, `size.container.app` for the page, and `size.container.column` for a Board column's narrowest width.

## Shape and elevation

- **Radius (T-19):** one `radius.control` (`md`), one `radius.container` (`lg`), and `radius.pill` for pill shapes.
- **Borders:** `border.width.sm` (1 px, Tailwind's `border`) for boundaries and `border.width.md` (2 px) for the focus ring.
  - The focus ring is an outline in `color.border.focus` at `border.width.md`, offset by the same width (R-05). It is set once in `base.css` for every focusable element.
- **Elevation:** shadow levels `1`–`4` are Tier 1. Components use three roles:
  - `shadow.raised` for cards;
  - `shadow.overlay` for menus, popovers and toasts;
  - `shadow.modal` for dialogs.
  - Shadows are subtle in dark, where surfaces step up the neutral ramp instead.

## Motion

- **Durations:** `instant` (0), `fast` (120 ms, the default for state changes), `base`, `slow`, and `deliberate` (never for state changes).
- **Easings:** `standard`, `enter`, `exit`, and `linear` (only for continuous indicators).
- **Reduced motion (R-12):** under `prefers-reduced-motion`, every animation and transition runs at `instant` (`base.css`). Only `transform` and `opacity` animate continuously (T-20).

## Layout and stacking

- **Breakpoints:** `sm`/`md`/`lg`/`xl`/`2xl` (40/48/64/80/96 rem), the `md:`-style variants.
- **Z (R-15):** a z-index comes from `z.*` and nothing else. The levels, in order: `base`, `raised`, `dropdown`, `sticky`, `overlay`, `modal`, `popover`, `toast`.
- **Opacity:** `disabled`, `overlay`, `muted`.

## Vocabulary (T-07)

Every segment of every token name, and every component prop value (C-07), comes from this list. `packages/ui/scripts/vocabulary.ts` is its machine-readable form, copied into `tokens.json` under `$extensions.dls.vocabulary`. The tests fail on any term that is used without being declared, declared without being used, or missing from this table.

| Group | Terms |
|---|---|
| Categories | `color`, `space`, `font`, `text`, `radius`, `border`, `shadow`, `size`, `breakpoint`, `grid`, `z`, `motion`, `opacity` |
| Ramps | `white`, `neutral`, `amber`, `orange`, `green`, `red`, `blue` |
| Concepts | `bg`, `text`, `border`, `accent`, `status`, `inset`, `stack`, `inline`, `family`, `size`, `weight`, `lineHeight`, `letterSpacing`, `display`, `heading`, `body`, `label`, `caption`, `code`, `data`, `width`, `control`, `target`, `icon`, `container`, `columns`, `gutter`, `duration`, `easing` |
| Variants | `canvas`, `surface`, `raised`, `subtle`, `overlay`, `primary`, `secondary`, `muted`, `inverse`, `link`, `on-accent`, `default`, `strong`, `focus`, `success`, `warning`, `danger`, `info`, `sans`, `mono`, `regular`, `medium`, `semibold`, `tight`, `snug`, `normal`, `none`, `full`, `pill`, `modal`, `min`, `touch`, `prose`, `app`, `column`, `base`, `dropdown`, `sticky`, `popover`, `toast`, `instant`, `fast`, `slow`, `deliberate`, `standard`, `enter`, `exit`, `linear`, `disabled` |
| States | `hover`, `active` |
| Steps | `0`, `1`, `2`, `3`, `4`, `5`, `6`, `8`, `10`, `12`, `16`, `20`, `24`, `50`, `100`, `200`, `300`, `400`, `500`, `600`, `700`, `800`, `900`, `950`, `xs`, `sm`, `md`, `lg`, `xl`, `2xl`, `3xl`, `4xl` |
| Component props (C-07) | `variant`: `primary`, `secondary`, `ghost` · `size`: `sm`, `md`, `lg` · `tone`: `neutral`, `accent`, `success`, `warning`, `danger`, `info` |

**Terms with special meanings:**

- `on-accent` is one segment: text that sits on an accent fill.
- `default` means the role's resting value. Under `size.*` it means the current device's density.
- `touch` is the touch-first target size.
- `prose`, `app` and `column` are the container widths.
