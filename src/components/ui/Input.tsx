import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  helperText?: string;
  error?: string;
  icon?: React.ReactNode;
}

export const Input: React.FC<InputProps> = ({
  label,
  helperText,
  error,
  icon,
  className = '',
  id,
  ...props
}) => {
  const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

  return (
    <div className="flex flex-col gap-1 w-full">
      {label && (
        <label htmlFor={inputId} className="text-xs font-medium text-slate-700">
          {label}
        </label>
      )}
      <div className="relative flex items-center">
        {icon && (
          <span className="absolute left-3 text-slate-400 pointer-events-none shrink-0">
            {icon}
          </span>
        )}
        <input
          id={inputId}
          className={`w-full text-xs text-slate-900 bg-white border rounded-md py-2 px-3 transition-colors placeholder:text-slate-400 focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 disabled:bg-slate-50 disabled:text-slate-400 ${
            icon ? 'pl-9' : ''
          } ${
            error ? 'border-red-500 focus:border-red-600 focus:ring-red-600' : 'border-slate-300'
          } ${className}`}
          {...props}
        />
      </div>
      {error ? (
        <span className="text-[11px] text-red-600 font-medium">{error}</span>
      ) : helperText ? (
        <span className="text-[11px] text-slate-500">{helperText}</span>
      ) : null}
    </div>
  );
};
