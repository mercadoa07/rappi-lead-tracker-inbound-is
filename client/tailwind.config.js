/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        primary: {
          DEFAULT: '#FF441F',
          dark:    '#E63B1A',
          light:   '#FF6B4A',
        },
        dark:    '#1A1A2E',
        gray: {
          light:  '#F5F5F5',
          medium: '#E0E0E0',
        },
        success: '#10B981',
        warning: '#F59E0B',
        danger:  '#EF4444',
        info:    '#3B82F6',
      },
      keyframes: {
        loading: {
          '0%':   { transform: 'translateX(-100%)' },
          '50%':  { transform: 'translateX(100%)' },
          '100%': { transform: 'translateX(250%)' },
        },
      },
      animation: {
        loading: 'loading 1.5s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
