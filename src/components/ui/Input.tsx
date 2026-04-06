import React, { forwardRef } from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  helperText?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(({
  className = '',
  label,
  error,
  leftIcon,
  rightIcon,
  helperText,
  id,
  disabled,
  ...props
}, ref) => {
  const inputId = id || `input-${Math.random().toString(36).substr(2, 9)}`;

  return (
    <div className="flex flex-col gap-1.5 w-full">
      {label && (
        <label htmlFor={inputId} className="text-sm font-bold text-slate-700 dark:text-zinc-300">
          {label}
        </label>
      )}
      <div className="relative flex items-center">
        {leftIcon && (
          <div className="absolute left-3.5 flex items-center justify-center text-zinc-400">
            {leftIcon}
          </div>
        )}
        <input
          ref={ref}
          id={inputId}
          disabled={disabled}
          className={`flex-1 w-full bg-zinc-50 dark:bg-zinc-800/50 border 
            ${error ? 'border-rose-300 dark:border-rose-500/30 ring-rose-500' : 'border-zinc-200 dark:border-zinc-700 ring-blue-500'} 
            text-slate-900 dark:text-white text-sm rounded-xl px-4 py-2.5 transition-all outline-none
            focus:ring-2 focus:border-transparent
            disabled:opacity-60 disabled:cursor-not-allowed
            placeholder:text-zinc-400 font-medium
            ${leftIcon ? 'pl-10' : ''} 
            ${rightIcon ? 'pr-10' : ''} 
            ${className}`}
          {...props}
        />
        {rightIcon && (
          <div className="absolute right-3.5 flex items-center justify-center text-zinc-400">
            {rightIcon}
          </div>
        )}
      </div>
      {error && <p className="text-xs font-bold text-rose-500 mt-0.5">{error}</p>}
      {helperText && !error && <p className="text-xs font-medium text-zinc-500 mt-0.5">{helperText}</p>}
    </div>
  );
});

Input.displayName = 'Input';
