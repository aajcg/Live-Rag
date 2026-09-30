import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        mono: ["var(--font-jetbrains-mono)", "monospace"],
      },
      colors: {
        base: "var(--bg-base)",
        surface: "var(--bg-surface)",
        elevated: "var(--bg-elevated)",
        hover: "var(--bg-hover)",
        border: {
          subtle: "var(--border-subtle)",
          DEFAULT: "var(--border-default)",
        },
        text: {
          primary: "var(--text-primary)",
          secondary: "var(--text-secondary)",
          muted: "var(--text-muted)",
        },
        brand: {
          // Remapped to terracotta scheme
          primary: "var(--brand-primary)",
          soft: "var(--brand-soft)",
          // Aliases for old class names to not break components
          indigo: "var(--brand-primary)",
          violet: "var(--brand-soft)",
          cyan: "var(--semantic-success)",
          amber: "var(--brand-soft)",
        },
        semantic: {
          emerald: "var(--semantic-success)",
          amber: "var(--brand-soft)",
          rose: "var(--semantic-error)",
        },
      },
      backgroundImage: {
        "gradient-brand": "linear-gradient(135deg, var(--brand-soft) 0%, var(--brand-primary) 100%)",
      },
      boxShadow: {
        glow: "0 0 20px rgba(176, 81, 48, 0.15)",
        "glow-hover": "0 0 30px rgba(176, 81, 48, 0.25)",
      },
    },
  },
  plugins: [],
};

export default config;
