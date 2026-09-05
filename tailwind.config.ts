import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          blue: "#2563EB",
          "blue-dark": "#1D4ED8",
          "blue-light": "#EFF6FF",
          navy: "#172554",
          bg: "#F8FAFC",
          border: "#E2E8F0",
          card: "#FFFFFF",
          green: "#16A34A",
          "green-light": "#F0FDF4",
          amber: "#D97706",
          "amber-light": "#FFFBEB",
          red: "#DC2626",
          "red-light": "#FEF2F2",
          slate: "#64748B",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 2px 0 rgba(23, 37, 84, 0.04), 0 1px 3px 0 rgba(23, 37, 84, 0.06)",
        "card-hover": "0 4px 12px 0 rgba(23, 37, 84, 0.08)",
      },
      borderRadius: {
        DEFAULT: "8px",
        lg: "12px",
        xl: "16px",
      },
    },
  },
  plugins: [],
};
export default config;
