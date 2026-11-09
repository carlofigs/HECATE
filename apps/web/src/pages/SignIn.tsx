import { ButtonLink } from '@hecate/ui'
import { LogIn } from 'lucide-react'
import { useLocation } from 'react-router'
import { Mark } from '../shell/Mark.tsx'

/** Signed out: one way in, through the Worker's GitHub sign-in (ADR 0003). */
export function SignIn() {
  const { pathname, search } = useLocation()
  const back = encodeURIComponent(`${pathname}${search}`)
  return (
    <main id="main" className="flex min-h-dvh items-center justify-center bg-bg-canvas p-inset-lg">
      <div className="flex w-full max-w-prose flex-col items-start gap-stack-md rounded-container border border-border-subtle bg-bg-surface p-inset-xl shadow-raised">
        <Mark className="size-(--size-control-lg) text-text-primary" />
        <h1 className="text-heading-1 text-text-primary">Sign in to HECATE</h1>
        <p className="text-body-md text-text-secondary">
          HECATE keeps your plans in your own GitHub repository. Sign in with the GitHub account it belongs to.
        </p>
        <ButtonLink variant="primary" href={`/auth/login?back=${back}`} icon={<LogIn aria-hidden="true" className="size-(--size-icon-md)" />}>
          Sign in with GitHub
        </ButtonLink>
      </div>
    </main>
  )
}
