/**
 * Synesis HRIS 360° — Design System Tokens
 * Grounded in Figma Specification (Frame XEXLe9J1oATlITS9I5u1P9) & SaaS Constitution
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
      sidebar: '#0F172A',
      sidebarSubtle: '#1E293B',
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
    // 10% Accent Budget
    brand: {
      50: '#EFF6FF',
      100: '#DBEAFE',
      500: '#3B82F6',
      600: '#2563EB',
      700: '#1D4ED8',
      900: '#1E3A8A',
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
    fontSans: "'Plus Jakarta Sans', -apple-system, sans-serif",
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
    sidebarWidth: '260px',
    topBarHeight: '64px',
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
