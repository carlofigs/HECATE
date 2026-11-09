/**
 * A token's length in CSS pixels, for the few APIs that take a number
 * rather than a CSS value (Radix positioning offsets). Read from the live
 * stylesheet, so the number is never restated here (R-15).
 */
export function tokenPx(name: `--${string}`): number {
  if (typeof document === 'undefined') return 0
  const root = document.documentElement
  const value = getComputedStyle(root).getPropertyValue(name).trim()
  const resolved = value.startsWith('var(') ? getComputedStyle(root).getPropertyValue(value.slice(4, -1).trim()).trim() : value
  const n = Number.parseFloat(resolved)
  if (Number.isNaN(n)) return 0
  return resolved.endsWith('rem') ? n * Number.parseFloat(getComputedStyle(root).fontSize) : n
}
