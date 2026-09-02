import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./pages/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./app/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
  ],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        // One class per brand accent, on purpose. These were objects with
        // `solid` and `text` variants tuned for contrast in specific spots; the
        // palette is now one hue each, so `bg-coral`/`text-coral` and
        // `bg-teal`/`text-teal` are the whole vocabulary. `destructive` below
        // keeps its `solid` variant - errors are the deliberate exception.
        coral: "hsl(var(--coral))",
        teal: "hsl(var(--teal))",
        pressure: "hsl(var(--pressure))",
        ceiling: "hsl(var(--ceiling))",
        tooltip: {
          DEFAULT: "hsl(var(--tooltip))",
          foreground: "hsl(var(--tooltip-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          solid: "hsl(var(--destructive-solid))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "skeleton-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "skeleton-pulse": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.5" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        // Two animations, and the delay on the first is the point: a skeleton
        // takes up its space immediately but stays *invisible* for 150ms, so a
        // response that beats it (most of them, against a local API) swaps
        // straight from the old page to the new one with no grey flash in
        // between - while still reserving the layout, so nothing jumps when it
        // lands. Only a load slow enough to be worth reporting is ever seen,
        // and once seen it breathes so it reads as pending rather than broken.
        // `both` is what holds opacity at 0 through the delay.
        skeleton:
          "skeleton-in 200ms ease-out 150ms both, skeleton-pulse 1.8s ease-in-out 350ms infinite",
        // The reveal half on its own, for the *chrome* a placeholder draws - the
        // card outlines and row borders. Those are real `Card`s and `TableRow`s,
        // so without this they paint instantly and a fast response still flashes
        // a grid of empty bordered boxes, which is most of what the delay exists
        // to prevent. Deliberately not the full `skeleton` shorthand: a pulsing
        // container multiplied by a pulsing bar would dip the bars to a quarter
        // opacity instead of half.
        "skeleton-reveal": "skeleton-in 200ms ease-out 150ms both",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
