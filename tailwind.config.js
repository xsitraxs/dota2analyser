/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          50: '#F2F7F4',
          100: '#E4EDE8',
          200: '#CFDDD6',
          300: '#B0C4BB',
          400: '#8FA69D',
          500: '#6F857C',
          950: '#070A09',
          900: '#0A0F0D',
          850: '#0D1311',
          800: '#111917',
          750: '#151F1C',
          700: '#1A2622',
          600: '#24332E',
        },
        mint: {
          50: '#EEFBF3',
          100: '#D6F7E2',
          200: '#A9EEC4',
          300: '#79E3A3',
          400: '#54D585',
          500: '#2FBE6B',
        },
        lime: '#C9F26B',
        gold: '#E9C46A',
        dire: '#FF6B62',
        radiant: '#5FE08B',
        sky: '#7FB5FF',
        violet: '#B7A4FF',
      },
      fontFamily: {
        display: ['Unbounded', 'Manrope', 'system-ui', 'sans-serif'],
        sans: ['Manrope Variable', 'Manrope', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(14px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'pulse-soft': {
          '0%, 100%': { opacity: '0.55' },
          '50%': { opacity: '1' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-500px 0' },
          '100%': { backgroundPosition: '500px 0' },
        },
      },
      animation: {
        'fade-up': 'fade-up .5s cubic-bezier(.22,1,.36,1) both',
        'fade-in': 'fade-in .4s ease both',
        'pulse-soft': 'pulse-soft 2.4s ease-in-out infinite',
        shimmer: 'shimmer 1.6s linear infinite',
      },
      boxShadow: {
        panel: '0 24px 60px -30px rgba(0,0,0,.8)',
        glow: '0 0 0 1px rgba(201,242,107,.25), 0 18px 50px -18px rgba(201,242,107,.25)',
      },
    },
  },
  plugins: [],
};
