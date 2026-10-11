import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'subtle' | 'outline' | 'destructive' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  icon?: React.ReactNode;
  children: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  icon,
  children,
  className = '',
  disabled,
  ...props
}) => {
  const baseClasses = 'inline-flex items-center justify-center font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#085587] disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap shrink-0 cursor-pointer select-none';
  
  const sizeClasses = {
    sm: 'text-xs px-2.5 py-1.5 gap-1.5 rounded-md min-h-[32px]',
    md: 'text-xs px-3.5 py-2 gap-2 rounded-md min-h-[38px]',
    lg: 'text-sm px-4 py-2.5 gap-2 rounded-lg min-h-[44px]',
  }[size];

  const variantClasses = {
    primary: 'bg-[#085587] text-white hover:bg-[#074770] shadow-xs active:bg-[#083B5C]',
    secondary: 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 hover:text-slate-900 active:bg-slate-100 shadow-2xs',
    subtle: 'bg-[#F0F7FB] text-[#085587] hover:bg-[#E0EFF7] active:bg-[#BAE0F0]',
    outline: 'border border-slate-300 text-slate-700 hover:bg-slate-50 active:bg-slate-100',
    destructive: 'bg-red-600 text-white hover:bg-red-700 active:bg-red-800 shadow-xs',
    ghost: 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80 active:bg-slate-200/80',
  }[variant];

  return (
    <button
      className={`${baseClasses} ${sizeClasses} ${variantClasses} ${className}`}
      disabled={disabled}
      {...props}
    >
      {icon && <span className="shrink-0">{icon}</span>}
      <span>{children}</span>
    </button>
  );
};
