export const theme = {
  app: {
    name: "Sistema Estrela de Olorum",
    version: "1.0.0",
  },

  colors: {
    primary: "#0F2D52",
    primaryHover: "#153C6A",

    secondary: "#D4AF37",
    secondaryHover: "#BE9A2F",

    background: "#F5F7FA",
    surface: "#FFFFFF",

    text: "#1E293B",
    textSecondary: "#64748B",

    border: "#E2E8F0",

    success: "#22C55E",
    warning: "#F59E0B",
    danger: "#EF4444",
    info: "#3B82F6",
  },

  radius: {
    xs: "6px",
    sm: "8px",
    md: "12px",
    lg: "18px",
    xl: "24px",
    full: "9999px",
  },

  shadow: {
    sm: "0 2px 8px rgba(15,23,42,.05)",
    md: "0 8px 24px rgba(15,23,42,.08)",
    lg: "0 18px 48px rgba(15,23,42,.12)",
  },

  sidebar: {
    width: "280px",
    collapsedWidth: "88px",
  },

  topbar: {
    height: "72px",
  },

  transition: {
    fast: "150ms",
    normal: "250ms",
    slow: "400ms",
  },
} as const;

export type Theme = typeof theme;