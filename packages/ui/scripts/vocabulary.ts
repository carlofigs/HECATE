/**
 * The token vocabulary (DESIGN-STANDARD T-07, C-07): every segment of every
 * token name, and every component prop value, comes from these lists. A new
 * term is added here and to design/foundations.md before it is used; the
 * token tests fail otherwise.
 */
export const VOCABULARY = {
  categories: ['color', 'space', 'font', 'text', 'radius', 'border', 'shadow', 'size', 'breakpoint', 'grid', 'z', 'motion', 'opacity'],
  ramps: ['white', 'neutral', 'amber', 'orange', 'green', 'red', 'blue'],
  concepts: [
    'bg', 'text', 'border', 'accent', 'status',
    'inset', 'stack', 'inline',
    'family', 'size', 'weight', 'lineHeight', 'letterSpacing',
    'display', 'heading', 'body', 'label', 'caption', 'code', 'data',
    'width', 'control', 'target', 'icon', 'container', 'columns', 'gutter',
    'duration', 'easing',
  ],
  variants: [
    'canvas', 'surface', 'raised', 'subtle', 'overlay',
    'primary', 'secondary', 'muted', 'inverse', 'link', 'on-accent',
    'default', 'strong', 'focus',
    'success', 'warning', 'danger', 'info',
    'sans', 'mono', 'regular', 'medium', 'semibold', 'tight', 'snug', 'normal',
    'none', 'full', 'pill', 'modal',
    'min', 'touch', 'prose', 'app', 'column',
    'base', 'dropdown', 'sticky', 'popover', 'toast',
    'instant', 'fast', 'slow', 'deliberate', 'standard', 'enter', 'exit', 'linear',
    'disabled',
  ],
  states: ['hover', 'active'],
  steps: [
    '0', '1', '2', '3', '4', '5', '6', '8', '10', '12', '16', '20', '24',
    '50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950',
    'xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl', '4xl',
  ],
  props: {
    variant: ['primary', 'secondary', 'ghost'],
    size: ['sm', 'md', 'lg'],
    tone: ['neutral', 'accent', 'success', 'warning', 'danger', 'info'],
  },
} as const

/** Terms written with a hyphen inside one name segment. */
export const COMPOUND_TERMS: readonly string[] = ['on-accent']

/** Every term a token name segment may use. */
export function tokenTerms(): Set<string> {
  const { props: _props, ...groups } = VOCABULARY
  return new Set(Object.values(groups).flat())
}
