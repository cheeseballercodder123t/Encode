import type { Config } from 'tailwindcss'

/*
 * DeepEncode — "Illuminated" design system.
 *
 * A scriptorium rather than a cockpit: the page is a dark hall lit from above,
 * panels are stone tablets with real depth (soft ambient shadow + a hairline of
 * top light), and a single gold leaf accent marks what matters. Nothing is
 * striped, nothing is glass, nothing glows purple.
 *
 *   • Surfaces — chassis (hall) / deck (tablet) / inset (recessed well).
 *   • Lines — `edge` is a warm hairline, used where a seam is genuinely needed
 *     (a table of rows, a modal header); panels separate by value and shadow,
 *     not by a rule on every edge, so the page never reads as stacked bands.
 *   • Ink — bone (vellum, high emphasis) / slate-ink (mid) / solder (muted).
 *   • Accents — gold (`amber`) = action & emphasis · flux (ultramarine) = AI ·
 *     signal (verdigris) = verified · hazard (ember) = errors.
 *
 * Type: Fraunces carries headlines (a high-contrast serif with real character);
 * IBM Plex Sans carries prose & labels; IBM Plex Mono is reserved for data —
 * inputs, numbers, badges, code.
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
        /* Surfaces — obsidian with a faint blue-violet undertone, so warm gold
           reads as metal against it instead of grey-on-black. */
        chassis: '#0B0C11',
        deck: '#14161D',
        inset: '#0C0E13',
        edge: '#2A2E39',
        /* A slightly brighter seam for the one place a line should be felt. */
        gilt: '#D2A455',
        /* Ink — vellum, not paper white. */
        bone: '#F3EEE3',
        'slate-ink': '#B5B1A6',
        solder: '#807D73',
        /* Gold leaf. */
        amber: {
          50: '#FBF7EE',
          100: '#F5EAD2',
          200: '#EDD9AC',
          300: '#E3C285',
          400: '#D5A659',
          500: '#C79340',
          600: '#A1752E',
          700: '#7C5A24',
          800: '#5A411C',
          900: '#3A2A13',
          950: '#241809',
          DEFAULT: '#C79340',
        },
        /* Ember — errors and destructive actions. */
        hazard: {
          50: '#FAEFEA',
          100: '#F3D8CE',
          200: '#E9BBA9',
          300: '#E09C7E',
          400: '#D07B54',
          500: '#C2603A',
          600: '#9A3F1F',
          700: '#782F17',
          800: '#592210',
          900: '#3E180B',
          950: '#261007',
          DEFAULT: '#C2603A',
        },
        /* Verdigris — a verified mechanism. */
        signal: {
          300: '#86C7A9',
          400: '#5FAF8C',
          500: '#47986F',
          600: '#357A57',
          700: '#285F43',
          800: '#1D4732',
          900: '#133023',
          950: '#0A1D15',
          DEFAULT: '#47986F',
        },
        /* Ultramarine — the AI surfaces (paradoxes, Teach Me). */
        flux: {
          300: '#A6AEF0',
          400: '#8089E4',
          500: '#6169D6',
          600: '#4B52B0',
          700: '#3A408C',
          800: '#2A2E68',
          900: '#1C1F47',
          950: '#101128',
          DEFAULT: '#6169D6',
        },
      },
      fontFamily: {
        display: ['Fraunces', 'Iowan Old Style', 'Palatino Linotype', 'Georgia', 'serif'],
        mono: ['"IBM Plex Mono"', '"Courier New"', 'monospace'],
        sans: ['"IBM Plex Sans"', 'system-ui', '-apple-system', 'sans-serif'],
      },
      /* Depth is back, but warm and soft: a hairline of top light to say the
         surface is lit, plus a wide, low-opacity ambient shadow so a tablet
         sits on the hall instead of being drawn on it. */
      boxShadow: {
        panel: '0 1px 0 rgba(255,255,255,0.035) inset, 0 24px 48px -32px rgba(0,0,0,0.9)',
        raised: '0 1px 0 rgba(255,255,255,0.05) inset, 0 36px 70px -34px rgba(0,0,0,0.95)',
        gilt: '0 0 0 1px rgba(210,164,85,0.16), 0 18px 44px -26px rgba(210,164,85,0.35)',
      },
      /* Curvature language: wells and small controls are gently rounded, panels
         generously, the shell and sheets softly. Consistent, never pill-shaped
         except for chips and status dots. */
      borderRadius: {
        DEFAULT: '8px',
        sm: '6px',
        md: '10px',
        lg: '14px',
        xl: '18px',
        '2xl': '24px',
        '3xl': '30px',
      },
      /* Motion: colors + opacity only, 150ms base, 300ms entrances. */
      transitionDuration: {
        DEFAULT: '150ms',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        /* A single soft bloom for the light at the top of the hall. */
        'dawn': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
      },
      animation: {
        'fade-up': 'fade-up 300ms ease-out both',
        'dawn': 'dawn 900ms ease-out both',
      },
    },
  },
  plugins: [],
}
export default config
