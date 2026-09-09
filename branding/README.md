# HECATE brand assets

The mark is a **trinity of keyblades** — three crossed keys meeting at a central amber lock. Hecate is the *kleidouchos*, keeper of the keys to the gates between worlds, and *Triformis*, the three-faced goddess. Each of the three keys carries a different bow for one of her domains:

- **Crescent-moon key** — the sky / lunar aspect (Selene-Hecate)
- **Ring key** — the classic key, the earthly crossroads (*trivia*)
- **Torch-flame key** (amber) — the torch-bearer who lights the way

The three-fold form also maps to HECATE's own rhythm: Focus, Tasks, Memory — all turning on one lock. A single upright **Hero keyblade** is kept as the clean small-size / favicon alternate.

## Palette

| Token | Hex | Use |
|-------|-----|-----|
| Indigo black | `#15141f` | Badge / dark surfaces |
| Moonlight silver | `#cdd4e6` | Mark on dark |
| Night ink | `#1b1930` | Mark on light |
| Torch amber | `#e3a24a` | Single accent only (lock hub + torch) |

## Files

### Primary — trinity mark

| File | Purpose |
|------|---------|
| `hecate-mark.svg` | Primary glyph, transparent, auto-adapts light/dark via `prefers-color-scheme` |
| `hecate-favicon.svg` | Trinity on the indigo badge |
| `hecate-wordmark.svg` | Horizontal lockup (icon + HECATE), auto-adapting |
| `hecate-favicon-{16,32,180,512}.png` | Raster favicons / apple-touch-icon |
| `hecate-mark-512.png` | Raster badge icon |
| `hecate-wordmark.png` / `-light.png` | Raster wordmark, dark / light background |

### Alternate — hero keyblade (best at tiny sizes)

| File | Purpose |
|------|---------|
| `hecate-*-hero.svg` | Single upright keyblade: mark, favicon, wordmark |
| `hecate-favicon-hero-{16,32,180,512}.png`, `hecate-mark-hero-512.png` | Raster set |

**Recommendation:** use the trinity mark everywhere it appears at ~24px and up (sidebar header, splash, social), and the hero keyblade for the 16px browser-tab favicon where the trinity gets crowded.

## App integration

Drop the SVG + PNGs into `public/` and replace the favicon block in `index.html`:

```html
<link rel="icon" type="image/svg+xml" href="/hecate-favicon.svg" />
<link rel="icon" type="image/png" sizes="32x32" href="/hecate-favicon-hero-32.png" />
<link rel="apple-touch-icon" sizes="180x180" href="/hecate-favicon-180.png" />
```

Note: the wordmark SVG uses a system font stack (`Trebuchet MS` / `Segoe UI`). For a fully portable asset, outline the text in a vector editor before shipping it outside your own machines.
