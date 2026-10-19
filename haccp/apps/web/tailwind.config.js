/** @type {import('tailwindcss').Config} */
module.exports = {
    content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
    theme: {
      extend: {
        colors: {
          ink: {
            950: "#0F0D0B", 900: "#14110F", 800: "#1C1815", 700: "#26211D",
            600: "#3A332D", 500: "#5C534A", 400: "#857A6E",
          },
          ivory: { 50: "#FDFBF7", 100: "#F8F4EB", 200: "#EEE7D8", 300: "#DFD5C0" },
          gold: { 300: "#E0C98F", 400: "#CDAE67", 500: "#B8923F", 600: "#977628" },
          terracotta: { 400: "#C9694B", 500: "#B5573A", 600: "#964530" },
          status: { ok: "#3F7D5C", warn: "#D08A1E", critical: "#B3402F" },
        },
        fontFamily: {
          display: ["var(--font-display)", "Georgia", "serif"],
          sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        },
        backgroundImage: {
          "gold-gradient": "linear-gradient(135deg, #E0C98F 0%, #CDAE67 45%, #B8923F 100%)",
          "ink-glow": "radial-gradient(120% 90% at 100% 0%, rgba(205,174,103,0.16), transparent 55%)",
        },
        boxShadow: {
          card: "0 1px 0 rgba(255,255,255,0.8) inset, 0 1px 2px rgba(20,17,15,0.04), 0 12px 32px -12px rgba(20,17,15,0.12)",
          lux: "0 1px 0 rgba(224,201,143,0.15) inset, 0 20px 40px -16px rgba(15,13,11,0.45)",
        },
        keyframes: {
          "fade-up": {
            "0%": { opacity: "0", transform: "translateY(8px)" },
            "100%": { opacity: "1", transform: "translateY(0)" },
          },
        },
        animation: { "fade-up": "fade-up 0.5s ease-out both" },
      },
    },
    plugins: [],
  };