import type { Config } from "tailwindcss";
import defaultTheme from "tailwindcss/defaultTheme";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        homeward: {
          bg: "#faf5ec",
          card: "#fffdf8",
          border: "#e9e0d2",
          primary: "#1f6b3a",
          primaryDark: "#16522c",
          forest: "#17492a",
          forestDeep: "#123a20",
          sage: "#6fae86",
          sageLight: "#a9d2b8",
          mint: "#e7f2ea",
          // Warm secondary tone (golden-hour terracotta) — sparing accent, never a
          // second dominant color. Distinct from `warn` (system warning amber).
          accent: "#c1683a",
          accentLight: "#f4ddc4",
          accentDark: "#8f4a24",
          warn: "#b45309",
          danger: "#b3261e",
          ink: "#221f1a",
          muted: "#6b6156",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", ...defaultTheme.fontFamily.sans],
        display: ["var(--font-display)", "Georgia", ...defaultTheme.fontFamily.serif],
      },
      keyframes: {
        fadeUp: {
          "0%": { opacity: "0", transform: "translateY(14px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        floaty: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-12px)" },
        },
        pulseRing: {
          "0%, 100%": { opacity: "0.35", transform: "scale(1)" },
          "50%": { opacity: "0.12", transform: "scale(1.1)" },
        },
      },
      animation: {
        "fade-up": "fadeUp 0.45s cubic-bezier(0.16,1,0.3,1) both",
        floaty: "floaty 3s ease-in-out infinite",
        "pulse-ring": "pulseRing 2.5s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
