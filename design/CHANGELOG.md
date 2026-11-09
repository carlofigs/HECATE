# HECATE design layer — changelog

Semver (G-01). Each entry lists the rule IDs it concerns.

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
