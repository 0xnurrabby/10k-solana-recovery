/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        solana: {
          purple: '#9945FF',
          green: '#14F195',
          cyan: '#00F0FF',
          dark: '#0e111a',
          card: '#161c28',
          border: '#232b3e',
        },
      },
      fontFamily: {
        display: [
          '"Plus Jakarta Sans"',
          'system-ui',
          '-apple-system',
          'sans-serif',
        ],
        sans: [
          '"Plus Jakarta Sans"',
          'system-ui',
          '-apple-system',
          'sans-serif',
        ],
        mono: [
          '"JetBrains Mono"',
          'ui-monospace',
          '"SF Mono"',
          'monospace',
        ],
      },
      borderRadius: {
        'pill': '9999px',
        'xl': '12px',
        '2xl': '16px',
        '3xl': '24px',
      },
    },
  },
  plugins: [],
}
