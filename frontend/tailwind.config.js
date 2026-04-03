/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        bg: {
          primary: '#0d1117',
          secondary: '#161b22',
          card: '#1c2128',
          hover: '#21262d',
        },
        border: '#30363d',
        text: {
          primary: '#e6edf3',
          secondary: '#8b949e',
          muted: '#484f58',
        },
        green: {
          400: '#3fb950',
          500: '#238636',
        },
        red: {
          400: '#f85149',
          500: '#da3633',
        },
        accent: '#58a6ff',
      },
    },
  },
  plugins: [],
}
