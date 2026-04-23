import type { Config } from 'tailwindcss'
import typography from '@tailwindcss/typography'

const config: Config = {
  darkMode: 'class',
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Epilogue', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      colors: {
        background:    'hsl(var(--background))',
        foreground:    'hsl(var(--foreground))',
        card:          'hsl(var(--card))',
        'card-foreground': 'hsl(var(--card-foreground))',
        popover:       'hsl(var(--popover))',
        'popover-foreground': 'hsl(var(--popover-foreground))',
        primary:       'hsl(var(--primary))',
        'primary-foreground': 'hsl(var(--primary-foreground))',
        secondary:     'hsl(var(--secondary))',
        'secondary-foreground': 'hsl(var(--secondary-foreground))',
        muted:         'hsl(var(--muted))',
        'muted-foreground': 'hsl(var(--muted-foreground))',
        accent:        'hsl(var(--accent))',
        'accent-foreground': 'hsl(var(--accent-foreground))',
        destructive:   'hsl(var(--destructive))',
        'destructive-foreground': 'hsl(var(--destructive-foreground))',
        border:        'hsl(var(--border))',
        input:         'hsl(var(--input))',
        ring:          'hsl(var(--ring))',
        // Column accent colours
        'col-todo':     'hsl(var(--col-todo))',
        'col-progress': 'hsl(var(--col-progress))',
        'col-review':   'hsl(var(--col-review))',
        'col-done':     'hsl(var(--col-done))',
        'col-blocked':  'hsl(var(--col-blocked))',
        'col-backlog':  'hsl(var(--col-backlog))',
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      typography: {
        DEFAULT: {
          css: {
            '--tw-prose-body': 'hsl(var(--foreground))',
            '--tw-prose-headings': 'hsl(var(--foreground))',
            '--tw-prose-lead': 'hsl(var(--muted-foreground))',
            '--tw-prose-links': 'hsl(var(--primary))',
            '--tw-prose-bold': 'hsl(var(--foreground))',
            '--tw-prose-counters': 'hsl(var(--muted-foreground))',
            '--tw-prose-bullets': 'hsl(var(--muted-foreground))',
            '--tw-prose-hr': 'hsl(var(--border))',
            '--tw-prose-quotes': 'hsl(var(--foreground))',
            '--tw-prose-quote-borders': 'hsl(var(--border))',
            '--tw-prose-captions': 'hsl(var(--muted-foreground))',
            '--tw-prose-code': 'hsl(var(--foreground))',
            '--tw-prose-pre-code': 'hsl(var(--foreground))',
            '--tw-prose-pre-bg': 'hsl(var(--card))',
            '--tw-prose-th-borders': 'hsl(var(--border))',
            '--tw-prose-td-borders': 'hsl(var(--border))',
            maxWidth: 'none',
            fontSize: '0.875rem',
            lineHeight: '1.6',
          },
        },
      },
    },
  },
  plugins: [typography],
}

export default config
