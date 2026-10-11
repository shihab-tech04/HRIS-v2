import React from 'react';
import { ChevronRight } from 'lucide-react';

export interface BreadcrumbItem {
  label: string;
  onClick?: () => void;
  active?: boolean;
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  className?: string;
}

export const Breadcrumbs: React.FC<BreadcrumbsProps> = ({ items, className = '' }) => {
  return (
    <nav aria-label="Breadcrumb" className={`flex items-center gap-1.5 text-xs ${className}`}>
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        return (
          <React.Fragment key={item.label}>
            {index > 0 && (
              <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden="true" />
            )}
            {item.onClick && !isLast ? (
              <button
                type="button"
                onClick={item.onClick}
                className="min-h-8 inline-flex items-center px-1 text-slate-500 hover:text-slate-900 transition-colors whitespace-nowrap cursor-pointer"
              >
                {item.label}
              </button>
            ) : (
              <span
                className={`whitespace-nowrap ${
                  isLast || item.active ? 'font-medium text-slate-900' : 'text-slate-500'
                }`}
              >
                {item.label}
              </span>
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
};
