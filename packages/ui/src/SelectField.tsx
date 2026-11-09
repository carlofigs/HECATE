import { useId, type SelectHTMLAttributes } from 'react'
import { cn } from './cn.ts'

/** design/components/select-field.md */
export interface SelectFieldProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'children'> {
  /** Always visible, above the control (R-09, M-app-03). */
  label: string
  options: readonly { value: string; label: string }[]
  /** Lays the label beside the control instead of above it, for toolbars. */
  inline?: boolean
}

export function SelectField({ label, options, inline = false, className, id, ...rest }: SelectFieldProps) {
  const generated = useId()
  const selectId = id ?? generated
  return (
    <div className={cn('flex', inline ? 'items-center gap-inline-sm' : 'flex-col gap-stack-xs', className)}>
      <label htmlFor={selectId} className="text-label text-text-secondary">
        {label}
      </label>
      <select
        id={selectId}
        className={cn(
          'min-h-(--size-control-default) min-w-0 rounded-control border border-border-default bg-bg-surface px-inline-md',
          'text-body-md text-text-primary cursor-pointer hover:border-border-strong',
          'disabled:cursor-not-allowed disabled:opacity-(--opacity-disabled)',
        )}
        {...rest}
      >
        {options.map(o => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  )
}
