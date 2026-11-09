import { Banner, Button } from '@hecate/ui'

/** A new version is waiting (shell/updates.ts): say so until the person reloads (a banner: it lasts until acted on, M-app-05). */
export function UpdateBanner({ onReload }: { onReload: () => void }) {
  return (
    <Banner tone="info" title="A new version of HECATE is ready" action={<Button onClick={onReload}>Reload</Button>}>
      Reload to start using it.
    </Banner>
  )
}
