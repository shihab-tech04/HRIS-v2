import React from 'react';

interface BadgeProps {
  status?: 'active' | 'warning' | 'critical' | 'neutral' | 'info';
  children: React.ReactNode;
  showDot?: boolean;
  className?: string;
}

/**
 * Anti-Slop Compliant Status Indicator
 * Adheres strictly to Zero-Pill discipline: Clean unboxed typography with semantic text color
 * and clear contrast, never garish candy capsules.
 */
export const Badge: React.FC<BadgeProps> = ({
  status = 'neutral',
  children,
  showDot = true,
  className = '',
}) => {
  const dotColor = {
    active: 'bg-emerald-600',
    warning: 'bg-amber-600',
    critical: 'bg-red-600',
    neutral: 'bg-slate-400',
    info: 'bg-blue-600',
  }[status];

  const textColor = {
    active: 'text-emerald-800 font-medium',
    warning: 'text-amber-800 font-medium',
    critical: 'text-red-800 font-medium',
    neutral: 'text-slate-600',
    info: 'text-blue-800 font-medium',
  }[status];

  return (
    <span className={`inline-flex items-center gap-1.5 text-xs whitespace-nowrap ${textColor} ${className}`}>
      {showDot && (
        <span
          className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColor}`}
          aria-hidden="true"
        />
      )}
      <span>{children}</span>
    </span>
  );
};
