import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sora: ["var(--font-sora)", "sans-serif"],
      },
      colors: {
        brand: {
          50: "#e0f4f8",
          100: "#b8e8f0",
          500: "var(--brand)",
          600: "var(--brand)",
          700: "var(--brand-hover)",
          900: "var(--bg)",
        },
        navy: {
          DEFAULT: "var(--bg)",
          light: "var(--surface)",
          lighter: "var(--surface-hover)",
          border: "var(--border)",
        },
        accent: {
          DEFAULT: "var(--warning)",
          hover: "var(--warning-hover)",
        },
        muted: "var(--text-muted)",
        surface: "var(--surface)",
        "surface-hover": "var(--surface-hover)",
        border: "var(--border)",
        "text-main": "var(--text)",
        "text-muted": "var(--text-muted)",
        "text-secondary": "var(--text-secondary)",
      },
    },
  },
  plugins: [],
};

export default config;
