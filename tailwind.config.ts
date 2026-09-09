import type { Config } from 'tailwindcss'

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
        amber: '#C8782A',
        hazard: '#B84A28',
      },
      fontFamily: {
        mono: ['"IBM Plex Mono"', '"Courier New"', 'monospace'],
      },
    },
  },
  plugins: [],
}
export default config
