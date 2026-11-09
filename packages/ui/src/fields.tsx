import { useId, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react'
import { cn } from './cn.ts'

/** design/components/text-field.md */
const CONTROL = [
  'w-full min-h-(--size-control-default) rounded-control border bg-bg-surface px-inline-md text-body-md text-text-primary',
  'hover:border-border-strong disabled:cursor-not-allowed disabled:opacity-(--opacity-disabled)',
].join(' ')

interface FieldShellProps {
  id: string
  label: string
  /** Shown in the label, not by colour alone (M-app-03). */
  required?: boolean
  hint?: string
  error?: string
  children: ReactNode
  className?: string
}

/** Label above, hint, the control, and its error beside it (R-09, R-27, M-app-03). */
function FieldShell({ id, label, required, hint, error, children, className }: FieldShellProps) {
  return (
    <div className={cn('flex flex-col gap-stack-xs', className)}>
      <label htmlFor={id} className="text-label text-text-primary">
        {label}
        {required ? <span className="text-text-secondary"> (required)</span> : null}
      </label>
      {hint ? <p id={`${id}-hint`} className="text-body-sm text-text-secondary">{hint}</p> : null}
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-body-sm text-status-danger-text">
          {error}
        </p>
      ) : null}
    </div>
  )
}

const describedBy = (id: string, hint?: string, error?: string): string | undefined =>
  [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(' ') || undefined

export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  label: string
  hint?: string
  error?: string
  className?: string
}

export function TextField({ label, hint, error, required, className, ...rest }: TextFieldProps) {
  const id = useId()
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} required={required ?? false} className={className}>
      <input
        id={id}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        className={cn(CONTROL, error ? 'border-status-danger-border' : 'border-border-default')}
        {...rest}
      />
    </FieldShell>
  )
}

export interface TextAreaFieldProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id'> {
  label: string
  hint?: string
  error?: string
  className?: string
}

export function TextAreaField({ label, hint, error, required, className, rows = 4, ...rest }: TextAreaFieldProps) {
  const id = useId()
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} required={required ?? false} className={className}>
      <textarea
        id={id}
        rows={rows}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        className={cn(CONTROL, 'py-inset-sm', error ? 'border-status-danger-border' : 'border-border-default')}
        {...rest}
      />
    </FieldShell>
  )
}

export interface RadioGroupFieldProps {
  legend: string
  name: string
  value: string
  options: readonly { value: string; label: string }[]
  onChange: (value: string) => void
  className?: string
}

/** A choice of one, all options visible: native radios in a fieldset. */
export function RadioGroupField({ legend, name, value, options, onChange, className }: RadioGroupFieldProps) {
  return (
    <fieldset className={cn('flex flex-col gap-stack-xs', className)}>
      <legend className="mb-stack-xs text-label text-text-primary">{legend}</legend>
      <div className="flex flex-wrap gap-inline-sm">
        {options.map(o => (
          <label
            key={o.value}
            className={cn(
              'inline-flex min-h-(--size-control-default) min-w-(--size-target-default) cursor-pointer items-center gap-inline-sm rounded-control border px-inline-md text-body-md',
              o.value === value ? 'border-accent-text bg-accent-bg-subtle' : 'border-border-default bg-bg-surface hover:bg-bg-surface-hover',
            )}
          >
            <input type="radio" name={name} value={o.value} checked={o.value === value} onChange={() => onChange(o.value)} className="size-(--size-icon-sm) accent-(--color-accent-text)" />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  )
}
