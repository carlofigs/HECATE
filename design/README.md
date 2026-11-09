# HECATE design layer

## Overview

HECATE v2's user interface follows the owner's `DESIGN-STANDARD.md`. It is vendored here as Layer 0, and the files beside it are HECATE's own Layer 1. Start with [`DLS.md`](DLS.md).

| Path | What | Who changes it |
|---|---|---|
| [`DESIGN-STANDARD.md`](DESIGN-STANDARD.md) | The standard, v1.4.0: principles, rules, token schema, profiles, governance | Upstream only (see below) |
| `build_rules.py`, `rules.py`, `rules.json`, `rules.yaml` | The standard's rule index and its query CLI | Upstream only |
| [`DLS.md`](DLS.md) | HECATE's design language: profile, conformance target, touch-first declaration, base library, status | This repo |
| [`principles.md`](principles.md) | The principles in force, in order | This repo |
| [`foundations.md`](foundations.md) | Chosen values per category and why, and the token vocabulary | This repo; the owner approves changes (§8.1) |
| [`tokens/tokens.json`](tokens/tokens.json) | Every token in DTCG format, **generated** from `packages/ui/src/theme.css` | `pnpm tokens`, never by hand |
| [`DECISIONS.md`](DECISIONS.md) | Deviations and exceptions (Appendix C) | This repo; the owner approves MUST exceptions |
| [`CHANGELOG.md`](CHANGELOG.md) | Semver history of the design layer | This repo |
| `components/` | One spec per component (Appendix B), added with its code | This repo |

## Usage

```bash
python design/rules.py --tier T0                       # the blocking register: read it before any UI review
python design/rules.py --topic a11y --profile app      # the rules for what you are touching
python design/rules.py --id R-07                       # one rule
pnpm tokens                                            # regenerate tokens/tokens.json after editing theme.css
```

## Vendoring

These files are copied from the owner's upstream kit:

- `DESIGN-STANDARD.md`
- `build_rules.py`
- `rules.py`
- `rules.json`
- `rules.yaml`

Edits go upstream first, then the files are copied again.

There are two local differences:

- **The owner's name.** The standard's `Owner:` line says "the repository owner". This repository is public and keeps personal names out of the tree. Rebuilding the index (`python design/build_rules.py design/DESIGN-STANDARD.md design`) gives byte-identical `rules.json` and `rules.yaml`.
- **The token tooling is replaced.** The upstream kit's `tokens/` folder holds a neutral starter palette and two scripts that are not vendored: `build_tokens.py` (DTCG → CSS) and `check_palette.py` (contrast and CVD). HECATE runs the standard's other peer default (T-08 option B), where the Tailwind v4 stylesheet is the source and `tokens.json` is generated from it. The checks `check_palette.py` performs run as tests in `packages/ui` (`test/tokens.test.ts`) on every CI run.

## Limitations

- R-14's colour-vision check has no palette to run on yet. HECATE declares no categorical colours, and tags render in neutral. The check arrives with the first categorical palette.
