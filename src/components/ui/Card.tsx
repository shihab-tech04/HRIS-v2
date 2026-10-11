import React from 'react';

interface CardProps {
  title?: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  noPadding?: boolean;
}

export const Card: React.FC<CardProps> = ({
  title,
  subtitle,
  action,
  children,
  className = '',
  noPadding = false,
}) => {
  return (
    <div className={`min-w-0 bg-white border border-slate-200 rounded-lg shadow-2xs overflow-hidden ${className}`}>
      {(title || subtitle || action) && (
        <div className="flex flex-wrap sm:flex-nowrap items-center justify-between px-4 sm:px-5 py-4 border-b border-slate-100 gap-3 sm:gap-4">
          <div className="min-w-0 flex-1">
            {title && <h3 className="text-sm font-semibold text-slate-900">{title}</h3>}
            {subtitle && <p className="text-xs text-slate-500 mt-0.5 break-words">{subtitle}</p>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      <div className={noPadding ? 'min-w-0' : 'min-w-0 p-4 sm:p-5'}>
        {children}
      </div>
    </div>
  );
};
