/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: ["class", '[data-theme="chatmaths-dark"]'],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Source Sans 3", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        heading: ["Lexend", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
      },
      animation: {
        "fade-in": "fadeIn 0.35s ease-out",
        "slide-up": "slideUp 0.3s ease-out",
        "pulse-slow": "pulse 2.5s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "float-slow": "float 9s ease-in-out infinite",
        "float-slower": "float 13s ease-in-out infinite",
        "shimmer": "shimmer 3.5s linear infinite",
        "pulse-ring": "pulseRing 2.4s cubic-bezier(0.4, 0, 0.6, 1) infinite",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: 0 },
          "100%": { opacity: 1 },
        },
        slideUp: {
          "0%": { opacity: 0, transform: "translateY(8px)" },
          "100%": { opacity: 1, transform: "translateY(0)" },
        },
        float: {
          "0%, 100%": { transform: "translate(0, 0) scale(1)" },
          "50%": { transform: "translate(2%, -4%) scale(1.05)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "0% 50%" },
          "100%": { backgroundPosition: "200% 50%" },
        },
        pulseRing: {
          "0%": { transform: "scale(0.85)", opacity: 0.6 },
          "70%": { transform: "scale(1.25)", opacity: 0 },
          "100%": { transform: "scale(0.85)", opacity: 0 },
        },
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(99,102,241,0.15), 0 8px 24px -8px rgba(99,102,241,0.35)",
      },
    },
  },
  plugins: [require("@tailwindcss/typography"), require("daisyui")],
  daisyui: {
    themes: [
      {
        "chatmaths-light": {
          primary: "#0d9488",
          "primary-content": "#ffffff",
          secondary: "#0891b2",
          "secondary-content": "#ffffff",
          accent: "#d97706",
          "accent-content": "#ffffff",
          neutral: "#1f2937",
          "base-100": "#ffffff",
          "base-200": "#f1faf9",
          "base-300": "#e1f1ee",
          info: "#0891b2",
          success: "#16a34a",
          warning: "#d97706",
          error: "#dc2626",
        },
      },
      {
        "chatmaths-dark": {
          primary: "#2dd4bf",
          "primary-content": "#062420",
          secondary: "#22d3ee",
          "secondary-content": "#062024",
          accent: "#fbbf24",
          "accent-content": "#2b1a04",
          neutral: "#e5e7eb",
          "base-100": "#0b1615",
          "base-200": "#101f1d",
          "base-300": "#17302c",
          info: "#22d3ee",
          success: "#4ade80",
          warning: "#fbbf24",
          error: "#f87171",
        },
      },
    ],
    darkTheme: "chatmaths-dark",
  },
}
