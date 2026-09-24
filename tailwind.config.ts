import type { Config } from 'tailwindcss'

/*
 * DeepEncode — "Night Forge" design system.
 *
 * Same industrial identity, rebuilt for readability:
 *   • Three truly distinct surfaces: page (#0E0F12), panel (#17191E),
 *     inset (#0A0B0E). Elevation comes from lightness + a soft ambient
 *     shadow, not from borders on every element.
 *   • Borders are hairlines (1px) used sparingly; the border color
 *     (edge) is a step lighter than the panels so it reads as a seam.
 *   • Ink: bone (high emphasis) / slate-ink (mid) / solder (muted).
 *   • Accents: amber = action, flux = AI, signal = success, hazard = errors.
 *
 * Type: Space Grotesk carries prose & labels (readable at normal case);
 * IBM Plex Mono is reserved for data — inputs, numbers, badges, code.
 */
const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        /* Surfaces */
        chassis: '#0E0F12',
        deck: '#17191E',
        inset: '#0A0B0E',
        edge: '#2A2D35',
        /* Ink */
        bone: '#E8E6E1',
        'slate-ink': '#A8ADB8',
        solder: '#6E737E',
        /* Accents */
        amber: {
          50: '#FBF3E8',
          100: '#F5E3C8',
          200: '#EED3A3',
          300: '#E8C186',
          400: '#DBA05C',
          500: '#D08430',
          600: '#A65F1E',
          700: '#844A17',
          800: '#633813',
          900: '#452812',
          950: '#2A180B',
          DEFAULT: '#D08430',
        },
        hazard: {
          50: '#FAEFEA',
          100: '#F3D8CE',
          200: '#E9BBA9',
          300: '#DB987E',
          400: '#CC6F49',
          500: '#C25A38',
          600: '#98391C',
          700: '#772B15',
          800: '#592110',
          900: '#3E180B',
          950: '#261007',
          DEFAULT: '#C25A38',
        },
        signal: {
          300: '#7CC8A0',
          400: '#58B183',
          500: '#3F9A6B',
          600: '#2E7A53',
          700: '#235F41',
          800: '#19452F',
          900: '#102F20',
          950: '#0A1F15',
          DEFAULT: '#3F9A6B',
        },
        flux: {
          300: '#B9A5EA',
          400: '#9C7FE0',
          500: '#7C5BD1',
          600: '#6448B0',
          700: '#4E3689',
          800: '#392766',
          900: '#281B47',
          950: '#190F2C',
          DEFAULT: '#7C5BD1',
        },
      },
      fontFamily: {
        mono: ['"IBM Plex Mono"', '"Courier New"', 'monospace'],
        sans: ['"Space Grotesk"', 'system-ui', '-apple-system', 'sans-serif'],
      },
      boxShadow: {
        panel: '0 1px 0 rgba(255,255,255,0.03) inset, 0 8px 24px -12px rgba(0,0,0,0.6)',
        raised: '0 1px 0 rgba(255,255,255,0.04) inset, 0 12px 32px -12px rgba(0,0,0,0.7)',
        'glow-amber': '0 0 0 1px rgba(208,132,48,0.55), 0 0 20px -4px rgba(208,132,48,0.35)',
      },
      /* Motion: 120ms base, 200ms entrances. Colors + opacity only. */
      transitionDuration: {
        DEFAULT: '120ms',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-up': 'fade-up 200ms ease-out both',
      },
    },
  },
  plugins: [],
}
export default config
