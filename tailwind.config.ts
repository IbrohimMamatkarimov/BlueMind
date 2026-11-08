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
          blue: "#85617B",
          "blue-dark": "#6C4C63",
          "blue-light": "#F4EAF0",
          navy: "#352B33",
          bg: "#F7F3ED",
          border: "#E7DFDA",
          card: "#FFFDFA",
          green: "#16A34A",
          "green-light": "#F0FDF4",
          amber: "#D97706",
          "amber-light": "#FFFBEB",
          red: "#DC2626",
          "red-light": "#FEF2F2",
          slate: "#877981",
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
