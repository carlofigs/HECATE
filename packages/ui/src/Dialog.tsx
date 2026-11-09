import { X } from 'lucide-react'
import { AlertDialog, Dialog as RadixDialog } from 'radix-ui'
import type { ReactNode } from 'react'
import { Button, IconButton } from './Button.tsx'

/** design/components/dialog.md */
const OVERLAY = 'fixed inset-0 z-(--z-overlay) bg-bg-overlay'
/** A sheet from the bottom on narrow screens (thumb reach, M-app-07); centred from `md`. */
const CONTENT = [
  'fixed z-(--z-modal) inset-x-0 bottom-0 flex max-h-dvh flex-col gap-stack-md overflow-y-auto',
  'rounded-t-container border border-border-subtle bg-bg-raised p-inset-lg shadow-modal text-text-primary',
  'md:inset-auto md:left-1/2 md:top-1/2 md:w-full md:max-w-prose md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-container md:p-inset-xl',
].join(' ')

export interface DialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  children: ReactNode
}

/** A task that needs the person's attention before going on (M-app-05). Focus is trapped and returns to the opener. */
export function Dialog({ open, onOpenChange, title, description, children }: DialogProps) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className={OVERLAY} />
        <RadixDialog.Content className={CONTENT} {...(description ? {} : { 'aria-describedby': undefined })}>
          <div className="flex items-start justify-between gap-inline-md">
            <RadixDialog.Title className="text-heading-2">{title}</RadixDialog.Title>
            <RadixDialog.Close asChild>
              <IconButton label="Close" icon={<X aria-hidden="true" className="size-(--size-icon-md)" />} />
            </RadixDialog.Close>
          </div>
          {description ? <RadixDialog.Description className="text-body-md text-text-secondary">{description}</RadixDialog.Description> : null}
          {children}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  )
}

export interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  /** The destructive action's label, e.g. "Delete A12". */
  confirmLabel: string
  onConfirm: () => void
}

/** Confirms a destructive action (R-24): Cancel has focus and is the default; the action is never primary-styled. */
export function ConfirmDialog({ open, onOpenChange, title, description, confirmLabel, onConfirm }: ConfirmDialogProps) {
  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className={OVERLAY} />
        <AlertDialog.Content className={CONTENT}>
          <AlertDialog.Title className="text-heading-2">{title}</AlertDialog.Title>
          <AlertDialog.Description className="text-body-md text-text-secondary">{description}</AlertDialog.Description>
          <div className="flex flex-col-reverse gap-stack-sm md:flex-row md:justify-end md:gap-inline-sm">
            <AlertDialog.Cancel asChild>
              <Button>Cancel</Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <Button tone="danger" onClick={onConfirm}>
                {confirmLabel}
              </Button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}
