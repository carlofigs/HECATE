import { Check } from 'lucide-react'
import { DropdownMenu } from 'radix-ui'
import { useRef, type ReactNode } from 'react'
import { iconButtonStyles } from './Button.tsx'
import { tokenPx } from './tokens.ts'

/** design/components/menu.md */
export type MenuItem =
  | { kind?: 'item'; label: string; onSelect: () => void; disabled?: boolean; checked?: boolean }
  | { kind: 'label'; label: string }
  | { kind: 'separator' }

export interface MenuProps {
  /** The trigger's accessible name, e.g. "Move A12". */
  label: string
  /** The trigger's icon; it shows no text. */
  icon: ReactNode
  items: MenuItem[]
}

const ITEM = [
  // No outline-none: the global :focus-visible ring marks the item the keyboard is on (R-05); the highlight alone is under 3:1.
  'flex min-h-(--size-control-default) cursor-pointer items-center gap-inline-sm rounded-control px-inline-md text-body-md text-text-primary',
  'data-highlighted:bg-bg-surface-hover data-disabled:cursor-not-allowed data-disabled:opacity-(--opacity-disabled)',
].join(' ')

/**
 * Focus goes back to the trigger when the menu closes (R-06). An item can re-render the trigger elsewhere (Move to
 * another column moves the card): then the trigger with the same name takes focus, or, if it is out of sight (another
 * tab), the page's main region does.
 */
function returnFocus(event: Event, own: HTMLElement | null, label: string): void {
  event.preventDefault()
  const target = own?.isConnected
    ? own
    : [...document.querySelectorAll<HTMLElement>('[aria-haspopup="menu"]')].find(el => el.getAttribute('aria-label') === label && el.offsetParent !== null)
  if (target) target.focus()
  else if (!document.activeElement || document.activeElement === document.body) document.getElementById('main')?.focus()
}

/** A short list of actions behind one button. Arrow keys move, Enter chooses, Escape closes. */
export function Menu({ label, icon, items }: MenuProps) {
  const trigger = useRef<HTMLButtonElement>(null)
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger ref={trigger} aria-label={label} title={label} className={iconButtonStyles('ghost')}>
        {icon}
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          onCloseAutoFocus={event => returnFocus(event, trigger.current, label)}
          align="end"
          sideOffset={tokenPx('--spacing-inset-xs')}
          collisionPadding={tokenPx('--spacing-inset-sm')}
          className="z-(--z-popover) rounded-container border border-border-subtle bg-bg-raised p-inset-xs shadow-overlay"
        >
          {items.map((item, i) =>
            item.kind === 'separator' ? (
              <DropdownMenu.Separator key={i} className="my-stack-xs border-t border-border-subtle" />
            ) : item.kind === 'label' ? (
              <DropdownMenu.Label key={i} className="px-inline-md py-stack-xs text-label text-text-secondary">
                {item.label}
              </DropdownMenu.Label>
            ) : item.checked === undefined ? (
              <DropdownMenu.Item key={i} className={ITEM} disabled={item.disabled ?? false} onSelect={item.onSelect}>
                {item.label}
              </DropdownMenu.Item>
            ) : (
              <DropdownMenu.CheckboxItem key={i} className={ITEM} checked={item.checked} disabled={item.disabled ?? false} onSelect={item.onSelect}>
                <span className="inline-flex size-(--size-icon-md) items-center justify-center">
                  <DropdownMenu.ItemIndicator>
                    <Check aria-hidden="true" className="size-(--size-icon-md)" />
                  </DropdownMenu.ItemIndicator>
                </span>
                {item.label}
              </DropdownMenu.CheckboxItem>
            ),
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
