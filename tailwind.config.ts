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
    },
  },
  plugins: [],
};

export default config;
