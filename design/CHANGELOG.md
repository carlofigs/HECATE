# HECATE design layer — changelog

Semver (G-01). Each entry lists the rule IDs it concerns.

## [0.9.0] — 2026-11-11

### Added

- **The Activity page** (C-02, C-05, at `candidate`). It shows the log by day, marks entries **New** since you last looked, and has **Mark all as read**, **Load older** and **Add to log** (a flag or a session).
- **New counts:** "Activity 7 new" in the header, and on More's Activity link.

### Changed

- **Navigation:** Activity is the sixth page.

## [0.8.0] — 2026-11-10

### Added

- **People** (C-02, C-05, at `candidate`):
  - the **People page**, with the **glossary** (add, edit, remove with Undo, and a filter);
  - a **page per person** showing what links to them: tasks waiting on them, cutoffs, meetings and their leave. Removal is confirmed, or explained when core would refuse it.
- **The person, leave and term editors.** A sanitised workspace never offers a name or aliases (ADR 0005).
- **Person pickers:** a B task's **Person** in the task editor, and a cutoff's **Person** in the project editor.

### Changed

- **Navigation:** People is the fifth page: in the header, and under More on phones. The header wraps below about 1,000 px.

## [0.7.0] — 2026-11-10

### Added

- **The Sprint page** (C-02, C-05, at `candidate`): the goal and retro, editable at any time; a closed sprint's archived and carried tasks; every sprint with its counts.
- **Close sprint:** a review that previews exactly what the close will archive and carry (core applies the op to a copy), warns on an early close, and takes a retro. It closes with one op and makes one commit.
- **More:** a page of the pages the phone's bottom bar has no room for.

### Changed

- **Navigation:** Sprint joins the header. The phone's bar shows Today, Board and More, so it still fits beside a page's action at 320 px (R-07, M-app-07).

## [0.6.0] — 2026-11-09

### Added

- **Projects** (C-02, C-05, at `candidate`):
  - the **project list**, live projects first, each with its open tasks, open questions and next deadline;
  - the **project page**: every linked task, archived ones under the sprint that closed them; next actions, open questions, deadlines and cutoffs, each editable with an exact Undo on removal; the timeline, refs and sections read-only;
  - the **project editor** (overview, new or existing) and the **item editor**.
- **PageShell `back`:** a link to the page this one belongs to.

### Changed

- **Navigation:** Projects joins Today and Board. Below `md` the bottom bar shows each page as an icon over its label, so three pages and the page's action fit at 320 px (R-07, M-app-07); a fourth page will turn the last slot into More.
- **The workspace switcher** keeps the section.
- **Second surface reached** by `CheckboxField` and `EmptyState`.

## [0.5.0] — 2026-11-09

### Added

- **Editable Today** (C-02, C-05, at `candidate`):
  - the **focus item editor and item controls**: today's plan, this week's priorities and callouts, and keep-in-mind, each with visible Edit, Move and Remove controls, Undo where it is exact, and a confirmation where it is not (R-24, M-app-05);
  - **Close the day**: how each plan item went, what else was done, and a note, recorded against the plan; editable once closed.
- **`CheckboxField`:** the whole label is the target (R-07).

### Changed

- **Today is no longer read-only,** except for the schedule, which the calendar owns (`focus-item-editor.md`).
- **Second surface reached** by `IconButton`, `Dialog`, `ConfirmDialog`, `Menu`, `Toast` and the text and radio fields, now on Today and the Board (C-05). They still need the manual passes to become `stable`.

## [0.4.0] — 2026-11-09

### Added

- **Installable:** a web manifest and icons (trinity on the indigo badge; maskable with a safe zone). The manifest's `theme_color` and `background_color`, and a `theme-color` per scheme, are read from `tokens/tokens.json` (`color.bg.surface`, `color.bg.canvas`), never restated.
- **The shell's offline banner and update banner,** both `Banner` patterns (M-app-05).
- **An unload warning** while changes wait to be sent (M-app-06).

### Changed

- **The shell is an app layout:** only the page scrolls, between the header and the bottom bar, so nothing on it can sit under them (R-07; WCAG 2.4.11).

## [0.3.0] — 2026-11-09

### Added

- **Components**, with specs, at `candidate` (C-02, C-05):
  - `Dialog` and `ConfirmDialog` (R-24: focus on Cancel; the action never primary);
  - `Menu`;
  - `Toast` (M-app-05: 8 s, pausable, one action);
  - `TextField`, `TextAreaField`, `RadioGroupField` (M-app-03, R-09, R-27).
- **The Board's patterns:** task card, Board column, task editor.
  - Every action is a visible control.
  - Drag and drop always has a non-drag path (the Move menu, WCAG 2.5.7 under R-01) and screen-reader announcements.
- **Tokens:** `size.container.column` (vocabulary: `column`); `Button` `tone="danger"`; `iconButtonStyles()`.

### Changed

- **The shell:** a bottom bar below `md` with the navigation and the page's primary action (M-app-07).
- **Menu layer:** menus sit at `z.popover`, above sticky bars.

### Fixed

- Icon-only buttons no longer inherit text padding, which squeezed their icons.

## [0.2.0] — 2026-11-09

### Added

- **Components** in `packages/ui`, each with a spec in `components/` and at `candidate` (C-02, C-05):
  - `Button`, `ButtonLink`, `IconButton`;
  - `SelectField`;
  - `Badge` and `KeyChip`;
  - `Banner`, `EmptyState`, `Skeleton`, `VisuallyHidden`;
  - `Markdown` (no raw HTML; task keys as chips; headings demoted, R-13).
- **App patterns:** the app shell (skip link, navigation with `aria-current`, sync status in words, workspace switcher) and PageShell (loading, error, partial and repository-problem states: R-25, R-26, R-27).
- **The accessibility gate** (R-29 layer 1) in `apps/worker/e2e`, run in CI:
  - axe with zero violations, also counting measured contrast filed as "needs review";
  - target sizes against the adaptive floor (R-07);
  - reflow at 320 px (R-10);
  - text-spacing overrides (R-11);
  - outline and landmarks (R-13);
  - a keyboard pass through the shell with visible rings (R-05, R-06).
  - All of it at three widths, in light and dark.

## [0.1.0] — 2026-11-09

### Added

- **The standard:** `DESIGN-STANDARD.md` v1.4.0 vendored with its rule index and query CLI. The owner line is redacted; see `README.md`.
- **The design language:** `DLS.md`, `principles.md`, `foundations.md` and `DECISIONS.md`.
  - Profile `app`, conformance target Extended.
  - Touch-first density on coarse pointers and narrow viewports (R-07, M-app-01).
  - Radix primitives as the base library (C-04).
- **The token layer:** `packages/ui/src/theme.css` (T-08 option B) and the generated `tokens/tokens.json` (T-09).
  - The palette: indigo-tinted neutrals and torch amber as the single accent (P-04).
  - Every R-21 role in light and dark (T-05, T-15).
  - The 1.25 major-third type scale (T-16) and the T-17 composites, with system font stacks (T-18).
  - The 4 px space scale and its inset, stack and inline roles.
  - Radius, elevation, size, motion, z, breakpoint and opacity scales.
- **Checks, in `packages/ui` and run in CI:**
  - drift (T-09);
  - vocabulary (T-06, T-07);
  - contrast in both themes (R-02, R-03, T-14, T-15);
  - type size and leading (R-16, R-17);
  - targets (R-07);
  - Tailwind refusing off-scale utilities (R-15, T-04);
  - literal values in UI code (R-15).
