import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
      },
      colors: {
        brand: {
          DEFAULT: "#dc2626",
          dark: "#991b1b",
          light: "#fef2f2",
          ring: "#fecaca",
        },
        ink: {
          950: "#0a0a0c",
          900: "#111114",
          800: "#1a1a1f",
          700: "#26262e",
          600: "#38383f",
          500: "#57575f",
          400: "#7a7a82",
        },
      },
      boxShadow: {
        card: "0 1px 2px 0 rgb(0 0 0 / 0.04), 0 1px 3px 0 rgb(0 0 0 / 0.06)",
        panel: "0 4px 24px -4px rgb(0 0 0 / 0.12)",
      },
    },
  },
  plugins: [],
};

export default config;

