import type { Config } from "tailwindcss";

const config: Config = {
  // Theme is an explicit user choice (light / dark / system), persisted and
  // applied by ThemeScript before paint — not `media`, which would ignore it.
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // "Steel Blue & Gunmetal" — an instrument-cluster/gauge-needle
        // blue over cool graphite-gray neutrals, same token shape as
        // kids-heaven-education/admin's brand/surface/ink scale (see that
        // repo's tailwind.config.ts) but recolored for an automotive feel
        // instead of that app's softer SaaS blue. Deliberately not red —
        // .btn-danger and error text already use red for delete/danger,
        // so brand stays clearly distinct from that.
        brand: {
          50: "#EBF1F6",
          100: "#D2E1EC",
          200: "#A6C3D9",
          300: "#79A5C6",
          400: "#4D87B3",
          500: "#2A5D8C",
          600: "#224C72",
          700: "#1A3B59",
          800: "#132A40",
          900: "#0C1A29",
          950: "#060D14",
        },
        // Surface and ink resolve through CSS variables (see globals.css) so
        // that flipping `.dark` on <html> re-themes every existing
        // `bg-surface` / `text-ink` class in the app without touching a
        // single component. Brand stays fixed hex — the accent reads the
        // same on both themes.
        surface: {
          DEFAULT: "rgb(var(--surface) / <alpha-value>)",
          muted: "rgb(var(--surface-muted) / <alpha-value>)",
          subtle: "rgb(var(--surface-subtle) / <alpha-value>)",
          border: "rgb(var(--surface-border) / <alpha-value>)",
        },
        ink: {
          DEFAULT: "rgb(var(--ink) / <alpha-value>)",
          muted: "rgb(var(--ink-muted) / <alpha-value>)",
          faint: "rgb(var(--ink-faint) / <alpha-value>)",
        },
        // Same triplet form as surface/ink — `bg-background` on the public
        // page wrappers has to re-theme too. (There is no `foreground`
        // token: `text-ink` is the one way to colour text.)
        background: "rgb(var(--background) / <alpha-value>)",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 3px 0 rgba(42,93,140,0.08), 0 1px 2px -1px rgba(42,93,140,0.05)",
        panel: "0 4px 6px -1px rgba(42,93,140,0.10), 0 2px 4px -2px rgba(42,93,140,0.06)",
      },
    },
  },
  plugins: [],
};
export default config;
