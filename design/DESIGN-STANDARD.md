# Design Language Standard

**Version:** 1.4.0
**Owner:** the repository owner
**Status:** Active
**Applies to:** every project, tool, dashboard, site, document or deck produced by me or by agents working for me.

---

## 0. How to read this document

### 0.1 What this is

This is a **meta-standard**. It does not define the look of any one project. It defines the rules and the process by which each project's own **Design Language System (DLS)** is derived, so that every project starts from the same foundation and only diverges where there is a reason to.

```
┌──────────────────────────────────────────────────────────────┐
│  Layer 0  DESIGN-STANDARD.md  (this file — project-agnostic)  │
│           principles · non-negotiable rules · token schema    │
│           medium profiles · documentation & governance spec   │
├──────────────────────────────────────────────────────────────┤
│  Layer 1  Project DLS  (per project — design/ folder)         │
│           DLS.md · principles · foundations · tokens ·        │
│           components · patterns · content · DECISIONS.md ·    │
│           CHANGELOG.md                                        │
├──────────────────────────────────────────────────────────────┤
│  Layer 2  Implementation  (per project — code / files)        │
│           tokens.css · component code · docx/pptx styles ·    │
│           chart themes · Tailwind @theme · etc.               │
└──────────────────────────────────────────────────────────────┘
```

A project DLS **inherits** everything here. It may **extend** the standard, and it may **deviate** from guiding principles freely, but it may only deviate from a **MUST**-level rule through the exception process in §8.4.

### 0.2 Rule metadata — four independent axes

Every rule row carries four tags. They answer different questions and are never inferred from one another.

| Axis | Column | Values | Question it answers |
|---|---|---|---|
| **Strictness** | Level | `MUST` · `SHOULD` · `MAY` (RFC 2119) | Can I deviate, and what does it cost? |
| **Precedence** | Tier | `T0` Blocking · `T1` Structural · `T2` Quality | When two rules collide, or time is short, which wins? |
| **Retrieval** | Topic | `a11y color type space layout motion tokens component interaction content viz doc docs governance process performance` | Which rules apply to the thing I'm touching? |
| **Verification** | Check | `script` · `data` · `review` · `judgement` | How is conformance established — and therefore how much can drift? |

**Level** — strictness and the deviation cost.

| Level | Meaning | Deviation |
|---|---|---|
| **MUST / MUST NOT** | Conformance fails without it. | Only via a recorded exception (§8.4). Agents draft, humans approve. |
| **SHOULD / SHOULD NOT** | Strong default. Follow unless there is a documented reason not to. | One-line entry in `DECISIONS.md` |
| **MAY** | Permitted option. | None |

A rule's Level is the value in its **Level column**, not the keyword that happens to appear in its sentence — several rules carry a MUST clause and a SHOULD clause; the column states the strictest one, and the sentence tells you which clause is which.

**Tier** — precedence, for conflict resolution and triage. Independent of Level: a `T2 MUST` is still mandatory, it just yields to a `T0` rule when they collide.

| Tier | Name | Test | Examples |
|---|---|---|---|
| **T0** | Blocking | Violating it harms or excludes a user, or misleads them about data. Nothing about the project's context makes it acceptable. Never scoped out; exceptions are near-impossible to justify. | R-04 colour alone, R-06 keyboard, M-viz-06 zero-based bars, M-app-06 never lose field input |
| **T1** | Structural | Violating it breaks the system's integrity — tokens, states, required docs, versioning — so later work compounds the damage. Exceptions are possible with a migration path. | R-15 tokens only, R-26 data-view states, D-01 folder, G-01 semver |
| **T2** | Quality | Violating it makes the result worse but not wrong. Where most SHOULDs live; also MUSTs that fix a scale value. | T-19 single radius pair, M-app-05 feedback level, D-09 doc depth |

Conflict rule: **lower tier number wins; within a tier, MUST beats SHOULD; within that, the principle order (§2) decides.** Every `T0` rule is `MUST` by definition (lint-enforced).

**Topic** — one or more tags for filtering. Topic is *not* the section: accessibility rules live in §3, §4, §5 and §6, and the tag is how you collect them all.

**Check** — how conformance is established. `script`: a shipped or standard tool decides (contrast/CVD validator, literal grep, axe, lint, scripts-blocked load). `data`: the rule is satisfied by taking the value from `tokens.json` rather than remembering it. `review`: a person or agent answers yes/no by inspection against criteria stated in the rule. `judgement`: taste. Rules drift in proportion to how far right they sit on that list, so the standard keeps `judgement` to a handful (Appendix G.3) and states every `review` rule with a measurable criterion.

**Refines** — a trailing `↳ refines X` marks a rule that narrows or specialises another (a WCAG criterion under the AA floor, a profile rule under a core rule). The child may add obligations of its own, but it never contradicts the parent and can never be less blocking than it (lint-enforced on Tier). Appendix G reports root obligations and refinements separately.

### 0.3 Rule identifiers

Every enforceable statement carries a stable ID so agents can cite it in reviews, commits, `DECISIONS.md` and checklists. **The prefix says where the rule lives in this document — nothing more.** Strictness is the Level column; precedence is the Tier column.

- `P-nn` — Guiding principle (§2). Ordered; the order is the priority.
- `R-nn` — Core rules (§3): the accessibility floor and the rules that apply identically to every medium.
- `T-nn` — Token and foundation rules (§4).
- `M-<profile>-nn` — Medium-profile rules (§5).
- `C-nn` — Component rules (§6).
- `D-nn` — Documentation rules (§7).
- `G-nn` — Governance rules (§8).

IDs are frozen from v1.3.0: never renumbered or reused. A retired rule keeps its ID with the text `Retired in x.y.z — see changelog`. (1.3.0 itself renumbered once, before any project cited an ID; the 1.2.0 → 1.3.0 map is in the changelog.) The machine-readable index of every rule with its metadata is `design/rules.json` / `rules.yaml`, generated from this file by `build_rules.py` (Appendix G).

### 0.4 Conformance levels

| Level | Requirement | When to use |
|---|---|---|
| **Core** | All `MUST` rules pass | Minimum for anything that ships, including internal tools and prototypes shared with others |
| **Extended** | Core + all `SHOULD` rules pass or have a recorded reason | Default for production apps, public sites, stakeholder-facing dashboards |
| **Reference** | Extended + full component documentation + tokens published as a package | Shared systems used by more than one project |

Throwaway spikes that nobody else will see are out of scope, but the moment they are shared they must reach Core.

---

## 1. Purpose and scope

### 1.1 Why a standard

- **Speed.** Most design decisions are the same across projects. Deciding them once and inheriting them removes hours of setup and a long tail of inconsistency.
- **Quality floor.** Accessibility, legibility and clarity are not project-by-project choices.
- **Agent-readiness.** Agents produce far better output from explicit, testable rules than from taste. This document is written to be consumed by agents as much as by people.
- **Flexibility where it counts.** Brand, personality, density and voice legitimately differ between a tournament scoring app, an executive dashboard and a festival marketing site. The standard fixes the skeleton and leaves the skin to the project.

### 1.2 What the standard covers

| Area | Covered here | Defined per project |
|---|---|---|
| Principles | Yes — universal set | Add project-specific ones |
| Accessibility floor | Yes — fixed | Raise it, never lower it |
| Token schema, tiers and naming | Yes — fixed | Values |
| Type, spacing, colour, motion **rules** | Yes | Actual typefaces, palette, scale choices |
| Component anatomy, states, docs format | Yes | Which components exist and how they look |
| Medium profiles | Yes — four profiles | Which profile(s) apply |
| Documentation structure | Yes — fixed | Content |
| Governance and versioning | Yes — fixed | Who reviews |
| Brand, voice, personality | No | Yes |

### 1.3 Sources

