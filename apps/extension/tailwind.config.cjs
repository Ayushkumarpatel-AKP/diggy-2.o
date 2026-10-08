/**
 * Tailwind 3 config. Palette mirrors `@diggy/shared` tokens
 * (source of truth: `diggy motion/Diggy Pastel Productivity Dashboard.png`).
 * @type {import('tailwindcss').Config}
 */
module.exports = {
  content: [
    "./entrypoints/**/*.{html,ts,tsx}",
    "./src/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "#F7F8FA",
        surface: "#FFFFFF",
        surfaceAlt: "#FBFBFD",
        ink: "#111827",
        inkSoft: "#374151",
        muted: "#6B7280",
        line: "#E5E7EB",
        primary: "#F5B301",
        primaryInk: "#7A5A00",
        pastelBlue: "#4A7BF7",
        pastelPink: "#FB7185",
        pastelMint: "#34D399",
        pastelViolet: "#A78BFA",
      },
      borderRadius: {
        sm: "8px",
        md: "12px",
        lg: "16px",
        xl: "24px",
      },
    },
  },
  plugins: [],
};
