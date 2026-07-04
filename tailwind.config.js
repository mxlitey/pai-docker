/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef4ff',
          100: '#d9e6ff',
          200: '#bcd3ff',
          300: '#8eb5ff',
          400: '#598cff',
          500: '#3366ff',
          600: '#1f47e6',
          700: '#1838b8',
          800: '#1a3394',
          900: '#1b3076',
        },
      },
    },
  },
  plugins: [],
}
