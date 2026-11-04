import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config'

// Rasterises public/icon.svg into the PWA icon set. The minimal-2023 defaults pad
// the maskable + apple icons with a WHITE background and the "any" icons with a
// transparent one, which left a visible border around our indigo badge. Override
// the padding background to the brand indigo (#15141f) so every icon is edge-to-edge.
// Run `npm run generate-pwa-assets`; outputs are committed to public/.
const background = '#15141f'

export default defineConfig({
  preset: {
    transparent: { ...minimal2023Preset.transparent, padding: 0, resizeOptions: { fit: 'contain', background } },
    maskable:    { ...minimal2023Preset.maskable,     padding: 0.3, resizeOptions: { fit: 'contain', background } },
    apple:       { ...minimal2023Preset.apple,        padding: 0.1, resizeOptions: { fit: 'contain', background } },
  },
  images: ['public/icon.svg'],
})
