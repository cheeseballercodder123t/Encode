import type { Config } from 'tailwindcss'

/*
 * DeepEncode — Industrial Workbench palette.
 *
 * Surfaces : chassis (page) / deck (panels) / steel (borders & chrome)
 * Ink      : bone (high emphasis) / solder (muted)
 * Accents  : amber  = action & brand (the only "go" color for CTAs)
 *            hazard = errors, destructive, overheated states
 *            signal = success, verified, mastery
 *            flux   = AI-generated / Teach Me / machine-authored content
 *
 * amber & hazard keep 50..950 scales because components reference
 * light/dark stops (amber200, hazard950, ...) that previously rendered
 * as nothing. signal & flux ship 300..950, the stops actually used.
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
        chassis: '#141517',
        deck: '#1B1D1F',
        steel: '#2B2D31',
        bone: '#D5D2CA',
        solder: '#7A7D82',
        amber: {
          50: '#FBF3E8',
          100: '#F5E3C8',
          200: '#EED3A3',
          300: '#E4BE7D',
          400: '#D99A55',
          500: '#C8782A',
          600: '#A65F1E',
          700: '#844A17',
          800: '#633813',
          900: '#452812',
          950: '#2A180B',
          DEFAULT: '#C8782A',
        },
        hazard: {
          50: '#FAEFEA',
          100: '#F3D8CE',
          200: '#E9BBA9',
          300: '#DB987E',
          400: '#CC6F49',
          500: '#B84A28',
          600: '#98391C',
          700: '#772B15',
          800: '#592110',
          900: '#3E180B',
          950: '#261007',
          DEFAULT: '#B84A28',
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
          300: '#B29BE8',
          400: '#9678DE',
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
    },
  },
  plugins: [],
}
export default config
