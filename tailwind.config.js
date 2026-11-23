/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './settings.html', './src/**/*.{vue,ts}'],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          '"Segoe UI Variable Text"',
          '"Segoe UI"',
          '"Microsoft YaHei UI"',
          '"Microsoft YaHei"',
          'system-ui',
          '-apple-system',
          'sans-serif',
        ],
        display: [
          '"Segoe UI Variable Display"',
          '"Segoe UI"',
          '"Microsoft YaHei UI"',
          'system-ui',
          'sans-serif',
        ],
        mono: ['"Cascadia Code"', '"JetBrains Mono"', 'Consolas', 'monospace'],
      },
      colors: {
        brand: {
          50: '#f2f0ff',
          100: '#e7e3ff',
          200: '#d1c9ff',
          300: '#b3a4ff',
          400: '#9278ff',
          500: '#7c5cff',
          600: '#6c3df2',
          700: '#5a2bd6',
          800: '#4a25ad',
          900: '#3d208b',
          950: '#29145f',
        },
      },
      borderRadius: {
        '4xl': '1.75rem',
      },
      boxShadow: {
        card: '0 24px 60px -28px rgba(2, 6, 23, 0.65), 0 8px 24px -12px rgba(2, 6, 23, 0.32)',
        float: '0 18px 40px -20px rgba(2, 6, 23, 0.55)',
        glow: '0 0 0 1px rgba(255, 255, 255, 0.06), 0 12px 32px -18px rgba(124, 92, 255, 0.7)',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'rise-in': {
          from: { opacity: '0', transform: 'translateY(14px) scale(0.985)' },
          to: { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        'card-in': {
          from: { opacity: '0', transform: 'translateY(10px) scale(0.97)' },
          to: { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        'pop-in': {
          from: { opacity: '0', transform: 'translateY(-4px) scale(0.97)' },
          to: { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        'toast-in': {
          from: { opacity: '0', transform: 'translateY(-12px) scale(0.96)' },
          to: { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '200% 0' },
          '100%': { backgroundPosition: '-200% 0' },
        },
      },
      animation: {
        'fade-in': 'fade-in 180ms ease-out both',
        'rise-in': 'rise-in 240ms cubic-bezier(0.22, 1, 0.36, 1) both',
        'card-in': 'card-in 320ms cubic-bezier(0.22, 1, 0.36, 1) both',
        'pop-in': 'pop-in 150ms cubic-bezier(0.22, 1, 0.36, 1) both',
        'toast-in': 'toast-in 220ms cubic-bezier(0.22, 1, 0.36, 1) both',
      },
    },
  },
  plugins: [],
}
