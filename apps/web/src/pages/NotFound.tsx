import { buttonStyles } from '@hecate/ui'
import { Link } from 'react-router'

export function NotFound() {
  return (
    <main id="main" className="mx-auto flex min-h-dvh w-full max-w-prose flex-col justify-center gap-stack-md bg-bg-canvas p-inset-lg">
      <h1 className="text-heading-1 text-text-primary">Page not found</h1>
      <p className="text-body-md text-text-secondary">There is nothing at this address. It may be an old link.</p>
      <Link to="/" className={buttonStyles('primary', 'self-start')}>
        Go to Today
      </Link>
    </main>
  )
}
