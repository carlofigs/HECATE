import { CircleAlert, CircleCheck, Info, X } from 'lucide-react'
import { Toast } from 'radix-ui'
import { cn } from './cn.ts'

/** design/components/toast.md */
export interface ToastItem {
  id: string
  tone: 'success' | 'danger' | 'info'
  title: string
  description?: string
  /** One action, e.g. Undo. `altText` says how to do it without the toast (Radix announces it). */
  action?: { label: string; altText: string; onAction: () => void }
}

const TONE = {
  success: { icon: CircleCheck, classes: 'text-status-success-icon' },
  danger: { icon: CircleAlert, classes: 'text-status-danger-icon' },
  info: { icon: Info, classes: 'text-status-info-icon' },
} as const

/** How long a toast stays: at least 5 s, and it pauses while hovered or focused (M-app-05). */
const DURATION_MS = 8_000

/** The confirmation of a completed action (M-app-05): non-blocking, announced politely (danger at once), with at most one action. */
export function Toaster({ toasts, onDismiss }: { toasts: readonly ToastItem[]; onDismiss: (id: string) => void }) {
  return (
    <Toast.Provider duration={DURATION_MS} swipeDirection="down" label="Notifications">
      {toasts.map(t => {
        const { icon: Icon, classes } = TONE[t.tone]
        return (
          <Toast.Root
            key={t.id}
            type={t.tone === 'danger' ? 'foreground' : 'background'}
            onOpenChange={open => {
              if (!open) onDismiss(t.id)
            }}
            className="flex items-start gap-inline-md rounded-container border border-border-subtle bg-bg-raised p-inset-md text-text-primary shadow-overlay"
          >
            <Icon aria-hidden="true" className={cn('size-(--size-icon-md) shrink-0', classes)} />
            <div className="flex min-w-0 flex-1 flex-col gap-stack-xs">
              <Toast.Title className="text-label">{t.title}</Toast.Title>
              {t.description ? <Toast.Description className="text-body-sm text-text-secondary">{t.description}</Toast.Description> : null}
            </div>
            {t.action ? (
              <Toast.Action
                altText={t.action.altText}
                onClick={t.action.onAction}
                className="inline-flex min-h-(--size-control-default) min-w-(--size-target-default) cursor-pointer items-center rounded-control border border-border-default bg-bg-surface px-inline-md text-label hover:bg-bg-surface-hover"
              >
                {t.action.label}
              </Toast.Action>
            ) : null}
            <Toast.Close aria-label="Dismiss" className="inline-flex size-(--size-control-default) shrink-0 cursor-pointer items-center justify-center rounded-control hover:bg-bg-surface-hover">
              <X aria-hidden="true" className="size-(--size-icon-md)" />
            </Toast.Close>
          </Toast.Root>
        )
      })}
      <Toast.Viewport className="fixed inset-x-0 bottom-0 z-(--z-toast) mx-auto flex w-full max-w-prose flex-col gap-stack-sm p-inset-md max-md:bottom-(--size-control-lg)" />
    </Toast.Provider>
  )
}
