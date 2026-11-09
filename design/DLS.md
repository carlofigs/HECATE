# HECATE — Design Language System

This is the project layer between [`DESIGN-STANDARD.md`](DESIGN-STANDARD.md) (Layer 0, v1.4.0) and the code, and it is the index to everything else:

- **What HECATE is and what it has decided:** this file.
- **Values and their reasons:** [`foundations.md`](foundations.md), with `packages/ui/src/theme.css` holding the values themselves.
- **Deviations:** [`DECISIONS.md`](DECISIONS.md).

**Standard version:** v1.4.0 · **Conformance target:** Extended · **Ownership:** centralised

> **Approver.** The repository owner approves MUST exceptions (G-07) and changes to `foundations.md` (§8.1). Agents draft and stop; they do not self-approve.

---

## 1. What HECATE is

HECATE is a single-user planning system: focus, tasks, projects, sprints, people and an activity log, kept in a private git repository. The v2 web app (`apps/web`) is served by the same Cloudflare Worker as the API and the MCP connector.

| Surface | What it is | Profile | Touch-first |
|---|---|---|---|
| Today (built) | The day at a glance: schedule, plan, the week, in progress, waiting on, blocked, due soon, cutoffs, keep in mind | `app` | Adaptive (below) |
| Board (P4 PR 3) | Tasks by status: drag, add, edit, complete | `app` | Adaptive (below) |
| Sign-in and shell (built) | GitHub sign-in, workspace switcher, navigation, sync status | `app` | Adaptive (below) |

**Profile:** `app` only. Nothing in P4 is a chart, so `viz` is not declared (M-viz-11 allows one surface to take it later).

### Touch-first (R-07, Tier 0): adaptive

HECATE is used at a desk and on a phone, so the declaration follows the device rather than the surface.

- **Every surface is touch-first wherever the device has a coarse pointer or the viewport is narrower than `breakpoint.md`.** There, targets are at least 44 px (`size.target.touch`) and comfortable density uses `size.control.lg` (M-app-01).
- **Elsewhere,** with a fine pointer on a wide screen, the 24 px floor applies (`size.target.min`) and controls use `size.control.md`.

Components never branch on this. They size themselves from `size.control.default` and `size.target.default`, and `theme.css` re-maps those two tokens under `(any-pointer: coarse), (width < breakpoint.md)`.

`any-pointer` rather than `pointer` means a touchscreen laptop gets touch targets even while a mouse is attached. The e2e suite measures both floors on every control: 44 px at the phone and 320 px widths, 24 px on the desktop (`apps/worker/e2e/layout.spec.ts`).

## 2. Base component library (C-04)

**Radix primitives** (the `radix-ui` package), unstyled and themed entirely through tokens. They arrive with the first dialog and menu in PR 3.

- **Native HTML elements** wherever they are enough: buttons, links, `<select>`, date inputs. The components so far are all native or custom.
- **Icons:** `lucide-react`, always decorative beside a word, or named by their control.
- **Markdown:** `react-markdown` with no raw HTML.
- **Drag and drop:** `dnd-kit` on the Board, always alongside a non-drag way to do the same thing (WCAG 2.5.7 under R-01).

No opinionated visual library is used.

## 3. Foundations

Values and rationale are in [`foundations.md`](foundations.md):

| Category | Status |
|---|---|
| Colour | `draft`: brand neutrals, torch-amber accent, four status roles, light and dark |
| Vocabulary and naming | `draft`: T-06 grammar throughout, mapped from Tailwind's namespaces |
| Type | `draft`: 1.25 major-third scale, system font stacks |
| Space, size, radius, elevation | `draft` |
| Motion, layout, z, opacity | `draft` |

All five are `draft` until the owner approves this foundation by merging it.

**Token implementation:** T-08 peer default **(B)**.

- `packages/ui/src/theme.css` (Tailwind v4 `@theme`) is the source.
- `tokens/tokens.json` is generated from it with `pnpm tokens`. A test fails if the two drift (T-09).
- There is no separate `tokens.css`: the stylesheet itself is the CSS artefact.

**Themes:** light and dark, both following the operating system's setting through `prefers-color-scheme`. There is no manual override yet. The structure allows one (a `data-theme` attribute re-mapping the same Tier 2 tokens) when one is wanted.

## 4. Status: what is safe to build on (D-06, C-05)

The C-05 ladder runs `draft` → `candidate` → `stable` → `deprecated`. Only `stable` may be depended on by other components.

**Candidate** means: a spec in `components/`, in use on a surface, and a clean automated scan. The scan is `apps/worker/e2e`, axe at three widths in both schemes, in CI.

**Stable** needs three more things:

- use on a second surface (the Board, PR 3);
- the manual keyboard and screen-reader passes (R-29 layers 2 and 3);
- tests.

The e2e suite covers part of the keyboard pass (focus order and rings through the shell); the screen-reader pass has not been done.

| Section / component | Status | Next |
|---|---|---|
| Token layer (`theme.css`, `tokens.json`) | `draft` | The owner's approval of the foundations |
| `Button`, `ButtonLink`, `IconButton` | `candidate` | Second surface; manual passes |
| `SelectField` | `candidate` | Second surface; manual passes |
| `Badge`, `KeyChip` | `candidate` | Second surface; manual passes |
| `Banner` | `candidate` | Second surface; manual passes |
| `EmptyState` | `candidate` | Second surface; manual passes |
| `Skeleton`, `VisuallyHidden` | `candidate` | Second surface; manual passes |
| `Markdown` | `candidate` | Second surface; manual passes |
| App shell (pattern) | `candidate` | The bottom navigation bar below `md` (PR 3) |
| PageShell (pattern) | `candidate` | The Board (PR 3) |

## 5. Brand inputs

From `branding/README.md`:

| Name | Use in the system |
|---|---|
| Indigo black | `color.neutral.950`: dark canvas, light-theme text |
| Night ink | The mark on light backgrounds (the mark's own colour) |
| Moonlight silver | Close to `color.neutral.300`; the mark on dark backgrounds |
| Torch amber | `color.amber.400`: the single accent (`color.accent.default`) |

The trinity mark appears at 24 px and up. The hero keyblade is used for the 16 px favicon.

## 6. Files (D-01)

| File | State |
|---|---|
| `DLS.md`, `principles.md`, `foundations.md`, `DECISIONS.md`, `CHANGELOG.md` | Present |
| `tokens/tokens.json` | Present, generated |
| `tokens/tokens.css` | Not used: T-08 (B) makes `packages/ui/src/theme.css` the CSS |
| `rules.json`, `rules.yaml`, `rules.py`, `build_rules.py` | Vendored |
| `components/` | One spec per component and per app pattern (shell, PageShell) |
| `patterns.md`, `content.md` | Created when needed |
