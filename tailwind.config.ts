import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        surface: "var(--surface-1)",
        plane: "var(--page-plane)",
        ink: {
          primary: "var(--text-primary)",
          secondary: "var(--text-secondary)",
          muted: "var(--text-muted)",
        },
        gridline: "var(--gridline)",
        baseline: "var(--baseline)",
        series: {
          1: "var(--series-1)",
          2: "var(--series-2)",
          3: "var(--series-3)",
          4: "var(--series-4)",
          5: "var(--series-5)",
          6: "var(--series-6)",
          7: "var(--series-7)",
          8: "var(--series-8)",
        },
        status: {
          good: "var(--status-good)",
          "good-bg": "var(--status-good-bg)",
          warning: "var(--status-warning)",
          "warning-bg": "var(--status-warning-bg)",
          serious: "var(--status-serious)",
          "serious-bg": "var(--status-serious-bg)",
          critical: "var(--status-critical)",
          "critical-bg": "var(--status-critical-bg)",
          neutral: "var(--status-neutral)",
          "neutral-bg": "var(--status-neutral-bg)",
        },
      },
      boxShadow: {
        card: "0 1px 2px rgba(11,11,11,0.04), 0 1px 1px rgba(11,11,11,0.03)",
      },
    },
  },
  plugins: [],
};

export default config;
