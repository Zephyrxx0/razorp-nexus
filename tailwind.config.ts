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
        background: "#09090b",
        foreground: "#f4f4f5",
        card: {
          DEFAULT: "#18181b",
          foreground: "#f4f4f5",
        },
        popover: {
          DEFAULT: "#18181b",
          foreground: "#f4f4f5",
        },
        primary: {
          DEFAULT: "#10b981", // Emerald 500 accent
          foreground: "#ffffff",
        },
        secondary: {
          DEFAULT: "#27272a", // Zinc 800
          foreground: "#f4f4f5",
        },
        muted: {
          DEFAULT: "#27272a",
          foreground: "#a1a1aa",
        },
        accent: {
          DEFAULT: "#10b981",
          foreground: "#ffffff",
        },
        destructive: {
          DEFAULT: "#ef4444",
          foreground: "#ffffff",
        },
        warning: {
          DEFAULT: "#f59e0b",
          foreground: "#ffffff",
        },
        border: "#27272a",
        input: "#27272a",
        ring: "#10b981",
      },
      borderRadius: {
        lg: "0.5rem",
        md: "0.375rem",
        sm: "0.25rem",
      },
      spacing: {
        xs: "4px",
        sm: "8px",
        md: "16px",
        lg: "24px",
        xl: "32px",
        "2xl": "48px",
        "3xl": "64px",
      },
    },
  },
  plugins: [],
};
export default config;
