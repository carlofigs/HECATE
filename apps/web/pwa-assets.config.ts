import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config'

/**
 * The PWA icon set, rasterised from the trinity on its indigo badge
 * (branding/hecate-favicon.svg, copied to public/). Padding takes the badge's
 * indigo, not the preset's white, so every icon is edge to edge; the maskable
 * icon keeps the mark inside the safe zone. Run `pnpm --filter @hecate/web
 * icons` after the brand changes and commit public/.
 */
const INDIGO = '#15141f'

export default defineConfig({
  preset: {
    transparent: { ...minimal2023Preset.transparent, padding: 0, resizeOptions: { fit: 'contain', background: INDIGO } },
    maskable: { ...minimal2023Preset.maskable, padding: 0.3, resizeOptions: { fit: 'contain', background: INDIGO } },
    apple: { ...minimal2023Preset.apple, padding: 0.1, resizeOptions: { fit: 'contain', background: INDIGO } },
  },
  images: ['public/hecate-favicon.svg'],
})
