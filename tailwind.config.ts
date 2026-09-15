import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#FFF4EC",
          100: "#FFE3CC",
          200: "#FFC599",
          300: "#FF9F5C",
          400: "#FF7A2E",
          500: "#F2560F",
          600: "#D6420A",
          700: "#AD3309",
          800: "#84280C",
          900: "#5C1D0A",
          950: "#331005",
        },
        surface: {
          DEFAULT: "#FFFFFF",
          muted: "#FAF7F3",
          subtle: "#F1ECE4",
          border: "#E3DBCE",
        },
        ink: {
          DEFAULT: "#1B1712",
          muted: "#665E52",
          faint: "#9A9184",
        },
        background: "var(--background)",
        foreground: "var(--foreground)",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 3px 0 rgba(45,26,10,0.06), 0 1px 2px -1px rgba(45,26,10,0.04)",
        panel: "0 4px 6px -1px rgba(45,26,10,0.08), 0 2px 4px -2px rgba(45,26,10,0.04)",
      },
    },
  },
  plugins: [],
};
export default config;
