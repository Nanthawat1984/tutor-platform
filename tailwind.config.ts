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
      colors: {
        border:      "rgb(var(--border) / <alpha-value>)",
        input:       "rgb(var(--input) / <alpha-value>)",
        ring:        "rgb(var(--ring) / <alpha-value>)",
        background:  "rgb(var(--background) / <alpha-value>)",
        foreground:  "rgb(var(--foreground) / <alpha-value>)",
        primary: {
          DEFAULT:    "rgb(var(--primary) / <alpha-value>)",
          foreground: "rgb(var(--primary-foreground) / <alpha-value>)",
        },
        secondary: {
          DEFAULT:    "rgb(var(--secondary) / <alpha-value>)",
          foreground: "rgb(var(--secondary-foreground) / <alpha-value>)",
        },
        destructive: {
          DEFAULT:    "rgb(var(--destructive) / <alpha-value>)",
          foreground: "rgb(var(--destructive-foreground) / <alpha-value>)",
        },
        muted: {
          DEFAULT:    "rgb(var(--muted) / <alpha-value>)",
          foreground: "rgb(var(--muted-foreground) / <alpha-value>)",
        },
        accent: {
          DEFAULT:    "rgb(var(--accent) / <alpha-value>)",
          foreground: "rgb(var(--accent-foreground) / <alpha-value>)",
        },
        card: {
          DEFAULT:    "rgb(var(--card) / <alpha-value>)",
          foreground: "rgb(var(--card-foreground) / <alpha-value>)",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      fontFamily: {
        sans: ["Sarabun", "Plus Jakarta Sans", "sans-serif"],
        display: ["Plus Jakarta Sans", "Sarabun", "sans-serif"],
      },
      backgroundImage: {
        "edu-gradient": "linear-gradient(135deg, rgb(124,58,237) 0%, rgb(139,92,246) 50%, rgb(167,139,250) 100%)",
        "hero-gradient": "linear-gradient(135deg, rgb(76,29,149) 0%, rgb(109,40,217) 40%, rgb(139,92,246) 100%)",
        "card-gradient": "linear-gradient(135deg, rgba(124,58,237,0.08), rgba(139,92,246,0.04))",
        "sidebar-gradient": "linear-gradient(180deg, rgba(248,245,255,0.95) 0%, rgba(243,240,255,0.95) 100%)",
      },
      boxShadow: {
        "card":     "0 4px 24px -4px rgba(124,58,237,0.12), 0 1px 4px rgba(124,58,237,0.06)",
        "elevated": "0 16px 48px -8px rgba(124,58,237,0.20), 0 4px 12px rgba(124,58,237,0.08)",
        "button":   "0 4px 12px rgba(124,58,237,0.30)",
        "glow":     "0 0 24px rgba(139,92,246,0.40)",
        "inner-lg": "inset 0 2px 8px rgba(124,58,237,0.08)",
      },
      animation: {
        "fadeInUp":     "fadeInUp 0.5s ease both",
        "fadeInLeft":   "fadeInLeft 0.4s ease both",
        "slideInRight": "slideInRight 0.4s ease both",
        "scaleIn":      "scaleIn 0.4s ease both",
        "shimmer":      "shimmer 3s linear infinite",
        "pulseGlow":    "pulseGlow 2s ease-in-out infinite",
        "float":        "float 3s ease-in-out infinite",
        "gradientShift":"gradientShift 8s ease infinite",
        "spin-slow":    "spin 3s linear infinite",
      },
      keyframes: {
        fadeInUp:    { from: { opacity: "0", transform: "translateY(20px)" }, to: { opacity: "1", transform: "translateY(0)" } },
        fadeInLeft:  { from: { opacity: "0", transform: "translateX(-20px)" }, to: { opacity: "1", transform: "translateX(0)" } },
        slideInRight:{ from: { opacity: "0", transform: "translateX(32px)" }, to: { opacity: "1", transform: "translateX(0)" } },
        scaleIn:     { from: { opacity: "0", transform: "scale(0.94)" }, to: { opacity: "1", transform: "scale(1)" } },
        shimmer:     { from: { backgroundPosition: "-200% center" }, to: { backgroundPosition: "200% center" } },
        pulseGlow:   { "0%,100%": { boxShadow: "0 0 0 0 rgba(124,58,237,0.3)" }, "50%": { boxShadow: "0 0 0 8px rgba(124,58,237,0)" } },
        float:       { "0%,100%": { transform: "translateY(0)" }, "50%": { transform: "translateY(-6px)" } },
        gradientShift:{ "0%": { backgroundPosition: "0% 50%" }, "50%": { backgroundPosition: "100% 50%" }, "100%": { backgroundPosition: "0% 50%" } },
      },
    },
  },
  plugins: [require("@tailwindcss/typography")],
};

export default config;
