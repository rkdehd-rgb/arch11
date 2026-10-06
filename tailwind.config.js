/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'media',
  theme: {
    extend: {
      colors: {
        paper: '#FAF9F7',
        surface: '#FFFFFF',
        'surface-raised': '#F6F5F2',
        ink: '#1C1B19',
        'ink-2': '#57544E',
        'ink-3': '#8B877E',
        line: '#E7E4DE',
        'line-strong': '#D4D0C7',
        accent: '#A9472D',
        'accent-dark': '#8E3A24',
        'accent-soft': '#F3E7E1',
        canvas: '#1C1B19',
        blueprint: '#14171C',
      },
      fontFamily: {
        sans: ['Inter', '"Noto Sans SC"', '"PingFang SC"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'Inter', 'monospace'],
      },
    },
  },
  plugins: [],
};
