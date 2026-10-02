/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}", "../shared-ui/src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        sidebar: "var(--sidebar)",
        bg: "var(--bg)",
        ink: "var(--ink)",
        muted: "var(--muted)",
        gold: "var(--gold)",
        teal: "var(--teal)",
        navy: "var(--navy)",
      },
      fontFamily: {
        sans: ["Plus Jakarta Sans", "system-ui", "sans-serif"],
        mono: ["IBM Plex Mono", "ui-monospace", "SF Mono", "Menlo", "Consolas", "monospace"],
      },
      width: {
        sidebar: "248px",
      },
      borderRadius: {
        portal: "14px",
      },
    },
  },
  plugins: [],
  corePlugins: {
    preflight: false,
  },
};
