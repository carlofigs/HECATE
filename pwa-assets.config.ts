import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config'

// Rasterises public/icon.svg into the PWA icon set (192/512/maskable/apple-touch
// + favicon.ico). Run `npm run generate-pwa-assets`; the output PNGs are committed
// to public/ so the deploy build needs no icon generation step.
export default defineConfig({
  preset: minimal2023Preset,
  images: ['public/icon.svg'],
})
