/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        accent: "#00d4aa",
        bgDark: "#0a0f1e",
        /* Surface Hierarchy */
        background: "#0f141b",
        surface: {
          DEFAULT: "#0f141b",
          dim: "#0f141b",
          bright: "#343941",
          "container-lowest": "#090f15",
          "container-low": "#171c23",
          container: "#1b2027",
          "container-high": "#252a32",
          "container-highest": "#30353d",
          variant: "#30353d",
          tint: "#9acbff",
        },
        /* Primary */
        primary: {
          DEFAULT: "#9acbff",
          container: "#1b6ca8",
          fixed: "#cfe5ff",
          "fixed-dim": "#9acbff",
        },
        "on-primary": {
          DEFAULT: "#003355",
          container: "#d9e9ff",
          fixed: "#001d34",
          "fixed-variant": "#004a78",
        },
        "inverse-primary": "#02629e",
        /* Secondary */
        secondary: {
          DEFAULT: "#7dd7be",
          container: "#00715c",
          fixed: "#99f4da",
          "fixed-dim": "#7dd7be",
        },
        "on-secondary": {
          DEFAULT: "#00382d",
          container: "#97f1d7",
          fixed: "#002019",
          "fixed-variant": "#005142",
        },
        /* Tertiary */
        tertiary: {
          DEFAULT: "#61de8a",
          container: "#00783d",
          fixed: "#7efba4",
          "fixed-dim": "#61de8a",
        },
        "on-tertiary": {
          DEFAULT: "#00391a",
          container: "#8fffae",
          fixed: "#00210c",
          "fixed-variant": "#005228",
        },
        /* Error */
        error: {
          DEFAULT: "#ffb4ab",
          container: "#93000a",
        },
        "on-error": {
          DEFAULT: "#690005",
          container: "#ffdad6",
        },
        /* Text */
        "on-surface": {
          DEFAULT: "#dee2ec",
          variant: "#c0c7d1",
        },
        "on-background": "#dee2ec",
        /* Outline */
        outline: {
          DEFAULT: "#8b919b",
          variant: "#414750",
        },
        /* Inverse */
        "inverse-surface": "#dee2ec",
        "inverse-on-surface": "#2c3138",
        /* Status */
        amber: "#f59e0b",
        orange: "#ff9800",
      },
      fontFamily: {
        sans: ["var(--font-dm-sans)", "DM Sans", "sans-serif"],
        display: ["var(--font-dm-sans)", "DM Sans", "sans-serif"],
      },
      fontSize: {
        "display-lg": [
          "48px",
          { lineHeight: "56px", letterSpacing: "-0.02em", fontWeight: "700" },
        ],
        "headline-lg": [
          "32px",
          { lineHeight: "40px", letterSpacing: "-0.01em", fontWeight: "600" },
        ],
        "headline-lg-mobile": [
          "28px",
          { lineHeight: "36px", fontWeight: "600" },
        ],
        "headline-md": ["24px", { lineHeight: "32px", fontWeight: "600" }],
        "headline-sm": ["20px", { lineHeight: "28px", fontWeight: "600" }],
        "body-lg": ["18px", { lineHeight: "28px", fontWeight: "400" }],
        "body-md": ["16px", { lineHeight: "24px", fontWeight: "400" }],
        "body-sm": ["14px", { lineHeight: "20px", fontWeight: "400" }],
        "label-md": [
          "12px",
          { lineHeight: "16px", letterSpacing: "0.05em", fontWeight: "500" },
        ],
        "label-sm": [
          "11px",
          { lineHeight: "14px", letterSpacing: "0.05em", fontWeight: "500" },
        ],
      },
      spacing: {
        base: "4px",
        xs: "8px",
        sm: "16px",
        md: "24px",
        lg: "32px",
        xl: "48px",
        gutter: "24px",
        "container-max": "1440px",
        "margin-mobile": "16px",
        "margin-desktop": "32px",
        sidebar: "260px",
      },
      borderRadius: {
        DEFAULT: "0.5rem",
        sm: "0.25rem",
        md: "0.5rem",
        lg: "1rem",
        xl: "1.5rem",
        full: "9999px",
      },
      maxWidth: {
        container: "1440px",
      },
      boxShadow: {
        soft: "0 4px 20px rgba(0, 0, 0, 0.4)",
        "glow-primary": "0 0 20px rgba(154, 203, 255, 0.15)",
        "glow-secondary": "0 0 20px rgba(125, 215, 190, 0.15)",
        "glow-tertiary": "0 0 20px rgba(97, 222, 138, 0.15)",
        "glow-error": "0 0 20px rgba(255, 180, 171, 0.15)",
      },
    },
  },
  plugins: [],
};
