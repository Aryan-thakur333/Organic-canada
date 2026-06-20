/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: {
          primary: 'var(--bg-primary)',
          secondary: 'var(--bg-secondary)',
        },
        text: {
          primary: 'var(--text-primary)',
          secondary: 'var(--text-secondary)',
        },
        accent: {
          primary: 'var(--accent-primary)',
          secondary: 'var(--accent-secondary)',
        },
        organic: {
          primary: "#6B302E",
          brown: "#6B302E",
          brownMuted: "#5a2826",
          /** Header / page band: light pink-beige for contrast with mint hero */
          headerBg: "#faf6f4",
          pageMuted: "#fdfcfb",
          mint: "#c2e6d6",
          mintDeep: "#8fc9b6",
          teal: "#2d7d78",
          terracotta: "#FF9933",
          cream: "#f5faf7",
          peach: "#fff5f2",
          skyRing: "#b8e4f5",
          cardGreen: "#b8e8d4",
          cardBlue: "#a9d6f5",
          cardCoral: "#ffb5a5",
          cardLime: "#d9f5c8",
        },
      },
      fontFamily: {
        logo: ['"Playfair Display"', "Georgia", "serif"],
        display: ['"Poppins"', "system-ui", "sans-serif"],
        sans: ['"Poppins"', "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
