import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from './cn.ts'

/** design/components/button.md */
export type ButtonVariant = 'primary' | 'secondary' | 'ghost'

const BASE = [
  'inline-flex items-center justify-center gap-inline-sm rounded-control',
  'min-h-(--size-control-default) min-w-(--size-target-default) text-label no-underline',
  'transition-colors cursor-pointer',
  'disabled:cursor-not-allowed disabled:opacity-(--opacity-disabled) aria-disabled:cursor-not-allowed aria-disabled:opacity-(--opacity-disabled)',
].join(' ')

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-accent-default text-text-on-accent hover:bg-accent-hover active:bg-accent-active',
  secondary: 'bg-bg-surface text-text-primary border border-border-default hover:bg-bg-surface-hover active:bg-bg-subtle',
  ghost: 'bg-transparent text-text-primary hover:bg-bg-surface-hover active:bg-bg-subtle',
}

/** The classes a button-styled element takes, for router links that look like buttons. */
export function buttonStyles(variant: ButtonVariant = 'secondary', className?: string): string {
  return cn(BASE, VARIANTS[variant], 'px-inline-lg', className)
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  /** Shown before the label; decorative. */
  icon?: ReactNode
}

export function Button({ variant = 'secondary', icon, className, type = 'button', children, ...rest }: ButtonProps) {
  return (
    <button type={type} className={buttonStyles(variant, className)} {...rest}>
      {icon}
      {children}
    </button>
  )
}

export interface ButtonLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  variant?: ButtonVariant
  icon?: ReactNode
}

/** A link that looks like a button: for navigation that leaves the app, such as signing in. */
export function ButtonLink({ variant = 'secondary', icon, className, children, ...rest }: ButtonLinkProps) {
  return (
    <a className={buttonStyles(variant, className)} {...rest}>
      {icon}
      {children}
    </a>
  )
}

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label' | 'children'> {
  /** The accessible name; the icon alone carries no text (R-08). */
  label: string
  icon: ReactNode
  variant?: Exclude<ButtonVariant, 'primary'>
}

export function IconButton({ label, icon, variant = 'ghost', className, type = 'button', ...rest }: IconButtonProps) {
  return (
    <button type={type} aria-label={label} title={label} className={cn(BASE, VARIANTS[variant], 'size-(--size-control-default) shrink-0', className)} {...rest}>
      {icon}
    </button>
  )
}