The standard synthesises established practice from NN/g (design system = style guide + component library + pattern library; adopt/adapt/create; when not to build), Figma (design system → component & pattern libraries → foundations; single source of truth), IE (DLS definition, tokens as raw material, audit → visual language → style guide & pattern library → documentation), UX Pilot (three-tier tokens, WCAG 2.2 AA baseline with three-layer testing, maturity ladder, share tokens not code, semver), Magic Patterns (five documentation layers, component-page checklist, do/don't pairs, audit cadence), zeroheight (documentation/delivery/measurement/management framing — article body not retrievable at time of writing), the W3C Design Tokens Community Group format, and WCAG 2.2. Appendix F maps each source's recommendations to the rules here and notes where this standard deliberately diverges.

---

## 2. Guiding principles (flexible)

Principles are the tie-breakers of last resort. When two rules of the same Tier and Level conflict, or a rule is silent, decide by principle. They are ordered; an earlier principle wins over a later one. Principles carry no Level, Tier or Topic tags — their position **is** their priority, and categorising twelve ordered statements would add nothing.

| ID | Principle | What it means in practice |
|---|---|---|
| **P-01** | **Clarity over cleverness** | The user should never have to work out what something is or does. Novelty is only acceptable when it is also clearer. |
| **P-02** | **Accessible by default** | Accessibility is a design input, not a QA step. If a choice is prettier but less accessible, the accessible choice wins. |
| **P-03** | **Design for the reading time** | Every screen, chart, page or slide has a target reading time. Decide it first, then remove whatever pushes past it. |
| **P-04** | **Restraint in colour** | Neutral base, one reserved accent, semantic colour only for meaning. Colour earns its place by carrying information (60-30-10 as the working ratio). |
| **P-05** | **Consistency over local optimisation** | Reuse the existing token, component or pattern even if a one-off would be marginally better. Consistency compounds; one-offs decay. |
| **P-06** | **Invisible when working** | Good structure, rhythm and hierarchy are felt, not noticed. If a user comments on the design instead of the content, look for what is shouting. |
| **P-07** | **Content first, chrome last** | Layout, navigation and decoration exist to serve the content. Design from the real content outward, not from the frame inward. |
| **P-08** | **Progressive disclosure** | Show what is needed for the current decision. Detail is one interaction away, not on the first screen. |
| **P-09** | **Build just enough, just in time** | Greenfield: do not build a component library up front — tokens first, a component when a second use appears, a pattern when a third does. Brownfield: audit first (§9.2 step 2), then standardise the highest-use, highest-variance elements before anything else. |
| **P-10** | **Decisions are documented, not remembered** | Any choice that could be questioned later gets a one-paragraph decision record. Undocumented deviations are bugs. |
| **P-11** | **Prefer the platform** | Native elements, system fonts, standard interactions and browser/OS conventions before custom ones. Custom only when the native fails a real need. |
| **P-12** | **Scalable over bespoke** | Choose approaches that survive a second project, a second medium and a second maintainer. |

Projects **MAY** add principles and **MAY** re-order P-03 onward. P-01 and P-02 stay first.

---

## 3. Core rules

These apply to every project, every medium, every conformance level. Every rule in this section is `MUST`; most are `T0`. An agent that cannot satisfy a `T0` rule **MUST** stop and raise it rather than ship around it. (Rules in §4–§8 are equally binding at their stated Level; this section is simply the medium-independent core.)

### 3.1 Accessibility

| ID | Level | Tier | Topic | Check | Rule |
|---|---|---|---|---|---|
| **R-01** | MUST | T0 | a11y | review | The accessibility floor is **WCAG 2.2 Level AA**. Projects MAY raise it; they MUST NOT lower it. |
| **R-02** | MUST | T0 | a11y · color | script | Body text contrast MUST be ≥ **4.5:1** against its background. Large text (≥ 24 px regular, or ≥ 18.66 px bold) MUST be ≥ **3:1**. ↳ refines R-01 |
| **R-03** | MUST | T0 | a11y · color | script | Non-text UI elements that convey state or boundary (input borders, focus rings, icons, chart marks, toggle states) MUST be ≥ **3:1** against adjacent colours. ↳ refines R-01 |
| **R-04** | MUST | T0 | a11y · color | review | Information MUST NOT be conveyed by colour alone. Pair colour with text, icon, pattern, position or shape. This applies to charts, status badges, form validation and links inside body copy. ↳ refines R-01 |
| **R-05** | MUST | T0 | a11y · interaction · layout | script | Every interactive element MUST have a visible focus state (`:focus-visible`) whose indicator is ≥ 3:1 against the adjacent background (WCAG 1.4.11) and is not obscured (2.4.11). Focus indicators MUST NOT be removed without an equivalent replacement. Default implementation: a `border.width.md` ring in `color.border.focus`, offset by `border.width.md`, so the canvas shows between element and ring and the ring is validated against `bg.canvas`/`bg.surface` rather than the element fill. ↳ refines R-01 |
| **R-06** | MUST | T0 | a11y | script | Every interactive element MUST be operable by keyboard alone, in a logical order, with no keyboard traps. ↳ refines R-01 |
| **R-07** | MUST | T0 | a11y · interaction | review | Pointer targets MUST be ≥ 24 × 24 CSS px (WCAG 2.5.8) on every surface. Surfaces declared **touch-first** in `DLS.md` (used mainly on phones/tablets or in the field — scoring, check-in, refereeing) MUST use ≥ 44 × 44 px (`size.target.touch`). Control heights below 44 px are permitted elsewhere provided the hit area, including padding and spacing, meets the 24 px minimum. ↳ refines R-01 |
| **R-08** | MUST | T0 | a11y | review | Every image, icon and chart MUST have a text alternative appropriate to its purpose: decorative → empty `alt`, informative → concise description, data chart → summary of the takeaway plus access to the underlying data. ↳ refines R-01 |
| **R-09** | MUST | T0 | a11y | review | Every form control MUST have a programmatically associated visible label. Placeholder text is not a label. ↳ refines R-01 |
| **R-10** | MUST | T0 | a11y | script | Content MUST reflow to a **320 px** viewport without horizontal scrolling (except for content that inherently requires 2-D layout such as data tables and maps, which scroll inside their own container). ↳ refines R-01 |
| **R-11** | MUST | T0 | a11y | script | Text MUST remain readable when users apply 200% zoom or override line-height (1.5×), paragraph spacing (2×), letter-spacing (0.12 em) and word-spacing (0.16 em). Do not set fixed heights on text containers. ↳ refines R-01 |
| **R-12** | MUST | T0 | a11y · motion | review | Motion MUST respect `prefers-reduced-motion`. Every animation has a reduced-motion variant; unless the spec says otherwise that variant is no motion at all (`motion.duration.instant`), or an opacity-only fade where a change would otherwise be invisible. Nothing flashes more than 3 times per second. ↳ refines R-01 |
| **R-13** | MUST | T0 | a11y | script | Semantic structure MUST be correct: one `h1` per page, heading levels not skipped, landmarks (`header`, `nav`, `main`, `footer`) present, lists as lists, tables as tables with header cells. Equivalent structure applies to documents and decks (real heading styles, real tables). ↳ refines R-01 |
| **R-14** | MUST | T0 | a11y · color | script | Every categorical or data palette MUST stay **distinguishable** under deuteranopia, protanopia and tritanopia, checked programmatically, not by eye: minimum ΔE2000 ≥ 8 between any two colours in the set under each simulation (`check_palette.py`). **This is a distinguishability test, not a contrast test.** Contrast is governed by R-02 and R-03 **on the actual colours**; a WCAG ratio recomputed on simulated colours is not a conformance criterion and MUST NOT be reported as an R-14 failure. Where a palette cannot be separated — identity colours that cannot change — R-04 applies instead: carry the meaning with something other than hue. ↳ refines R-01 |

### 3.2 Tokens and values

| ID | Level | Tier | Topic | Check | Rule |
|---|---|---|---|---|---|
| **R-15** | MUST | T1 | tokens | script | Every visual property (colour, type, spacing, radius, shadow, motion, z-index, breakpoint) MUST resolve to a token. Hard-coded literals in component code, chart configs or document styles are conformance failures. |

### 3.3 Typography, spacing, layout

| ID | Level | Tier | Topic | Check | Rule |
|---|---|---|---|---|---|
| **R-16** | MUST | T1 | type | data | Base body size MUST be ≥ 16 px (1 rem) on screen. Small/caption text MUST be ≥ 12 px and MUST NOT be used for primary content. |
| **R-17** | MUST | T2 | type | data | Body line-height MUST be between 1.4 and 1.6. Headings between 1.1 and 1.3. |
| **R-18** | MUST | T2 | type | review | Line length for running text MUST be constrained to 45–80 characters (target 60–75). |
| **R-19** | MUST | T1 | type | data | A project MUST use at most **two** typeface families (plus a monospace face for code and tabular data where needed). |
| **R-20** | MUST | T1 | type · viz | review | Numeric data in tables and dashboards MUST use tabular (monospaced-width) figures and MUST be right-aligned. |

### 3.4 Colour

| ID | Level | Tier | Topic | Check | Rule |
|---|---|---|---|---|---|
| **R-21** | MUST | T1 | color · tokens | review | Every project MUST define the semantic colour roles in §4.5 (background, surface, text, border, accent, and the four status roles) before any component is styled. |
| **R-22** | MUST | T1 | color | review | Status colours (success, warning, danger, info) MUST be reserved for status. They MUST NOT be used decoratively or as brand accents. |

### 3.5 Components and interaction

| ID | Level | Tier | Topic | Check | Rule |
|---|---|---|---|---|---|
| **R-23** | MUST | T1 | component | review | Every interactive component MUST define and style the states in §6.2 (at minimum: default, hover, focus-visible, active, disabled) and, where applicable, loading, error, selected. |
| **R-24** | MUST | T0 | interaction | review | Destructive actions MUST require confirmation or provide undo. They MUST NOT be the default or primary-styled action in a dialog. |
| **R-25** | MUST | T0 | interaction | review | Every asynchronous action MUST show a loading state within 100 ms of triggering and MUST show a success or failure outcome. Silent failure is a defect. |
| **R-26** | MUST | T1 | component | review | Every data view (table, list, chart, card grid) MUST design and implement its **empty**, **loading**, **error** and **partial/degraded** states, not just the happy path. |
| **R-27** | MUST | T1 | content · interaction | review | Error messages MUST say what happened, why (if known), and what to do next, in plain language, adjacent to the point of failure. |

### 3.6 Documentation and governance

| ID | Level | Tier | Topic | Check | Rule |
|---|---|---|---|---|---|
| **R-28** | MUST | T1 | process | review | Agents MUST run the conformance checklist (Appendix D) before declaring any design work done, and MUST report failures rather than suppress them. |
| **R-29** | MUST | T0 | a11y | script | Accessibility is verified in three layers before a component or surface is marked `stable`: (1) automated scan (axe-core or equivalent) with zero violations, run in CI where CI exists; (2) manual keyboard-only pass; (3) screen-reader pass (VoiceOver, NVDA or JAWS) for anything at Extended level or above. A component that fails any layer does not ship as `stable`. ↳ refines R-01 |

---

## 4. Foundations and tokens

Foundations are the shared vocabulary every component and page is built from. This section fixes the **schema** (what tokens exist, how they are tiered and named). The **values** are project decisions, with defaults given so a project can start with zero decisions and refine later.

### 4.1 Foundation categories

Every project DLS **MUST** define tokens for each category below. A category MAY be minimal, but it may not be absent.

| Category | Token prefix | Minimum content |
|---|---|---|
| Colour | `color` | Primitive ramps + semantic roles (§4.5) |
| Typography | `font`, `text` | Families, size scale, weights, line-heights, letter-spacing |
| Spacing | `space` | The 4 px scale (§4.6) |
| Sizing | `size` | Control heights, icon sizes, container widths |
| Radius | `radius` | none / sm / md / lg / full |
| Elevation | `shadow` | 0–4 levels (or borders-only if the project chooses flat) |
| Border | `border` | widths, default colour roles |
| Motion | `motion` | durations, easings |
| Layout | `breakpoint`, `grid`, `z` | Breakpoints, columns/gutters, z-index scale |
| Opacity | `opacity` | disabled, overlay, muted |

### 4.2 Token tiers

| ID | Level | Tier | Topic | Check | Rule |
|---|---|---|---|---|---|
| **T-01** | MUST | T1 | tokens | data | **Tier 1 — Primitive (option) tokens.** Raw values with no meaning attached: `color.blue.500`, `space.4`, `font.size.md`. These are the only tokens that hold literal values. |
| **T-02** | MUST | T1 | tokens | data | **Tier 2 — Semantic (decision) tokens.** Meaning without context: `color.text.primary`, `color.bg.surface`, `space.inset.md`, `text.body.md`. They alias primitives. This is the tier that changes between themes (light/dark/high-contrast) and between brands. |
| **T-03** | MUST | T1 | tokens | data | **Tier 3 — Component tokens.** Scoped to one component: `button.bg.primary.hover`, `table.row.height`. They alias semantic tokens. Create them only when a component needs an override that would otherwise be hard-coded; do not pre-create them. |
| **T-04** | MUST | T1 | tokens | script | Components and pages MUST consume Tier 2 or Tier 3 only. Referencing a Tier 1 token from a component is a conformance failure. |
| **T-05** | MUST | T1 | tokens | review | Theme variation (dark mode, brand skins, print, high-contrast) MUST be expressed as a re-mapping of Tier 2 tokens only. Tier 1 and Tier 3 are theme-invariant. Components MUST NOT contain theme-specific logic or overrides; a component that renders correctly in one theme renders correctly in all of them through its semantic tokens alone. |

### 4.3 Naming grammar

| ID | Level | Tier | Topic | Check | Rule |
|---|---|---|---|---|---|
| **T-06** | MUST | T1 | tokens | script | Token names MUST follow `category.concept[.qualifier…][.state]`: `category` (color, space, text…), `concept` (bg, text, status, accent…), then zero or more qualifiers ordered general → specific (a variant such as `danger` or `subtle`, a property such as `text` or `bg`, a level such as `raised`), and an optional interaction state last. Lower-case, dot-separated in JSON, hyphen-separated in CSS (`color.text.primary` → `--color-text-primary`). Test: reading left to right, each segment narrows the previous one, and nothing follows a state. |
| **T-07** | MUST | T1 | tokens · content | script | Token names MUST use only the vocabulary declared in `tokens.json` `$extensions.dls.vocabulary` (concepts, variants, states, size steps). A new term MUST be added there and to `foundations.md` before it is used. |

Examples:

```
color.blue.500                  # primitive
color.text.primary              # semantic
color.bg.surface.hover          # semantic with state
color.status.danger.text        # semantic status role
button.bg.primary.hover         # component
space.inset.md                  # semantic spacing
text.body.md                    # composite typography token
```

### 4.4 Token implementation — the hybrid rule

| ID | Level | Tier | Topic | Check | Rule |
|---|---|---|---|---|---|
| **T-08** | MUST | T1 | tokens | data | **Two peer defaults, neither needing an exception.** (A) `design/tokens/tokens.json` in W3C DTCG format is the source and `tokens.css` is generated from it. (B) Tailwind v4 `@theme` blocks are the source and `tokens.json` is generated from them. Pick by stack: a Tailwind v4 project takes (B), anything else takes (A), and **agents choose without asking**. Whichever is the source, the other artefact is generated, never hand-maintained (T-09), and the three tiers and naming grammar hold in both. A project MAY use a third implementation (Style Dictionary, native-platform resources, docx/pptx styles, a chart-library or BI theme) **only when the stack cannot consume CSS variables or JSON directly**, and then MUST (a) preserve the tiers and grammar, (b) record it in `DECISIONS.md`, and (c) keep `tokens.json` as the human-readable reference. |
| **T-09** | MUST | T1 | tokens | script | Tokens MUST be generated, never hand-duplicated. If `tokens.css` is derived from `tokens.json`, the generation script lives in the repo and runs in CI or a pre-commit hook. |
| **T-10** | SHOULD | T2 | tokens | data | Composite tokens (typography, shadow, border) SHOULD use DTCG composite types so they can be expanded per platform. |
| **T-11** | MUST | T1 | tokens | review | Across platforms and media, **share decisions, not implementation**: tokens, naming, type/spacing scales, motion values and component/variant vocabulary are shared; rendering, interaction behaviour, accessibility implementation and platform conventions are per platform. Never port component code between web, native and document stacks — port the tokens and re-implement. |

Minimal DTCG shape (full starter in Appendix A):

```json
{
  "color": {
    "blue": { "500": { "$type": "color", "$value": "#2563eb" } },
    "text": {
      "primary": { "$type": "color", "$value": "{color.neutral.900}",
                   "$description": "Default body and heading text" }
    }
  }
}
```

### 4.5 Colour system

**Structure (fixed).** Every project MUST define these semantic roles (R-21). Values are project decisions; defaults below give a neutral starting point.

| Role | Semantic tokens (min) | Default intent |
|---|---|---|
| Background | `color.bg.canvas`, `color.bg.surface`, `color.bg.raised`, `color.bg.subtle` | Page, cards, elevated panels, muted zones |
| Text | `color.text.primary`, `.secondary`, `.muted`, `.inverse`, `.link` | Hierarchy in three steps, plus on-dark and links |
| Border | `color.border.default`, `.strong`, `.subtle`, `.focus` | `default` = input and control boundaries (MUST meet 3:1, R-03); `subtle` = decorative dividers (no contrast requirement); `strong` = emphasis; `focus` = focus ring |
| Accent | `color.accent.default`, `.hover`, `.active`, `.text`, `.bg.subtle` | The one brand colour used for primary actions and selection |
| Status | `color.status.{success|warning|danger|info}.{bg|text|border|icon}` | Reserved for meaning (R-22) |
| Data (dataviz profile) | `color.data.categorical.1…8`, `color.data.sequential.*`, `color.data.diverging.*`, `color.data.highlight` | Chart series, ramps, single emphasis |

**Rules.**

| ID | Level | Tier | Topic | Check | Rule |
|---|---|---|---|---|---|
| **T-12** | SHOULD | T2 | color | script | The accent hue SHOULD occupy ≤ 10% of rendered pixels on any screen and the neutral ramp ≥ 60% (the 60-30-10 ratio). Check by pixel-counting a screenshot against the token palette; an accent share above 10% means something decorative is using the accent. |
| **T-13** | SHOULD | T2 | color | data | Pure black `#000` SHOULD NOT be used for text, and `#000`-on-`#fff` SHOULD NOT appear as a text/background pair; use the ramp end (`neutral.950`) for text to reduce halation while keeping ≥ 4.5:1. Pure white MAY be used as a surface. |
| **T-14** | MUST | T0 | color · a11y | script | Each status role MUST have a `bg` / `text` / `border` trio that passes R-02/R-03 in combination (e.g. `status.success.text` on `status.success.bg` ≥ 4.5:1). ↳ refines R-02, R-03 |
| **T-15** | MUST | T1 | color · tokens | script | Dark theme MUST be re-validated for contrast independently of the light theme, and SHOULD take accent and status colours from ramp steps 200–400 rather than 500–700 (lower chroma on dark surfaces). ↳ refines T-05, R-02 |

**Default palette (use until the project defines its own).** Neutral: a cool-grey OKLCH ramp. Accent: a single blue (`#2563eb` family). Status: green / amber / red / blue chosen so `text`-on-`bg` pairs pass 4.5:1 in both themes. Full values in Appendix A.

### 4.6 Spacing and sizing

Values live in `tokens.json` (`space.*` on a 4 px base, `size.*`) and Appendix A.4. R-15 makes every spacing value a token; layout code uses the semantic aliases `space.inset/stack/inline.*`, primitives stay inside the token file (T-04).

### 4.7 Typography

Scale sets, weights, families and letter-spacing live in `tokens.json` (`font.*`, `text.*`, `$extensions.dls.typeScales`). T-16 accepts a ratio set, a framework scale or an empirically derived one — whichever is chosen is named in `foundations.md`.

| ID | Level | Tier | Topic | Check | Rule |
|---|---|---|---|---|---|
| **T-16** | MUST | T1 | type | data | A project MUST settle on exactly one type scale and name it in `foundations.md`. Three first-class options, none requiring an exception: (a) a ratio set from `tokens.json` (`$extensions.dls.typeScales` ships 1.25 major-third and 1.333 perfect-fourth); (b) **the scale of the framework already in use** (Tailwind's default steps, for instance); (c) **an empirically derived scale** — clustered from real content rather than generated from a ratio. (b) and (c) MUST record the step values and one line of reasoning. Display sizes MAY sit outside the chosen scale. Composite `text.*` tokens reference the step names, so the choice never reaches components. |
| **T-17** | MUST | T1 | type | data | Composite text tokens MUST exist for at least: `text.display`, `text.heading.{1..4}`, `text.body.{lg,md,sm}`, `text.label`, `text.caption`, `text.code`, `text.data` (tabular numerals enabled). |
| **T-18** | MUST | T2 | type | data | Web fonts, if used, MUST be self-hosted (default) or served from a CDN named in `foundations.md`, subset to the characters needed, and loaded with `font-display: swap` behind a metric-compatible fallback. The default families are the system stacks in `font.family.*`. |

### 4.8 Radius, elevation, borders

Scales live in `tokens.json` (`radius.*`, `shadow.0…4` with per-level usage in `$description`, `border.width.*`). A project MAY choose a flat, borders-only elevation model by aliasing `shadow.*` to `none`.

| ID | Level | Tier | Topic | Check | Rule |
|---|---|---|---|---|---|
| **T-19** | MUST | T2 | layout | data | A project MUST set exactly one `radius.control` and one `radius.container` alias and apply them consistently. **Sibling elements of the same kind** with different radii are a defect; a deliberate distinction between kinds (a pill button beside a rounded input) is not. `radius.pill` is available for the pill case. |

### 4.9 Motion

Durations and easings live in `tokens.json` (`motion.*`; `deliberate` is never used for state changes, `linear` only for continuous indicators).

| ID | Level | Tier | Topic | Check | Rule |
|---|---|---|---|---|---|
| **T-20** | SHOULD | T2 | motion · performance | review | Animate only `transform` and `opacity` for anything continuous; layout properties (width, height, top, margin) MAY animate only for one-off state changes and never on scroll. |

### 4.10 Layout

Breakpoints, grid and the z-index scale live in `tokens.json` (`breakpoint.*`, `grid.*`, `z.*`); R-15 forbids any z-index outside `z.*`. Component-level responsiveness follows C-10.

---

## 5. Medium profiles

A project declares one or more profiles in `DLS.md`. Profiles add rules on top of §3 and §4; they never remove any. When a project spans profiles (an app with an embedded dashboard, a site with a downloadable report), each surface follows the profile that matches its purpose.

| Profile | Code | Typical outputs |
|---|---|---|
| Web application | `app` | Product UI, PWAs, admin/organiser tools, forms, tables, scoring and scheduling apps |
| Dashboard and data visualisation | `viz` | BI dashboards, KPI tiles, charts, reporting pages, analytical notebooks that are shared |
| Content and marketing site | `site` | Landing pages, event/festival sites, documentation sites, blogs |
| Documents and decks | `doc` | Reports, memos, slide decks, PDFs, one-pagers |

### 5.1 Profile `app` — web applications

| ID | Level | Tier | Topic | Check | Rule |
|---|---|---|---|---|---|
| **M-app-01** | SHOULD | T2 | layout | data | Density is a whole-view setting, never per component: **comfortable** (`size.control.md`, `space.inset.md`) by default; data-heavy views MAY switch to **compact** (`size.control.sm`, `space.inset.sm`). On touch-first surfaces comfortable uses `size.control.lg` and compact is not available (R-07). |
| **M-app-02** | MUST | T1 | interaction | review | Navigation MUST be consistent across the app: one primary nav location, current location always indicated, and a way back from every screen. |
| **M-app-03** | MUST | T1 | interaction | review | Forms: labels above inputs; required fields indicated in the label (not by colour alone); inline validation on blur, summary on submit; one primary action per form, positioned consistently (bottom-right on desktop, full-width bottom on mobile). ↳ refines R-04, R-09 |
| **M-app-04** | MUST | T1 | component · viz | review | Tables: sticky header, right-aligned numerics with tabular figures (R-20), row hover, sortable column indicator, ≤ 8 columns visible at `lg` before the table scrolls horizontally inside its own container, and a defined empty state (R-26). ↳ refines R-20, R-26 |
| **M-app-05** | SHOULD | T2 | interaction | review | Feedback level is chosen by persistence and blocking: field-level problems → inline message; confirmation of a completed action → toast (non-blocking, auto-dismiss ≥ 5 s, pausable); a condition that persists until resolved → banner; a decision required before continuing → dialog. Use the lowest level whose condition is met. |
| **M-app-06** | MUST | T0 | interaction | review | Offline/degraded states MUST be designed for anything used in the field (scoring, check-in, refereeing): show sync status, queue writes, never lose input. |
| **M-app-07** | MUST | T1 | layout · a11y | review | Mobile-first layout. On touch-first surfaces the primary action of each view sits in the bottom 40% of the viewport or in a fixed bottom bar, and targets follow R-07 (≥ 44 px). ↳ refines R-07 |

### 5.2 Profile `viz` — dashboards and data visualisation

| ID | Level | Tier | Topic | Check | Rule |
|---|---|---|---|---|---|
| **M-viz-01** | MUST | T1 | viz · process | review | Every dashboard MUST declare its **audience**, **primary question**, and **target reading time** at the top of its spec (P-03). Layout is then ordered by decision priority: headline KPIs → trend/context → detail/breakdown → raw data access. |
| **M-viz-02** | MUST | T1 | viz | review | Chart type is chosen by the comparison being made, not by novelty: change over time → line/area; part-to-whole → stacked bar or (≤ 5 slices) donut; ranking → horizontal bar sorted; distribution → histogram/box; relationship → scatter; single value vs target → bullet/KPI tile. Pie charts with > 5 slices, 3-D charts, dual-axis charts with unrelated scales, and gauges are NOT permitted without a recorded decision. |
| **M-viz-03** | MUST | T1 | viz · color | script | Colour: the neutral palette carries the chart (axes, gridlines, non-focus series in `color.text.muted` weight); `color.data.highlight` (typically the accent) marks the **one** series or point the chart is about. Categorical palettes MUST have ≤ 8 hues, MUST be CVD-checked (R-14), and MUST be assigned to categories consistently across all charts in the product (same category, same colour everywhere). ↳ refines R-14 |
| **M-viz-04** | MUST | T1 | viz · color | script | Sequential and diverging ramps MUST be perceptually uniform (OKLCH- or viridis-style), MUST have a defined neutral midpoint for diverging data, and MUST NOT rely on rainbow hues. |
| **M-viz-05** | MUST | T1 | viz | review | Every chart MUST have: a title written as a full sentence stating the takeaway or the question (a bare metric name is not a title), labelled axes with units, a source/as-of timestamp, and a text alternative (R-08). Legends SHOULD be replaced by direct labelling where there are ≤ 4 series. ↳ refines R-08 |
| **M-viz-06** | MUST | T0 | viz | review | Y-axes for bar charts MUST start at zero. Line-chart axes MAY be truncated but MUST show the break or start value explicitly. |
| **M-viz-07** | MUST | T1 | viz · component | review | KPI tiles: value in `text.data` at display size, label in `text.label`, delta with sign + colour + arrow (never colour alone), comparison period stated. Max 6 headline tiles per view. ↳ refines R-04 |
| **M-viz-08** | SHOULD | T2 | viz · color | review | Gridlines and axes use `color.border.subtle` / `color.text.muted`; data marks use `color.data.*`. No chart background, border or drop shadow other than the surface colour; no 3-D, gradients or decorative marks. |
| **M-viz-09** | MUST | T1 | viz | review | Interactive dashboards MUST expose filters' current state persistently, MUST show "no data for this selection" rather than a blank chart (R-26), and SHOULD allow export of the underlying table. ↳ refines R-26 |
| **M-viz-10** | MUST | T1 | viz · content · tokens | data | Number formatting MUST come from the `format.number.*` tokens (thousands separator, decimals per metric class, unit abbreviations); ad-hoc formatting in a chart or tile is a conformance failure. |
| **M-viz-11** | MUST | T1 | viz | review | Charts embedded in `app`, `site` or `doc` surfaces follow this profile for the chart itself and the host profile for everything around it. |

### 5.3 Profile `site` — content and marketing sites

Brand expression is allowed here more than anywhere else — display type, imagery, illustrative colour blocks — but every core rule still applies, and decorative colour never borrows the status hues (R-22).

| ID | Level | Tier | Topic | Check | Rule |
|---|---|---|---|---|---|
| **M-site-01** | SHOULD | T2 | type · layout | review | Type scale: 1.333 is the recommended starting point for this profile, but T-16's three options all apply; measure 60–75 ch; generous vertical rhythm (`space.stack.lg` between sections, `space.stack.xl` between major blocks). ↳ refines R-18, T-16 |
| **M-site-02** | SHOULD | T2 | interaction · content | review | One primary call to action per viewport; the same CTA style across the site. |
| **M-site-03** | MUST | T1 | performance | script | Performance is a design constraint: images sized and lazy-loaded with fixed aspect boxes (no layout shift), fonts subset, no render-blocking scripts for content. Target Largest Contentful Paint < 2.5 s on a mid-range phone. |
| **M-site-04** | MUST | T1 | performance | script | Primary content MUST render with JavaScript disabled (verify by loading the page with scripts blocked); interactivity is progressive enhancement on a working page. Static generation SHOULD be the default build. |

### 5.4 Profile `doc` — documents and decks

Tokens still apply; they are mapped to document styles (docx paragraph/character styles, pptx theme colours and layouts, Markdown/PDF stylesheet) under the hybrid rule T-08.

| ID | Level | Tier | Topic | Check | Rule |
|---|---|---|---|---|---|
| **M-doc-01** | MUST | T0 | doc · a11y | data | Documents MUST use real styles (Heading 1–3, Body, Caption, Table Grid) mapped from `text.*` tokens and the `doc.page.*` tokens (format, margins, deck ratio); no direct formatting. This is what makes them navigable, accessible and re-themable. ↳ refines R-13 |
| **M-doc-02** | MUST | T1 | doc · content | review | Reports open with a summary of at most one page containing three labelled parts — finding, implication, recommendation — before any detail. |
| **M-doc-03** | MUST | T1 | doc · content | review | Decks: one message per slide, stated in the slide title as a sentence; ≤ 6 lines of body text or one chart per slide; consistent placement of titles, sources and page numbers via master layouts, never manual positioning. |
| **M-doc-04** | MUST | T1 | doc · viz | review | Charts in documents follow `viz` rules (M-viz-*), rendered at ≥ 150 dpi or as vector, with the palette taken from the same tokens as the on-screen product. ↳ refines M-viz-11 |
| **M-doc-05** | MUST | T1 | doc | review | Document tables MUST right-align numeric columns with tabular figures (R-20). Header rows SHOULD use `color.bg.subtle` + `text.label`; zebra striping only when rows > 8. ↳ refines R-20 |
| **M-doc-06** | MUST | T0 | doc · color · a11y | review | Colour in print: verify the accent and status colours still meet contrast when printed greyscale; do not rely on colour for any meaning (R-04). ↳ refines R-04 |

---

## 6. Component standard

Components are the reusable UI units. The standard fixes how they are **specified, stated and documented**; the project decides which exist and how they look.

### 6.1 Lifecycle

| ID | Level | Tier | Topic | Check | Rule |
|---|---|---|---|---|---|
| **C-01** | MUST | T1 | component · process | review | A component is created when the same UI appears a **second** time (P-09). Before that it is a one-off built from tokens. A pattern (composition of components) is documented when it appears a **third** time. |
| **C-02** | MUST | T1 | component · docs | review | Every component MUST have a spec page (`design/components/<name>.md`, template in Appendix B) **before or with** its implementation. |
| **C-03** | SHOULD | T2 | component | review | Prefer composition over configuration: a component SHOULD expose no more than three boolean props; further variation is a sub-component or a `variant`/`size`/`tone` enum. Variants are limited to what the design actually uses. |
| **C-04** | SHOULD | T1 | component · process | judgement | **Adapt before create.** Default to an accessible open-source component foundation (headless/unstyled preferred — e.g. Radix, React Aria, Headless UI, or native HTML elements) themed entirely through tokens; hand-build only where no suitable primitive exists. Record the base library in `DLS.md`. Wholesale adoption of an opinionated visual library (Material, Bootstrap) is a `DEC` entry because it competes with the token layer. |
| **C-05** | MUST | T1 | component · process | review | **Maturity ladder.** Every component carries a status: `draft` (proposed, in validation) → `candidate` (production-ready code, spec written, automated a11y scan clean, in use on one surface) → `stable` (used on ≥ 2 surfaces or projects, complete spec, all three R-29 layers passed, tests, versioned) → `deprecated` (migration path and window stated). Only `stable` components may be depended on by other components. ↳ refines R-29 |

### 6.2 States

Every interactive component defines these states. Non-applicable states are marked "n/a" in the spec, not omitted.

| State | Required for | Notes |
|---|---|---|
| `default` | All | Resting appearance |
| `hover` | Pointer-capable | Never the only affordance; touch devices do not have it |
| `focus-visible` | All interactive | R-05. Ring, not just colour change |
| `active` / pressed | All interactive | Momentary feedback |
| `disabled` | All interactive | ≥ 3:1 is not required, but disabled MUST be visibly distinct and MUST NOT receive focus unless it explains why it is disabled |
| `loading` | Anything async | R-25 |
| `error` / invalid | Inputs, forms, data views | R-27 |
| `selected` / checked / current | Selectable items, nav | Indicated by more than colour (R-04) |
| `read-only` | Inputs | Distinct from disabled |
| `empty` | Data containers | R-26 |

### 6.3 Anatomy and API

| ID | Level | Tier | Topic | Check | Rule |
|---|---|---|---|---|---|
| **C-06** | MUST | T1 | component · docs | review | Each spec names the component's parts (anatomy) and the token each part consumes. Example for Button: container (`button.bg.*`, `radius.control`), label (`text.label`, `button.text.*`), leading/trailing icon (`size.icon.md`), focus ring (`border.width.md`, `color.border.focus`). ↳ refines D-02 |
| **C-07** | MUST | T1 | component · docs | review | Props/variants use the shared vocabulary in `tokens.json` `$extensions.dls.vocabulary.props` (`variant`, `size`, `tone`) and the state names of §6.2. Do not invent synonyms (`kind`, `type`, `appearance`). ↳ refines D-02, T-07 |
| **C-08** | MUST | T1 | component · a11y · docs | review | Accessibility contract per component: semantic element or ARIA role, accessible name source, keyboard interactions, focus management, announcements. This is written in the spec, not left to the implementation. ↳ refines D-02 |
| **C-09** | MUST | T2 | component · content · docs | review | Content contract per component: max label length, tone, what happens on overflow (truncate with tooltip / wrap / hide). ↳ refines D-02 |
| **C-10** | MUST | T2 | component · layout · docs | review | Responsive contract per component: behaviour at each breakpoint or container size, and what collapses first. Component-level responsiveness SHOULD use container queries; `breakpoint.*` tokens are for page layout. ↳ refines D-02 |

### 6.4 Baseline component set

Not a mandate to build; a checklist of what usually exists so specs can be started from a known shape.

- **Actions:** Button, IconButton, Link, Menu
- **Inputs:** TextInput, TextArea, Select, Checkbox, Radio, Switch, DatePicker, FileInput, SearchInput
- **Feedback:** Alert/Banner, Toast, InlineMessage, ProgressBar, Spinner, Skeleton, EmptyState
- **Containers:** Card, Dialog, Sheet/Drawer, Popover, Tooltip, Accordion, Tabs
- **Navigation:** AppShell/Header, SideNav, Breadcrumb, Pagination, Stepper
- **Data display:** Table, DataList, Badge/Tag, StatTile (KPI), Chart wrappers (per M-viz), Avatar
- **Layout primitives:** Stack, Inline, Grid, Container, Divider

---

## 7. Documentation standard

### 7.1 Required structure

| ID | Level | Tier | Topic | Check | Rule |
|---|---|---|---|---|---|
| **D-01** | MUST | T1 | docs | review | Every project has a `design/` folder with this structure. Files marked ● MUST exist from day one — `DLS.md` before the first component is built; ○ are created when needed. |

```
design/
├── DLS.md              ● index: profile(s), conformance target, brand inputs, links, status
├── principles.md       ● inherited principles + project additions/re-ordering
├── foundations.md      ● chosen values for every §4 category, with rationale
├── tokens/
│   ├── tokens.json     ● DTCG source of truth
│   ├── tokens.css      ● generated (or the substituted implementation, per T-08)
│   └── build.*         ○ generation script
├── components/
│   └── <name>.md       ○ one spec per component (Appendix B)
├── patterns.md         ○ page-level and flow-level compositions
├── content.md          ○ voice, tone, terminology, microcopy rules, number/date formats
├── rules.json / .yaml  ● generated rule index from DESIGN-STANDARD.md (build_rules.py); rules.py query CLI
├── DECISIONS.md        ● deviation and decision register (Appendix C)
└── CHANGELOG.md        ● semver history
```

### 7.2 Writing rules

| ID | Level | Tier | Topic | Check | Rule |
|---|---|---|---|---|---|
| **D-02** | MUST | T1 | docs | review | Every spec answers, in order: **what it is → when to use it → when not to (and what to use instead) → anatomy → variants → states → behaviour → accessibility → content → tokens consumed → do/don't → open questions**. Sections may be short; they may not be missing. |
| **D-03** | SHOULD | T2 | docs · content | review | Docs are written for the newest contributor (human or agent): every product-specific or design-system term used in a spec SHOULD appear in the `content.md` or `foundations.md` glossary. |
| **D-04** | SHOULD | T2 | docs · content | review | Every do/don't pair cites the rule or principle ID it rests on, e.g. "Don't put two primary buttons in one dialog — users can't tell which is the intended path (P-01)." A pair without a citation is incomplete. |
| **D-05** | MUST | T1 | docs · governance | review | Documentation lives with the code, in Markdown, in version control. External tools (Figma, Storybook, zeroheight-style sites) MAY mirror it but the repo copy is canonical. |
| **D-06** | MUST | T1 | docs | review | `DLS.md` carries a status line per section and per component using the C-05 ladder (`draft | candidate | stable | deprecated`) so agents know what is safe to build on. |
| **D-07** | MUST | T1 | docs | review | Keep docs current in the same change that alters behaviour. A PR that changes a component without touching its spec is incomplete. |
| **D-08** | SHOULD | T2 | docs · process | review | Generate what can be generated: prop tables, token lists and code snippets come from code or `tokens.json` (Storybook autodocs, a script, or a build step), never hand-maintained. The Markdown spec holds what code cannot express — when to use, when not to, do/don't, content rules. |
| **D-09** | SHOULD | T2 | docs · process | review | Documentation depth is tiered: **comprehensive** (full Appendix B) for the highest-traffic components — the top 10–15 in a Reference-level system, every `stable` component in smaller ones; **standard** (usage, variants, states, a11y) as the baseline for everything else. Nothing ships with name-and-screenshot only. |

---

## 8. Governance

### 8.1 Ownership model

Solo or small-team projects use a **centralised** model: one owner (me, or a designated agent acting on my instructions) approves changes to Layer 0 and to a project's `foundations.md`; contributors propose. Multi-team projects MAY move to a **hybrid** model (core owned, components federated) and MUST record the model in `DLS.md`.

**Shared repositories MUST name the approver.** Where more than one person can merge, `DLS.md` states who approves a MUST exception (G-07) and who approves a change to `foundations.md`. Naming a role is enough ("the design-language owner"), but the name MUST be resolvable to a person — "the team" is not an approver. Without this line an agent has no one to stop for, which is the failure G-07 exists to prevent.

### 8.2 Versioning

| ID | Level | Tier | Topic | Check | Rule |
|---|---|---|---|---|---|
| **G-01** | MUST | T1 | governance | review | This standard and every project DLS use semver. Major: removed/renamed token, changed semantic meaning, breaking component API, raised MUST rule — and every major bump MUST ship a migration note. Minor: new token/component/rule, additive variant. Patch: value tweak within meaning, doc fix, bug fix. |
| **G-02** | MUST | T2 | governance | review | Deprecations are announced at least one minor version before removal and, for Reference-level systems, carry a stated migration window (default 90 days), with an alias or codemod where possible; the deprecated item is marked in docs and emits a warning in code where feasible. ↳ refines C-05, G-01 |
| **G-03** | MUST | T1 | governance | review | `CHANGELOG.md` is updated in the same change. Entry format: `## [x.y.z] — YYYY-MM-DD` then `Added / Changed / Deprecated / Removed / Fixed` with rule IDs where relevant. |

### 8.3 Change process

| ID | Level | Tier | Topic | Check | Rule |
|---|---|---|---|---|---|
| **G-04** | SHOULD | T2 | governance · process | review | A change proposal contains four fields: the change, the motivating rule or principle ID, the projects affected, and the migration path. Proposals missing a field are returned, not reviewed. |
| **G-05** | SHOULD | T2 | governance · process | review | Any change to Layer 0 (this file) is reviewed against every active project's `DECISIONS.md` for conflicts before merging. |

### 8.4 Exceptions and deviations

| ID | Level | Tier | Topic | Check | Rule |
|---|---|---|---|---|---|
| **G-06** | MUST | T1 | governance · process | review | Deviation from a SHOULD: allowed by the implementer; record a one-line entry in `DECISIONS.md` with the rule ID and reason (the full Appendix C record is for MUST exceptions only). |
| **G-07** | MUST | T1 | governance | review | **Exception to a MUST:** requires an explicit decision record (Appendix C) with the rule ID, the constraint that makes compliance impossible or harmful, the mitigation, the scope (which surfaces), and an expiry date. Agents MUST NOT grant themselves MUST exceptions; they draft the record and stop for the approver named in `DLS.md` (§8.1). |
| **G-08** | MUST | T2 | governance | review | Exceptions expire. On expiry they are re-approved or the deviation is removed. ↳ refines G-07 |
| **G-09** | SHOULD | T2 | governance · process | review | Repeated identical exceptions across projects are a signal the standard is wrong; open a change proposal (G-04) instead of a fourth exception. |
| **G-10** | SHOULD | T2 | governance · process | review | Documentation SHOULD be audited against live components and tokens on a cadence (quarterly for active projects; before any release for others): stale screenshots, removed tokens, obsolete snippets and status lines that no longer match are logged and fixed. Reporting a stale doc is a one-line action (issue template or `DECISIONS.md` note). |

### 8.5 Health metrics (Extended and Reference levels)

Track, at whatever cadence suits the project: token coverage (% of style values sourced from tokens — target 100%), component reuse (instances per component), contrast/a11y check pass rate in CI, open exceptions and their age, doc freshness (specs touched in the same PR as their component).

---

## 9. Agent operating procedure

This is the process an agent follows when asked to "set up the design system", "apply the design standard", "build the UI for…", or any equivalent. It is deterministic on purpose.

### 9.1 Inputs to collect (ask once, then proceed with defaults)

| Input | If absent, default to |
|---|---|
| Profile(s) (§5) | Infer from the brief; state the inference |
| Conformance target (§0.4) | Extended |
| Brand inputs (logo, palette, type, existing assets, tone) | Standard neutral defaults (Appendix A); mark `foundations.md` as `draft` |
| Stack (framework, CSS approach, doc tooling) | Detect from repo; otherwise plain CSS custom properties |
| Existing design artefacts (Figma, old CSS, style guide) | Audit and map to tokens rather than discard |
| Base component library (C-04) | Native HTML + headless primitives for the detected framework; record in `DLS.md` |
| Themes required (light/dark/high-contrast/print) | Light only; structure ready for dark |
| Reading-time / audience for `viz` and `doc` | Ask — this cannot be defaulted sensibly |

### 9.2 Steps

1. **Read** `DESIGN-STANDARD.md` fully (or, for a scoped task, filter `design/rules.json` by topic and profile and read the Tier 0 register in full). Read the project's `design/` folder if it exists. Do not skip to building.
2. **Audit** (brownfield only). Catalogue the UI that exists: screenshot or list every recurring element (buttons, inputs, forms, cards, dialogs, nav, tables, notifications, charts), extract every literal colour/size/spacing value in use, group near-duplicates, and rank by **frequency × inconsistency**. The top of that list is the build order for step 6; the extracted values are the input to step 4. Write the result to `design/audit.md`.
3. **Scaffold** `design/` per D-01 if missing. Write `DLS.md` first with profile, conformance target, base library (C-04), and status lines.
4. **Derive tokens** (`tokens.json` → generated `tokens.css`) per §4: primitives from brand inputs or defaults, then every semantic role in §4.5–4.10. Validate contrast for every text/bg and status trio programmatically (R-02, R-03, T-14) and CVD-check categorical/data palettes (R-14). Record results in `foundations.md`.
5. **Write `foundations.md`** with chosen values and one-line rationale each.
6. **Build components** (C-01, C-04, C-05): for each UI need, check for an existing component → existing pattern → base-library primitive themed with tokens → new component with spec (Appendix B). Implementation from tokens only. Set status `draft`, promote per C-05.
7. **Apply the profile rules** (§5) for each surface being built.
8. **Record decisions** as they happen (G-06/G-07). Never batch them for later.
9. **Run the conformance checklist** (Appendix D) and the R-29 accessibility layers appropriate to the level. Fix what fails. Report anything that cannot be fixed with the rule ID and the reason — do not silently downgrade.
10. **Update `CHANGELOG.md`** and set status lines in `DLS.md`.

### 9.3 Definition of done (design work)

- `design/` exists with all ● files populated and status set.
- 100% of style values in touched code resolve to tokens (grep for hex codes, px literals outside `tokens.*`, and `z-index:` numbers as a quick audit).
- Contrast and CVD checks executed and results recorded.
- Every touched component has a spec with all §6.2 states addressed.
- All required states in R-26 exist for every data view.
- Conformance checklist attached to the PR/summary with pass/fail per item.
- `DECISIONS.md` contains an entry for every SHOULD deviation; no unapproved MUST exceptions.
- `CHANGELOG.md` entry written.

### 9.4 Acceptance criteria template (Jira-style)

```
Story: As a <role> I need <surface> so that <outcome>.

Design acceptance criteria
- [ ] Conforms to DESIGN-STANDARD v1.x at <Core|Extended> level (checklist attached)
- [ ] Profile <app|viz|site|doc> rules applied; deviations recorded in design/DECISIONS.md
- [ ] All style values tokenised (R-15); no literals in component code
- [ ] States implemented: default, hover, focus-visible, active, disabled, loading, error, empty (as applicable)
- [ ] Contrast ≥ 4.5:1 text / ≥ 3:1 UI verified programmatically; CVD check on any new palette
- [ ] Keyboard-only walkthrough passes; focus order logical; no traps
- [ ] Reflow verified at 320 px; reduced-motion verified
- [ ] Component spec(s) updated in design/components/
- [ ] CHANGELOG entry added
```

---

## Appendix A — Starter tokens

The starter kit ships alongside this document:

| File | Purpose |
|---|---|
| `design/tokens/tokens.json` | DTCG source of truth (primitives, semantic roles with light/dark values, composites) |
| `design/tokens/tokens.css` | Generated CSS custom properties (`:root`, `[data-theme="dark"]`, `prefers-color-scheme` fallback) |
| `design/tokens/build_tokens.py` | Generator: `python build_tokens.py tokens.json tokens.css` (stdlib only) |
| `design/tokens/check_palette.py` | Validator for R-02/R-03/R-14/T-14: `python check_palette.py tokens.json` — exits 1 on failure, CI-ready |

All values below were produced in OKLCH and **validated programmatically**: every required text/background and status pair passes in both themes (35/35 — the pair set is the `PAIRS` list in `check_palette.py`, extend it when adding roles), and the categorical set keeps a minimum ΔE2000 ≥ 10.9 under protan, deutan and tritan simulation (Machado 2009 matrices).

### A.1 Primitive ramps (light-mode hex)

| Step | neutral | blue (accent) | green | amber | red |
|---|---|---|---|---|---|
| 50 | `#f6fbff` | `#f5fbff` | `#e8ffec` | `#fff8ea` | `#fff5f3` |
| 100 | `#eef2f7` | `#e7f3ff` | `#e0fae4` | `#ffefd5` | `#ffeae7` |
| 200 | `#dfe5ec` | `#d0e7ff` | `#d3edd7` | `#f5e1c8` | `#ffd9d5` |
| 300 | `#cbd2d9` | `#b4d4fd` | `#b8dcbe` | `#e7cca9` | `#fac1bb` |
| 400 | `#a8afb5` | `#79b1f8` | `#7fc08c` | `#d3a563` | `#f08f88` |
| 500 | `#81878d` | `#2885ef` | `#2c9f52` | `#b47800` | `#de4e4b` |
| 600 | `#676c73` | `#1c6bc3` | `#1f8040` | `#926000` | `#b53c3a` |
| 700 | `#50565c` | `#205595` | `#236436` | `#754b00` | `#8b3532` |
| 800 | `#3b4046` | `#204069` | `#224a2c` | `#553a0f` | `#642c29` |
| 900 | `#26292d` | `#182a40` | `#1a2e1e` | `#342611` | `#3d1f1d` |
| 950 | `#13161a` | `#06162b` | `#071b0c` | `#201301` | `#280c0b` |

Swap the accent ramp for the brand hue (regenerate in OKLCH at the same lightness steps so the semantic mapping keeps its contrast). Neutral MAY be warmed or cooled; keep the lightness steps.

### A.2 Semantic colour roles (resolved values)

| Token | Light | Dark |
|---|---|---|
| `color.bg.canvas` | `#f6fbff` | `#13161a` |
| `color.bg.surface` | `#ffffff` | `#26292d` |
| `color.bg.raised` | `#ffffff` | `#3b4046` |
| `color.bg.subtle` | `#eef2f7` | `#3b4046` |
| `color.text.primary` | `#13161a` | `#f6fbff` |
| `color.text.secondary` | `#50565c` | `#cbd2d9` |
| `color.text.muted` | `#676c73` | `#a8afb5` |
| `color.text.inverse` | `#f6fbff` | `#13161a` |
| `color.text.link` | `#205595` | `#b4d4fd` |
| `color.border.default` | `#81878d` | `#a8afb5` |
| `color.border.strong` | `#50565c` | `#cbd2d9` |
| `color.border.subtle` | `#dfe5ec` | `#3b4046` |
| `color.border.focus` | `#1c6bc3` | `#79b1f8` |
| `color.accent.default` | `#1c6bc3` | `#79b1f8` |
| `color.accent.hover` | `#205595` | `#b4d4fd` |
| `color.accent.active` | `#204069` | `#d0e7ff` |
| `color.accent.text` | `#205595` | `#b4d4fd` |
| `color.accent.bg.subtle` | `#f5fbff` | `#06162b` |
| `color.status.success.bg` | `#e8ffec` | `#071b0c` |
| `color.status.success.text` | `#224a2c` | `#d3edd7` |
| `color.status.success.border` | `#1f8040` | `#7fc08c` |
| `color.status.success.icon` | `#1f8040` | `#7fc08c` |
| `color.status.warning.bg` | `#fff8ea` | `#201301` |
| `color.status.warning.text` | `#553a0f` | `#f5e1c8` |
| `color.status.warning.border` | `#926000` | `#d3a563` |
| `color.status.warning.icon` | `#926000` | `#d3a563` |
| `color.status.danger.bg` | `#fff5f3` | `#280c0b` |
| `color.status.danger.text` | `#642c29` | `#ffd9d5` |
| `color.status.danger.border` | `#b53c3a` | `#f08f88` |
| `color.status.danger.icon` | `#b53c3a` | `#f08f88` |
| `color.status.info.bg` | `#f5fbff` | `#06162b` |
| `color.status.info.text` | `#204069` | `#d0e7ff` |
| `color.status.info.border` | `#1c6bc3` | `#79b1f8` |
| `color.status.info.icon` | `#1c6bc3` | `#79b1f8` |
| `color.data.highlight` | `{color.accent.default}` | `{color.accent.default}` |

### A.3 Categorical data palette (Okabe–Ito, CVD-safe)

Use in order. Colours 1–4 meet ≥ 3:1 on white for small marks (4 is marginal at 3.06:1); 5–7 do not, so on light surfaces they need direct labels, outlines or wider marks. Colour 8 is themed: `neutral.600` light / `neutral.400` dark.

| # | Hex | Name |
|---|---|---|
| 1 | `#0072B2` | blue |
| 2 | `#D55E00` | vermillion |
| 3 | `#009E73` | bluish green |
| 4 | `#CC79A7` | reddish purple |
| 5 | `#E69F00` | orange |
| 6 | `#56B4E9` | sky blue |
| 7 | `#F0E442` | yellow |
| 8 | `{color.neutral.600}` light / `{color.neutral.400}` dark | grey |

Sequential and diverging ramps are not fixed by the standard; generate per project in OKLCH (single-hue lightness ramp for sequential; two hues through a neutral midpoint for diverging) and run the validator.

### A.4 Non-colour defaults (summary — full values in `tokens.json`)

| Category | Tokens |
|---|---|
| Space | `space.0…24` = 0, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96 px; `space.inset/stack/inline.{xs…xl}` aliases |
| Font size | `xs 12 · sm 14 · md 16 · lg 20 · xl 25 · 2xl 31 · 3xl 39 · 4xl 49` |
| Weights | `regular 400 · medium 500 · semibold 600` |
| Line height | `tight 1.2 · snug 1.3 · normal 1.5` |
| Text composites | `display, heading.1–4, body.lg/md/sm, label, caption, code, data` |
| Radius | `none 0 · sm 4 · md 8 · lg 12 · xl 16 · pill 9999 · full 9999`; `radius.control → md`, `radius.container → lg`, `radius.pill` for pill controls |
| Shadow | `0 none · 1 (0 1 2) · 2 (0 4 12 −2) · 3 (0 12 32 −4) · 4 (0 24 48 −8)` on `rgba(19,22,26, .08–.18)` |
| Motion | `instant 0 · fast 120 · base 220 · slow 350 · deliberate 500 ms`; `ease.standard (0.2,0,0,1) · enter (0,0,0.2,1) · exit (0.4,0,1,1)` |
| Size | `control sm 32 / md 40 / lg 48 · icon 16/20/24 · target.min 24 · target.touch 44 · container.prose 72ch · container.app 1440` |
| Breakpoints | `sm 640 · md 768 · lg 1024 · xl 1280 · 2xl 1536` |
| Grid | `columns sm 4 / md 8 / lg 12 · gutter sm → space.inline.lg / lg → space.inline.xl` |
| Z | `base 0 · raised 10 · dropdown 100 · sticky 200 · overlay 300 · modal 400 · popover 500 · toast 600` |
| Opacity | `disabled .5 · overlay .6 · muted .7` |

### A.5 DTCG excerpt

```json
{
  "color": {
    "neutral": { "950": { "$type": "color", "$value": "#13161a" } },
    "text": {
      "primary": {
        "$type": "color",
        "$value": "{color.neutral.950}",
        "$extensions": { "dls.theme": { "dark": "{color.neutral.50}" } }
      }
    }
  },
  "text": {
    "body": {
      "md": {
        "$type": "typography",
        "$value": {
          "fontFamily": "{font.family.sans}", "fontSize": "{font.size.md}",
          "fontWeight": "{font.weight.regular}", "lineHeight": "{font.lineHeight.normal}",
          "letterSpacing": "{font.letterSpacing.normal}"
        }
      }
    }
  }
}
```

Generated CSS for the same tokens:

```css
:root {
  --color-neutral-950: #13161a;
  --color-text-primary: var(--color-neutral-950);
  --text-body-md-font-size: var(--font-size-md);
  --text-body-md: var(--text-body-md-font-weight) var(--text-body-md-font-size)/var(--text-body-md-line-height) var(--text-body-md-font-family);
}
[data-theme="dark"] { --color-text-primary: var(--color-neutral-50); }
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) { --color-text-primary: var(--color-neutral-50); }
}
```

Tailwind v4 consumes the same variables: `@theme { --color-text-primary: var(--color-text-primary); }` or import `tokens.css` before `@theme inline`.

---

## Appendix B — Component spec template

Copy to `design/components/<name>.md`. Every heading stays, even if the content is "n/a".

```markdown
# <ComponentName>

**Status:** draft | candidate | stable | deprecated   **Since:** x.y.z   **Profile(s):** app | viz | site | doc   **Base:** native | <library primitive> | custom

## What it is
One sentence.

## When to use
- …

## When not to use → use instead
- <situation> → <Alternative component or pattern>

## Anatomy
| Part | Token(s) | Notes |
|---|---|---|
| container | `…` | |
| label | `text.label`, `…` | |

## Variants
| Prop | Values | Default | Notes |
|---|---|---|---|
| `variant` | primary · secondary · tertiary · danger | secondary | |
| `size` | sm · md · lg | md | |

## States
| State | Visual | Token(s) | n/a? |
|---|---|---|---|
| default | | | |
| hover | | | |
| focus-visible | ring `border.width.md` `color.border.focus` offset 2px | | |
| active | | | |
| disabled | | | |
| loading | | | |
| error | | | |
| selected | | | |

## Behaviour
- Interaction rules, responsive contract (C-10), overflow (C-09).

## Accessibility (C-08)
- Element / role:
- Accessible name from:
- Keyboard: 
- Focus management:
- Announcements:

## Content (C-09)
- Max label length, tone, casing, overflow rule.

## Tokens consumed
`color.…`, `space.…`, `radius.…`, `text.…`

## Code example
```tsx
// minimal, copyable, framework-specific; generated where possible (D-08)
```

## Related components
- <Alternative> — use when …
- <Complement> — commonly composed with …

## Do / Don't
- **Do** … because … (rule/principle ID)
- **Don't** … because … (rule/principle ID)

## Open questions
- …

## Changelog
- x.y.z — created
```

---

## Appendix C — Decision record template

Append to `design/DECISIONS.md`. One entry per deviation or exception; newest at the top.

```markdown
## DEC-<nnn> — <short title>
- **Date:** YYYY-MM-DD
- **Type:** deviation (SHOULD) | exception (MUST) | choice (MAY) | substitution (T-08)
- **Rule(s):** R-xx / T-xx / M-xxx-xx
- **Scope:** <surfaces, components or files affected>
- **Context:** what constraint or need makes the default unsuitable
- **Decision:** what was done instead
- **Mitigation:** how the intent of the rule is still met (required for exceptions)
- **Consequences:** what this makes easier / harder
- **Review / expiry:** YYYY-MM-DD (required for exceptions)
- **Approved by:** <name>   (exceptions only — agents draft, humans approve)
```

Short form for SHOULD deviations (G-07): one bullet `DEC-nnn · YYYY-MM-DD · M-app-05 · used a toast for a persistent sync warning — the banner slot is already taken by the offline indicator.`

---

## Appendix D — Conformance checklist

Run before declaring any design work done (R-28). Attach the result to the PR or summary. Mark each item `PASS`, `FAIL`, `N/A` (with reason), or `EXC DEC-nnn`. Work the **Tier 0 register (Appendix G.1) first**; a T0 failure ends the review until fixed.

### Foundations
- [ ] `design/` folder exists with all ● files (D-01); `DLS.md` states profile(s) and conformance target
- [ ] Every style value in touched code resolves to a token — grep for `#[0-9a-f]{3,8}`, `\d+px` and `z-index:\s*\d` outside `tokens.*` (R-15)
- [ ] Components reference only semantic/component tokens (T-04, T-04)
- [ ] Token names follow the grammar (T-06, T-06/07)
- [ ] Token implementation is default or has a T-08 substitution record (T-08)
- [ ] `check_palette.py` (or equivalent) passes for every theme (R-02, R-03, T-14)
- [ ] Any new categorical/data palette CVD-checked (R-14)
- [ ] Spacing, type sizes, radii, motion and z-index all resolve to `tokens.json` scales (R-15, T-16, T-19); ≤ 2 families (R-19)

### Accessibility
- [ ] Keyboard-only pass: all interactive elements reachable and operable, logical order, no traps (R-06)
- [ ] Visible focus on every interactive element, ≥ 3:1 (R-05)
- [ ] No meaning by colour alone — status, charts, links, validation (R-04)
- [ ] Targets ≥ 24 px, ≥ 44 px on touch-first surfaces (R-07)
- [ ] Text alternatives for images, icons, charts (R-08); labels on every control (R-09)
- [ ] Reflow at 320 px without horizontal scroll (R-10); text-spacing override does not clip (R-11)
- [ ] `prefers-reduced-motion` honoured; nothing flashes > 3/s (R-12)
- [ ] Heading order, landmarks, list/table semantics correct (R-13)

### Components and interaction
- [ ] All applicable §6.2 states implemented and styled (R-23)
- [ ] Empty / loading / error / partial states exist for every data view (R-26)
- [ ] Async actions show loading within 100 ms and an outcome (R-25)
- [ ] Destructive actions confirmed or undoable; never primary-styled by default (R-24)
- [ ] Error messages: what / why / next, adjacent to failure (R-27)
- [ ] Spec exists for every touched component with anatomy, states, a11y and content contracts (C-02, C-06–C-10)
- [ ] Component status set per the maturity ladder; nothing depends on a non-`stable` component (C-05)
- [ ] Automated a11y scan clean; keyboard pass done; screen-reader pass done for Extended+ (R-29)

### Profile
- [ ] `app`: density, nav consistency, form rules, table rules, feedback hierarchy, offline states (M-app-01…07)
- [ ] `viz`: audience/question/reading time declared; chart-type rules; highlight-only accent; zero-based bars; titles as takeaways; number formats tokenised (M-viz-01…11)
- [ ] `site`: measure, single CTA per viewport, no layout shift, renders without JS, static-first (M-site-01…04)
- [ ] `doc`: real styles, master layouts, one message per slide, print-safe colour (M-doc-01…06)

### Documentation and governance
- [ ] Every SHOULD deviation has a DEC entry; no unapproved MUST exception (G-06, G-06/08)
- [ ] `CHANGELOG.md` entry with correct semver bump (G-01, G-03)
- [ ] Docs updated in the same change as behaviour (D-07)
- [ ] Status lines in `DLS.md` updated (D-06)

---

## Appendix E — One-page agent brief

Paste into `CLAUDE.md` / `AGENTS.md` of any project, or reference the companion skill.

```markdown
## Design standard
This project follows DESIGN-STANDARD.md (v1.3.0) at conformance level: <Core|Extended>.
Profiles: <app|viz|site|doc>.

Before any UI, chart, page, document or deck work:
1. Read DESIGN-STANDARD.md and design/DLS.md, foundations.md, DECISIONS.md.
2. Use tokens only (design/tokens). Never hard-code colours, sizes, spacing, z-index or motion.
3. Defaults: CSS custom properties generated from DTCG tokens.json. Substitute only when the
   stack cannot consume them, and record it (T-08).
4. Build components just-in-time; write the spec (Appendix B) with the implementation.
5. Implement every state (§6.2) and every data-view state (R-26).
6. Run check_palette.py on any palette change; run the Appendix D checklist before "done".
   Start every review with the Tier 0 register: `python design/rules.py --tier T0`.
   Pull the rules for what you're touching: `python design/rules.py --topic <topic> --profile <profile>`.
7. Record every SHOULD deviation in DECISIONS.md. Never self-approve a MUST exception —
   draft the record and stop.
8. Report conformance failures with rule IDs. Do not silently downgrade.
Conflicts: lower Tier wins (T0 > T1 > T2) → MUST beats SHOULD → principle order (P-01 clarity, P-02 accessibility, P-03 reading time, P-04 colour restraint).
```

## Appendix F — Source validation map

Live read on 2026-09-08. Each row: what the source recommends → where this standard covers it → any deliberate divergence.

| Source | Recommendation | Covered by | Divergence / note |
|---|---|---|---|
| NN/g Design Systems 101 | System = style guide + component library + pattern library | §4 foundations & `content.md` (style guide) · §6 + `components/` (library) · `patterns.md` (patterns) | None |
| NN/g | Component entries need naming, do/don't, attributes, states + defaults, code, framework | Appendix B; C-06–C-10 | None |
| NN/g | Adopt → adapt → create spectrum; custom only when open source can't meet needs | C-04 adapt-before-create | Standard adds "headless preferred" so the token layer stays the visual authority |
| NN/g | Don't build a system for throwaway prototypes or short-lived projects | §0.4 (spikes out of scope until shared); P-09 | Standard still requires Core once anything is shared — stricter than NN/g |
| NN/g | Minimum team: interaction designer + visual designer + developer; exec sponsor | §8.1 centralised owner | Solo/agent context: roles collapse into owner + agents; no divergence in intent |
| NN/g | Maintenance is continuous; training needed to prevent misuse | G-10 audits; D-03 written for newest contributor; §9 procedure | None |
| Figma Design Systems 101 | Three levels: design system → component & pattern libraries → foundations | Layer diagram §0.1; §4 / §6 / `patterns.md` | Standard adds an explicit Layer 0 meta-standard above the project system |
| Figma | Variants for modes and screen sizes; single source of truth; central updates propagate | T-05 (theme via semantic re-map), C-10 (responsive contract), D-05, T-09 | None |
| Figma | "One size does not fit all"; adopt when inconsistency, multiple themes/platforms, redundancy or onboarding pain exist | §1.1, §5 profiles, §8.4 exceptions | None |
| IE Ultimate Guide to DLS | DLS = tools + components + rules + guidelines; single source of truth | §0.1, D-05 | None |
| IE | Elements: style guide, pattern library, visual design language (component meanings/roles), documentation, naming conventions, grid, tokens | §4 (incl. T-06/07 naming, R-15 grid), §4.2 semantic tier = "meanings and roles", §7 | None |
| IE | Process: UI audit → visual design language → style guide & pattern library → documentation | §9.2 steps 2 → 4/5 → 6 → 10 | Standard interleaves documentation with each step (D-07) rather than as a final phase |
| IE | Tokens are the raw material for assets, components and patterns | T-01–T-04 | None |
| UX Pilot 7 Best Practices | Audit UI before scaling; rank by frequency × inconsistency | §9.2 step 2; P-09 brownfield clause | None |
| UX Pilot | Three token layers: primitive / semantic / component; W3C DTCG format | T-01–T-03, T-08 | None |
| UX Pilot | WCAG 2.2 AA baseline; automated CI + keyboard + screen reader; "if it doesn't pass it doesn't ship" | R-01, R-29, C-05 | None |
| UX Pilot | Generate docs from code (Storybook autodocs, token files) | D-08 | Standard keeps Markdown spec canonical for non-generatable content |
| UX Pilot | Maturity ladder draft → candidate → stable with promotion criteria; deprecation with migration window and codemods | C-05, D-06, G-02 | Standard sets default 90-day window (UX Pilot example: six months) — shorter because projects are small; adjust per project |
| UX Pilot | Share tokens across platforms, not component code; app code never touches primitives | T-11, T-04 | None |
| UX Pilot | Treat the system as a product: roadmap, backlog, semver, changelog, migration guides | G-01–R-28, §8.5 | Roadmap/office-hours omitted as not applicable to solo/agent operation |
| UX Pilot | Start: define tokens, standardise ~10 highest-use components, document, establish governance | §9.2 order; P-09 | Greenfield stays just-in-time (P-09); "top 10" applies to brownfield |
| Magic Patterns Documentation | Five layers: foundations, components, patterns, content guidelines, governance | §7.1 folder structure maps 1:1 | None |
| Magic Patterns | Component page: name, visual, anatomy, usage/when-not, props, code, tokens by name, a11y, related components; do/don't pairs highest-value | Appendix B (all sections present), D-04 | Visual examples are linked/rendered from code rather than embedded images, per D-05/D-08 |
| Magic Patterns | Named owners per section; semver; low-friction stale-doc reporting; quarterly audits | §8.1, G-01, G-10 | None |
| Magic Patterns | Comprehensive depth for 10–15 highest-traffic components, standard for the rest | D-09 | None |
| Magic Patterns | Hosting: >10 contributors → dedicated platform or code-adjacent; smaller → wiki/Figma acceptable | D-05 (repo Markdown canonical; other tools mirror) | Standard fixes repo-as-canonical regardless of size, for agent consumption |
| zeroheight Key Elements | Documentation · delivery · measurement · management framing (from site structure; article body not retrievable) | §7, T-09/D-08, §8.5, §8 | Not validated against article text — re-check when accessible |

## Appendix G — Rule index and Tier 0 register

<!-- generated by build_rules.py --update-appendix; do not edit by hand -->

Counts (v1.4.0): 106 rules — 70 root obligations + 36 refinements. Level: 87 MUST · 19 SHOULD · 0 MAY; Tier: 22 T0 · 58 T1 · 26 T2.

### G.1 Tier 0 register — the rules that block shipping in every context

An agent checks this list first. If any item fails and cannot be fixed, the work is not done, whatever else passed.

| ID | Topic | Rule (abridged — see full text) |
|---|---|---|
| **R-01** | a11y | The accessibility floor is WCAG 2.2 Level AA |
| **R-02** | a11y · color | Body text contrast MUST be ≥ 4.5:1 against its background |
| **R-03** | a11y · color | Non-text UI elements that convey state or boundary  MUST be ≥ 3:1 against adjacent colours. |
| **R-04** | a11y · color | Information MUST NOT be conveyed by colour alone |
| **R-05** | a11y · interaction · layout | Every interactive element MUST have a visible focus state  whose indicator is ≥ 3:1 against the… |
| **R-06** | a11y | Every interactive element MUST be operable by keyboard alone, in a logical order, with no keybo… |
| **R-07** | a11y · interaction | Pointer targets MUST be ≥ 24 × 24 CSS px  on every surface |
| **R-08** | a11y | Every image, icon and chart MUST have a text alternative appropriate to its purpose |
| **R-09** | a11y | Every form control MUST have a programmatically associated visible label |
| **R-10** | a11y | Content MUST reflow to a 320 px viewport without horizontal scrolling . |
| **R-11** | a11y | Text MUST remain readable when users apply 200% zoom or override line-height , paragraph spacin… |
| **R-12** | a11y · motion | Motion MUST respect `prefers-reduced-motion` |
| **R-13** | a11y | Semantic structure MUST be correct |
| **R-14** | a11y · color | Every categorical or data palette MUST stay distinguishable under deuteranopia, protanopia and … |
| **R-24** | interaction | Destructive actions MUST require confirmation or provide undo |
| **R-25** | interaction | Every asynchronous action MUST show a loading state within 100 ms of triggering and MUST show a… |
| **R-29** | a11y | Accessibility is verified in three layers before a component or surface is marked `stable` |
| **T-14** | color · a11y | Each status role MUST have a `bg` / `text` / `border` trio that passes R-02/R-03 in combination… |
| **M-app-06** | interaction | Offline/degraded states MUST be designed for anything used in the field |
| **M-viz-06** | viz | Y-axes for bar charts MUST start at zero |
| **M-doc-01** | doc · a11y | Documents MUST use real styles  mapped from `text.*` tokens and the `doc.page.*` tokens |
| **M-doc-06** | doc · color · a11y | Colour in print |

### G.2 Topic × Tier matrix

A rule with two topics is counted under both.

| Topic | T0 | T1 | T2 | Total |
|---|---|---|---|---|
| a11y | 18 | 2 | 0 | 20 |
| color | 6 | 5 | 3 | 14 |
| type | 0 | 5 | 4 | 9 |
| space | 0 | 0 | 0 | 0 |
| layout | 1 | 1 | 4 | 6 |
| motion | 1 | 0 | 1 | 2 |
| tokens | 0 | 14 | 1 | 15 |
| component | 0 | 11 | 3 | 14 |
| interaction | 5 | 3 | 2 | 10 |
| content | 0 | 5 | 4 | 9 |
| viz | 1 | 12 | 1 | 14 |
| doc | 2 | 4 | 0 | 6 |
| docs | 0 | 9 | 6 | 15 |
| governance | 0 | 5 | 6 | 11 |
| process | 0 | 6 | 6 | 12 |
| performance | 0 | 2 | 1 | 3 |

### G.3 Drift exposure — how each rule is checked

| Check | Rules | Judgement-only rules |
|---|---|---|
| script | 21 |  |
| data | 16 |  |
| review | 68 |  |
| judgement | 1 | C-04 |

`script`: a shipped or standard tool verifies it (contrast/CVD validator, literal grep, axe, lint). `data`: conformance means the value comes from `tokens.json`. `review`: a person or agent can answer yes/no by inspection against stated criteria. `judgement`: taste — the drift surface; kept deliberately small.

### G.4 Machine-readable index

`build_rules.py` parses every rule row of this file into `design/rules.json` and `design/rules.yaml`:

```yaml
- id: R-04
  level: MUST
  tier: T0
  check: script
  topics: [a11y, color]
  refines: [R-01]
  section: "3.1 Accessibility"
  profiles: [all]        # or [viz] etc. for M-* rules
  text: "Information MUST NOT be conveyed by colour alone. …"
```

The build lints: every rule has all four tags; every `T0` is `MUST`; IDs unique; every ID referenced in the document exists; `refines` targets exist and are at least as blocking; no rule text embeds a value scale. It exits non-zero on any failure, so it can gate a docs PR. `--update-appendix` regenerates this appendix.

Agents filter the index rather than parsing prose:

```bash
python design/rules.py --tier T0                     # blocking list
python design/rules.py --topic a11y --level MUST     # every accessibility MUST, whichever section it lives in
python design/rules.py --profile viz                 # core + viz-profile rules for a dashboard task
python design/rules.py --check judgement             # the rules that need a human eye
python design/rules.py --refines R-26                # every specialisation of a rule (data-view states)
```

---

## Changelog

### [1.4.0] — 2026-09-08
Applied from the FIYERO and portfolio-site pilots (see each repo's `design/audit.md`). Every change is a **relaxation or a clarification** — no new rules, no ID changes, no rule made stricter. 106 rules before and after.

- **T-08 — two peer defaults (CP-01).** Tailwind v4 `@theme`-as-source with `tokens.json` generated from it is now a peer of DTCG-JSON-as-source, chosen by stack and needing no exception. Both pilots reached this independently; under G-09 that is the signal the rule was wrong, not the code. T-09 is unchanged and applies in whichever direction.
- **T-16 — three first-class type scales (CP-02).** A ratio set, the framework's own scale, or an empirically derived one; the last two record their steps and a line of reasoning. Display sizes may sit outside the scale. `M-site-01` softened to match — 1.333 is a recommendation for `site`, not a mandate.
- **T-19 — sibling clause narrowed (CP-03).** "Sibling elements **of the same kind**"; a pill button beside a rounded input is a deliberate distinction, not a defect. `radius.pill` added.
- **R-14 — now falsifiable (CP-04).** States its criterion (ΔE2000 ≥ 8 between any two colours in a set, under each of the three simulations — what `check_palette.py` already measures) and states explicitly that it is a **distinguishability** test, not a contrast test: a WCAG ratio recomputed on simulated colours is not a conformance criterion and must not be reported as an R-14 failure. Where identity colours cannot be separated, R-04 governs instead. Written after a pilot filed a T0 on CVD-contrast figures that were ~3× overstated and did not reproduce — an unfalsifiable MUST is what made that possible.
- **§8.1 / G-07 — shared repos name the approver.** Where more than one person can merge, `DLS.md` MUST name who approves a MUST exception and who approves `foundations.md` changes. A role is fine if it resolves to a person; "the team" is not an approver. Without it an agent has no one to stop for, which is the failure G-07 exists to prevent.

Deferred to a later version, with the pilots' reasoning recorded: CP-05 (mandate `size.target.touch` so R-07 has a lever in utility-class stacks), CP-06 (adopt the greyscale gate as R-04's default check and re-tag it `script`), CP-07 (`viz` attaches to charts, not projects), CP-08 (scope R-18's measure to prose), CP-09 (restate R-24's destructive-action intent), CP-10 (unit axis, elevation-out-of-system, display-size exemption).

### [1.3.0] — 2026-09-08 — frozen baseline
- **Redundancy audit applied** (two independent semantic reviews of the full set): 13 duplicate rules merged into their survivors; 15 value-only rows moved into `tokens.json` (scales, families, durations, breakpoints, z-index, page grid, number formats — thin rules retained where an obligation remained); 5 contradictions fixed (deviation-record depth; target size vs control size, now with a touch-first density carve-out; doc-table level; reduced-motion wording vs transform-only animation; 1.333 scale 4xl = 67 px); 13 taste-only rules rewritten with measurable criteria (accent ≤ 10% of pixels, ≤ 3 boolean props, bottom-40% thumb zone, sentence titles, scripts-blocked render, three-part summary, cited do/don'ts, four-field proposals). 134 → **106 rules**.
- **Added:** `Check` axis (`script | data | review | judgement`) on every rule and Appendix G.3 drift-exposure table; `↳ refines` markers making the specialisation graph explicit (lint: target exists, is at least as blocking; no embedded scales); `build_rules.py --update-appendix`; `rules.py --check / --refines`; `tokens.json` gains `$extensions.dls.vocabulary` (incl. prop enums and the full §6.2 state list), `$extensions.dls.typeScales`, `format.number.*`, `doc.page.*` and per-token usage `$description`s.
- **Renumbered once.** IDs are frozen from this version. 1.2.0 → 1.3.0 map (unchanged IDs omitted):

| 1.2.0 | 1.3.0 |
|---|---|
| C-03 | — merged into T-05 |
| C-04 | C-03 |
| C-05 | C-06 |
| C-06 | C-07 |
| C-07 | C-08 |
| C-08 | C-09 |
| C-09 | C-10 |
| C-10 | C-04 |
| C-11 | C-05 |
| G-06 | — merged into R-28 |
| G-07 | G-06 |
| G-08 | G-07 |
| G-09 | G-08 |
| G-10 | G-09 |
| G-11 | G-10 |
| M-doc-02 | — merged into M-doc-01 |
| M-doc-03 | M-doc-02 |
| M-doc-04 | M-doc-03 |
| M-doc-05 | M-doc-04 |
| M-doc-06 | M-doc-05 |
| M-doc-07 | M-doc-06 |
| M-site-02 | — merged into R-22 |
| M-site-03 | M-site-02 |
| M-site-04 | M-site-03 |
| M-site-05 | — merged into R-13 |
| M-site-06 | M-site-04 |
| R-16 | — merged into T-04 |
| R-17 | — merged into T-06 |
| R-18 | — merged into T-08 |
| R-19 | R-16 |
| R-20 | R-17 |
| R-21 | R-18 |
| R-22 | R-19 |
| R-23 | — merged into R-15 |
| R-24 | R-20 |
| R-25 | R-21 |
| R-26 | R-22 |
| R-27 | — merged into T-05 |
| R-28 | R-23 |
| R-29 | R-24 |
| R-30 | R-25 |
| R-31 | R-26 |
| R-32 | R-27 |
| R-33 | — merged into D-01 |
| R-34 | — merged into G-06 |
| R-35 | — merged into G-01 |
| R-36 | R-28 |
| R-37 | R-29 |
| T-11 | — merged into T-01 |
| T-16 | — merged into R-15 |
| T-17 | — merged into R-15 |
| T-18 | — merged into M-app-01 |
| T-19 | — merged into R-18 |
| T-20 | T-16 |
| T-21 | — merged into T-17 |
| T-22 | T-17 |
| T-23 | T-18 |
| T-24 | — merged into T-17 |
| T-25 | T-19 |
| T-26 | — merged into T-01 |
| T-27 | — merged into R-05 |
| T-28 | — merged into R-15 |
| T-29 | — merged into R-15 |
| T-30 | T-20 |
| T-31 | — merged into R-12 |
| T-32 | — merged into C-10 |
| T-33 | — merged into R-15 |
| T-34 | — merged into R-15 |
| T-35 | T-11 |

### [1.2.0] — 2026-09-08
- Added: three explicit metadata axes on every rule — **Level** (strictness), **Tier** (precedence: T0 Blocking / T1 Structural / T2 Quality) and **Topic** (retrieval tags) — as table columns; §0.2 rewritten to define the axes and the conflict rule (tier → level → principle order); Appendix G with the Tier 0 register, topic × tier matrix and the machine-readable index (`build_rules.py` → `rules.json`/`rules.yaml`, with lint; `rules.py` query CLI).
- Changed: §3 retitled "Core rules" — the `R-` prefix now means location only; strictness is the Level column everywhere. §0.3 states IDs are never renumbered. Principles explicitly excluded from tagging (order is their priority).
- No rule text changed; no IDs changed. Tier assignments are a first pass for review — disagreements go through G-04 as a metadata-only change.

### [1.1.0] — 2026-09-08
- Added after live validation against the six reference sources (Appendix F): R-37 three-layer accessibility verification; T-35 share tokens not code; C-10 adapt-before-create with headless base libraries; C-11 component maturity ladder (draft → candidate → stable → deprecated); D-08 generate docs from code; D-09 tiered documentation depth; G-11 documentation audit cadence.
- Changed: P-09 brownfield clause; D-06 status vocabulary now uses the C-11 ladder; G-02 deprecation carries a migration window; §9.2 gains an explicit audit step and base-library input; Appendix B adds Code example, Related components and Base fields; Appendix D adds C-11 and R-37 items.

### [1.0.0] — 2026-09-08
- Initial release: principles P-01–12, rules R-01–36, token rules T-01–34, profiles `app` `viz` `site` `doc`, component rules C-01–09, documentation D-01–07, governance G-01–10, agent procedure, starter tokens and validators.
