/**
 * Synesis HRIS 360° — Design System Tokens
 * Grounded in Established Figma Design Direction:
 * Typography: Poppins
 * Primary Brand Hue: #085587 (Deep Corporate Sapphire/Ocean)
 * Source Reference: Figma Frame XEXLe9J1oATlITS9I5u1P9 (Web view referenced; headless API unconfigured)
 */

export const designTokens = {
  colors: {
    // 60% Dominant Neutral Canvas
    canvas: {
      default: '#F8FAFC',
      subtle: '#F1F5F9',
      white: '#FFFFFF',
    },
    // 30% Structural Surfaces & Typography
    surface: {
      card: '#FFFFFF',
      hover: '#F8FAFC',
      active: '#F1F5F9',
      sidebar: '#083B5C', // Deep ocean navy harmonized with #085587
      sidebarSubtle: '#05263D',
      border: '#E2E8F0',
      borderSubtle: '#F1F5F9',
      borderStrong: '#CBD5E1',
    },
    text: {
      primary: '#0F172A',
      secondary: '#475569',
      muted: '#64748B',
      subtle: '#94A3B8',
      inverse: '#FFFFFF',
      inverseMuted: '#94A3B8',
    },
    // 10% Accent Budget — Grounded in Established #085587
    brand: {
      50: '#F0F7FB',
      100: '#E0EFF7',
      200: '#BAE0F0',
      300: '#82C5E3',
      400: '#44A5D3',
      500: '#1E8AC2',
      600: '#0E6EA6',
      700: '#085587', // Primary Brand Color
      800: '#074770',
      900: '#083B5C',
      950: '#05263D',
      primary: '#085587',
      hover: '#074770',
      light: '#F0F7FB',
    },
    // Semantic States (strictly paired with visible text, never color alone)
    semantic: {
      active: {
        text: '#166534',
        border: '#BBF7D0',
        bg: '#F0FDF4',
        solid: '#16A34A',
      },
      warning: {
        text: '#9A3412',
        border: '#FED7AA',
        bg: '#FFF7ED',
        solid: '#D97706',
      },
      critical: {
        text: '#991B1B',
        border: '#FECACA',
        bg: '#FEF2F2',
        solid: '#DC2626',
      },
      neutral: {
        text: '#475569',
        border: '#E2E8F0',
        bg: '#F8FAFC',
        solid: '#64748B',
      },
    },
  },
  typography: {
    fontSans: "'Poppins', -apple-system, BlinkMacSystemFont, sans-serif",
    fontMono: "'JetBrains Mono', monospace",
    scale: {
      display: 'text-2xl font-bold tracking-tight',
      headline: 'text-xl font-semibold tracking-tight',
      subhead: 'text-lg font-semibold',
      body: 'text-sm font-normal text-slate-700',
      bodyMedium: 'text-sm font-medium text-slate-800',
      caption: 'text-xs text-slate-500',
      code: 'font-mono text-xs tabular-nums',
    },
  },
  spacing: {
    sidebarWidth: '256px',
    sidebarCompactWidth: '111px',
    topBarHeight: '72px',
    containerPadding: 'p-6 lg:p-8',
    gapSection: 'gap-6',
  },
  radii: {
    sm: 'rounded-md', // 6px
    md: 'rounded-lg', // 8px
    lg: 'rounded-xl', // 12px
  },
  borders: {
    hairline: 'border border-slate-200',
    hairlineSubtle: 'border border-slate-100',
  },
} as const;
