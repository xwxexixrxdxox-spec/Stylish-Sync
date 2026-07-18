import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Palette matched to stylish-sync-stream-go.base44.app: clean white
        // surfaces, near-black text/CTAs, soft neutral borders, restrained
        // accent colors reserved for status (low-stock red, success green).
        ink: {
          950: "#0a0a0a",
          900: "#171717",
        },
        surface: {
          DEFAULT: "#ffffff",
          muted: "#f7f7f8",
          border: "#e7e7ea",
        },
        brand: {
          DEFAULT: "#171717",
          foreground: "#ffffff",
        },
        accent: {
          low: "#dc2626",
          ok: "#16a34a",
        },
      },
      borderRadius: {
        xl2: "1rem",
      },
      boxShadow: {
        card: "0 1px 2px 0 rgb(0 0 0 / 0.04), 0 1px 3px 0 rgb(0 0 0 / 0.06)",
      },
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Inter",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
      },
      keyframes: {
        "mark-in": {
          "0%": { opacity: "0", transform: "scale(0.82)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        "label-in": {
          "0%": { opacity: "0", transform: "translateY(4px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "fill-bar": {
          "0%": { width: "0%" },
          "70%": { width: "100%" },
          "100%": { width: "100%" },
        },
        "btn-pop": {
          "0%": { transform: "scale(1)" },
          "35%": { transform: "scale(0.82)" },
          "65%": { transform: "scale(1.12)" },
          "100%": { transform: "scale(1)" },
        },
        "float-up": {
          "0%": { opacity: "0", transform: "translate(-50%, 0) scale(0.7)" },
          "20%": { opacity: "1", transform: "translate(-50%, -6px) scale(1.05)" },
          "40%": { transform: "translate(-50%, -10px) scale(1)" },
          "100%": { opacity: "0", transform: "translate(-50%, -28px) scale(1)" },
        },
      },
      animation: {
        "mark-in": "mark-in 0.5s cubic-bezier(0.22,1,0.36,1) both",
        "label-in": "label-in 0.5s cubic-bezier(0.22,1,0.36,1) 0.15s both",
        "fill-bar": "fill-bar 1.3s cubic-bezier(0.4,0,0.2,1) 0.2s both",
        "btn-pop": "btn-pop 320ms cubic-bezier(0.34,1.56,0.64,1) both",
        "float-up": "float-up 650ms ease-out both",
      },
    },
  },
  plugins: [],
};

export default config;
