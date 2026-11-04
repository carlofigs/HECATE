/**
 * HecateMark — the trinity-keyblade brand glyph as an inline SVG.
 *
 * Three crossed keys (crescent-moon / ring / torch-flame) meeting at a central
 * amber lock — Hecate as kleidouchos and Triformis; also Focus · Tasks · Memory.
 *
 * The keys are drawn with `currentColor` so the glyph follows the app theme
 * (HECATE toggles a `dark` class on <html>, not OS prefers-color-scheme), while
 * the lock hub and torch flame keep the fixed torch-amber accent. Set the colour
 * on the parent, e.g. `<HecateMark className="text-foreground" />`.
 */

export function HecateMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 120 120"
      className={className}
      role="img"
      aria-label="HECATE"
      xmlns="http://www.w3.org/2000/svg"
    >
      <g transform="translate(60,60)">
        <g fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round">
          <g transform="rotate(0)"><line x1="0" y1="-40" x2="0" y2="42" /><line x1="-7" y1="-32" x2="7" y2="-32" strokeWidth="5" /><path d="M-9 44 H9" /><line x1="0" y1="42" x2="0" y2="56" /><line x1="-9" y1="44" x2="-9" y2="54" /><line x1="9" y1="44" x2="9" y2="54" /></g>
          <g transform="rotate(120)"><line x1="0" y1="-40" x2="0" y2="42" /><line x1="-7" y1="-32" x2="7" y2="-32" strokeWidth="5" /><circle cx="0" cy="-48" r="7" /><line x1="0" y1="42" x2="0" y2="54" /><path d="M0 46 H8" /><path d="M0 50 H6" /></g>
          <g transform="rotate(240)"><line x1="0" y1="-40" x2="0" y2="42" /><line x1="-7" y1="-32" x2="7" y2="-32" strokeWidth="5" /><line x1="0" y1="42" x2="0" y2="56" /><path d="M0 50 H9" /></g>
          <circle cx="0" cy="0" r="9" />
        </g>
        <g transform="rotate(0)"><g transform="translate(0,-50)"><path d="M-7 0 A7 7 0 0 1 7 0 A9 9 0 0 0 -7 0 Z" fill="currentColor" /></g></g>
        <g transform="rotate(240)"><g transform="translate(0,-50)"><path d="M0 -10 C5 -3 5 2 0 5 C-5 2 -5 -3 0 -10 Z" fill="#e3a24a" /></g></g>
        <circle cx="0" cy="0" r="4" fill="#e3a24a" />
      </g>
    </svg>
  )
}
