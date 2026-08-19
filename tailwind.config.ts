import type { Config } from "tailwindcss";
import typography from "@tailwindcss/typography";

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
        /* ── Candy accents ── */
        candy: {
          pink:   "rgb(var(--candy-pink) / <alpha-value>)",
          mint:   "rgb(var(--candy-mint) / <alpha-value>)",
          sky:    "rgb(var(--candy-sky) / <alpha-value>)",
          sun:    "rgb(var(--candy-sun) / <alpha-value>)",
          lilac:  "rgb(var(--candy-lilac) / <alpha-value>)",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 4px)",
        sm: "calc(var(--radius) - 8px)",
        "4xl": "2rem",
      },
      fontFamily: {
        sans: ["Sarabun", "Baloo 2", "sans-serif"],
        display: ["Baloo 2", "Sarabun", "sans-serif"],
      },
      backgroundImage: {
        "edu-gradient": "linear-gradient(135deg, rgb(244,90,150) 0%, rgb(255,120,180) 50%, rgb(255,161,205) 100%)",
        "hero-gradient": "linear-gradient(135deg, rgb(185,42,100) 0%, rgb(219,60,124) 40%, rgb(255,120,180) 100%)",
        "card-gradient": "linear-gradient(135deg, rgba(255,161,205,0.12), rgba(255,199,224,0.06))",
        "sidebar-gradient": "linear-gradient(180deg, rgba(255,251,253,0.95) 0%, rgba(255,243,248,0.95) 100%)",
      },
      boxShadow: {
        "card":     "0 6px 24px -6px rgba(244,90,150,0.16), 0 2px 8px rgba(244,90,150,0.08)",
        "elevated": "0 20px 48px -10px rgba(244,90,150,0.25), 0 6px 16px rgba(244,90,150,0.10)",
        "button":   "0 5px 0 rgba(219,60,124,0.35), 0 8px 20px rgba(244,90,150,0.25)",
        "glow":     "0 0 24px rgba(255,120,180,0.45)",
        "inner-lg": "inset 0 2px 8px rgba(244,90,150,0.08)",
        "sticker":  "0 8px 0 rgba(244,90,150,0.18), 0 6px 24px -6px rgba(244,90,150,0.16)",
      },
      animation: {
        "fadeInUp":     "fadeInUp 0.5s ease both",
        "fadeInLeft":   "fadeInLeft 0.4s ease both",
        "slideInRight": "slideInRight 0.4s ease both",
        "scaleIn":      "scaleIn 0.4s ease both",
        "float":        "float 3.5s ease-in-out infinite",
        "wiggle":       "wiggle 2.5s ease-in-out infinite",
        "bounce-soft":  "bounceSoft 2.2s ease-in-out infinite",
        "pop-in":       "popIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) both",
        "pulseGlow":    "pulseGlow 2s ease-in-out infinite",
        "sparkle":      "sparkle 2.5s ease-in-out infinite",
        "gradientShift":"gradientShift 8s ease infinite",
        "spin-slow":    "spin 3s linear infinite",
      },
      keyframes: {
        fadeInUp:    { from: { opacity: "0", transform: "translateY(20px)" }, to: { opacity: "1", transform: "translateY(0)" } },
        fadeInLeft:  { from: { opacity: "0", transform: "translateX(-20px)" }, to: { opacity: "1", transform: "translateX(0)" } },
        slideInRight:{ from: { opacity: "0", transform: "translateX(32px)" }, to: { opacity: "1", transform: "translateX(0)" } },
        scaleIn:     { from: { opacity: "0", transform: "scale(0.90)" }, to: { opacity: "1", transform: "scale(1)" } },
        float:       { "0%,100%": { transform: "translateY(0) rotate(-2deg)" }, "50%": { transform: "translateY(-10px) rotate(2deg)" } },
        wiggle:      { "0%,100%": { transform: "rotate(-4deg)" }, "50%": { transform: "rotate(4deg)" } },
        bounceSoft:  { "0%,100%": { transform: "translateY(0)" }, "40%": { transform: "translateY(-8px)" }, "60%": { transform: "translateY(-4px)" } },
        popIn:       { "0%": { transform: "scale(0)" }, "70%": { transform: "scale(1.15)" }, "100%": { transform: "scale(1)" } },
        pulseGlow:   { "0%,100%": { boxShadow: "0 0 0 0 rgba(244,90,150,0.35)" }, "50%": { boxShadow: "0 0 0 10px rgba(244,90,150,0)" } },
        sparkle:     { "0%,100%": { opacity: "0.4", transform: "scale(0.8) rotate(0deg)" }, "50%": { opacity: "1", transform: "scale(1.15) rotate(20deg)" } },
        gradientShift:{ "0%": { backgroundPosition: "0% 50%" }, "50%": { backgroundPosition: "100% 50%" }, "100%": { backgroundPosition: "0% 50%" } },
      },
    },
  },
  plugins: [typography],
};

export default config;
