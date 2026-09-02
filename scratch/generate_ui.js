const fs = require(fs);
const path = require(path);

const uiDir = path.join(__dirname, .., components, ui);
if (!fs.existsSync(uiDir)) fs.mkdirSync(uiDir, { recursive: true });

// 1. Button.tsx
fs.writeFileSync(path.join(uiDir, Button.tsx), 'use client';

import React, { forwardRef, ButtonHTMLAttributes, ReactNode } from 'react';
import { Loader2 } from 'lucide-react';

export type ButtonVariant = 'primary' | 'secondary' | 'emerald' | 'danger' | 'outline' | 'ghost' | 'violet';
export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      children,
      className = '',
      variant = 'primary',
      size = 'md',
      isLoading = false,
      disabled = false,
      leftIcon,
      rightIcon,
      type = 'button',
      ...props
    },
    ref
  ) => {
    const baseStyles =
      'inline-flex items-center justify-center font-bold transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[#07080D] disabled:opacity-40 disabled:cursor-not-allowed select-none cursor-pointer rounded-xl active:scale-[0.98]';

    const sizeStyles: Record<ButtonSize, string> = {
      xs: 'px-2.5 py-1 text-xs gap-1.5 rounded-lg',
      sm: 'px-3.5 py-1.5 text-xs gap-2',
      md: 'px-4 py-2.5 text-sm gap-2',
      lg: 'px-6 py-3 text-base gap-2.5',
    };

    const variantStyles: Record<ButtonVariant, string> = {
      primary:
        'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/20 focus:ring-indigo-500 border border-indigo-500/30',
      secondary:
        'bg-slate-800/80 hover:bg-slate-700 text-slate-200 border border-slate-700/60 focus:ring-slate-500',
      emerald:
        'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/20 focus:ring-emerald-500 border border-emerald-500/30',
      danger:
        'bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-600/20 focus:ring-rose-500 border border-rose-500/30',
      violet:
        'bg-violet-600 hover:bg-violet-500 text-white shadow-lg shadow-violet-600/20 focus:ring-violet-500 border border-violet-500/30',
      outline:
        'bg-transparent hover:bg-slate-800/60 text-slate-300 border border-slate-700 focus:ring-indigo-500',
      ghost:
        'bg-transparent hover:bg-slate-800/40 text-slate-400 hover:text-slate-200 focus:ring-slate-500',
    };

    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled || isLoading}
        className={${baseStyles}   }
        {...props}
      >
        {isLoading ? (
          <Loader2 className=w-4 h-4 animate-spin shrink-0 />
        ) : (
          leftIcon && <span className=shrink-0>{leftIcon}</span>
        )}
        {children && <span>{children}</span>}
        {!isLoading && rightIcon && <span className=shrink-0>{rightIcon}</span>}
      </button>
    );
  }
);

Button.displayName = 'Button';
, utf8);

// 2. Badge.tsx
fs.writeFileSync(path.join(uiDir, Badge.tsx), 'use client';

import React, { ReactNode } from 'react';

export type BadgeVariant = 'indigo' | 'emerald' | 'amber' | 'violet' | 'rose' | 'slate' | 'cyan';
export type BadgeSize = 'xs' | 'sm' | 'md';

export interface BadgeProps {
  children: ReactNode;
  variant?: BadgeVariant;
  size?: BadgeSize;
  dot?: boolean;
  icon?: ReactNode;
  className?: string;
}

export function Badge({
  children,
  variant = 'indigo',
  size = 'sm',
  dot = false,
  icon,
  className = '',
}: BadgeProps) {
  const sizeStyles: Record<BadgeSize, string> = {
    xs: 'px-1.5 py-0.5 text-[10px] gap-1',
    sm: 'px-2.5 py-0.5 text-xs gap-1.5',
    md: 'px-3 py-1 text-xs gap-2',
  };

  const variantStyles: Record<BadgeVariant, { container: string; dot: string }> = {
    indigo: {
      container: 'bg-indigo-500/10 text-indigo-300 border-indigo-500/30',
      dot: 'bg-indigo-400 shadow-indigo-400/50',
    },
    emerald: {
      container: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
      dot: 'bg-emerald-400 shadow-emerald-400/50',
    },
    amber: {
      container: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
      dot: 'bg-amber-400 shadow-amber-400/50',
    },
    violet: {
      container: 'bg-violet-500/10 text-violet-300 border-violet-500/30',
      dot: 'bg-violet-400 shadow-violet-400/50',
    },
    rose: {
      container: 'bg-rose-500/10 text-rose-300 border-rose-500/30',
      dot: 'bg-rose-400 shadow-rose-400/50',
    },
    slate: {
      container: 'bg-slate-800/60 text-slate-300 border-slate-700/60',
      dot: 'bg-slate-400 shadow-slate-400/50',
    },
    cyan: {
      container: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30',
      dot: 'bg-cyan-400 shadow-cyan-400/50',
    },
  };

  return (
    <span
      className={inline-flex items-center font-semibold border rounded-full   }
    >
      {dot && <span className={w-1.5 h-1.5 rounded-full shadow-sm } />}
      {icon && <span className=shrink-0>{icon}</span>}
      <span>{children}</span>
    </span>
  );
}
, utf8);

// 3. Card.tsx
fs.writeFileSync(path.join(uiDir, Card.tsx), 'use client';

import React, { HTMLAttributes, forwardRef, ReactNode } from 'react';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  glass?: boolean;
  hoverEffect?: boolean;
}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ children, className = '', glass = true, hoverEffect = false, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={ounded-2xl border border-slate-800   }
        {...props}
      >
        {children}
      </div>
    );
  }
);
Card.displayName = 'Card';

export function CardHeader({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={p-5 border-b border-slate-800/80 bg-[#131622]/60 rounded-t-2xl }>
      {children}
    </div>
  );
}

export function CardTitle({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return <h3 className={	ext-base font-bold text-white tracking-tight }>{children}</h3>;
}

export function CardDescription({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return <p className={	ext-xs text-slate-400 mt-0.5 leading-relaxed }>{children}</p>;
}

export function CardContent({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={p-5 }>{children}</div>;
}

export function CardFooter({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={p-4 border-t border-slate-800/80 bg-[#131622]/40 rounded-b-2xl flex items-center justify-end gap-3 }>
      {children}
    </div>
  );
}
, utf8);

// 4. Modal.tsx
fs.writeFileSync(path.join(uiDir, Modal.tsx), 'use client';

import React, { useEffect, ReactNode } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X } from 'lucide-react';

export interface ModalProps {
  isOpen: boolean;
  onClose?: () => void;
  title?: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | 'full';
  showCloseButton?: boolean;
}

export function Modal({
  isOpen,
  onClose,
  title,
  description,
  icon,
  children,
  footer,
  maxWidth = 'md',
  showCloseButton = true,
}: ModalProps) {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && onClose) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const maxWidthStyles = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl',
    '3xl': 'max-w-3xl',
    '4xl': 'max-w-4xl',
    full: 'max-w-5xl',
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className=fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md overflow-y-auto>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className=fixed inset-0
          onClick={onClose}
        />

        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.94, y: 16 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className={elative z-10 w-full  bg-[#0F111A] border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden my-8}
          onClick={e => e.stopPropagation()}
        >
          {(title || icon) && (
            <div className=p-5 border-b border-slate-800 bg-[#131622] flex items-center justify-between gap-3>
              <div className=flex items-center gap-3 min-w-0>
                {icon && <div className=shrink-0>{icon}</div>}
                <div className=min-w-0>
                  {title && (
                    <h3 className=font-bold text-white text-base truncate>{title}</h3>
                  )}
                  {description && (
                    <p className=text-xs text-slate-400 truncate mt-0.5>{description}</p>
                  )}
                </div>
              </div>
              {showCloseButton && onClose && (
                <button
                  type=button
                  onClick={onClose}
                  className=p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer
                  aria-label=Close modal
                >
                  <X className=w-4 h-4 />
                </button>
              )}
            </div>
          )}

          <div className=p-5 overflow-y-auto max-h-[calc(85vh-130px)]>{children}</div>

          {footer && (
            <div className=p-4 border-t border-slate-800 bg-[#131622]/50 flex items-center justify-end gap-3>
              {footer}
            </div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
, utf8);

// 5. Input.tsx
fs.writeFileSync(path.join(uiDir, Input.tsx), 'use client';

import React, { forwardRef, InputHTMLAttributes, ReactNode } from 'react';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, helperText, leftIcon, rightIcon, className = '', ...props }, ref) => {
    return (
      <div className=space-y-1.5 w-full>
        {label && (
          <label className=block text-xs font-semibold text-slate-300 uppercase tracking-wider>
            {label}
          </label>
        )}
        <div className=relative flex items-center>
          {leftIcon && (
            <div className=absolute left-3 text-slate-400 pointer-events-none shrink-0>
              {leftIcon}
            </div>
          )}
          <input
            ref={ref}
            className={w-full bg-slate-900/80 border text-sm text-slate-100 placeholder-slate-500 rounded-xl px-3.5 py-2.5 transition-all focus:outline-none focus:ring-2 disabled:opacity-50 disabled:cursor-not-allowed    }
            {...props}
          />
          {rightIcon && (
            <div className=absolute right-3 text-slate-400 pointer-events-none shrink-0>
              {rightIcon}
            </div>
          )}
        </div>
        {error && <p className=text-xs text-rose-400 font-medium>{error}</p>}
        {!error && helperText && <p className=text-xs text-slate-400>{helperText}</p>}
      </div>
    );
  }
);
Input.displayName = 'Input';
, utf8);

// 6. Textarea.tsx
fs.writeFileSync(path.join(uiDir, Textarea.tsx), 'use client';

import React, { forwardRef, TextareaHTMLAttributes } from 'react';

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  helperText?: string;
  wordLimit?: number;
  currentWordCount?: number;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  (
    {
      label,
      error,
      helperText,
      wordLimit,
      currentWordCount,
      className = '',
      rows = 3,
      ...props
    },
    ref
  ) => {
    const isOverLimit = wordLimit && currentWordCount != null && currentWordCount > wordLimit;

    return (
      <div className=space-y-1.5 w-full>
        {label && (
          <label className=block text-xs font-semibold text-slate-300 uppercase tracking-wider>
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          rows={rows}
          className={w-full bg-slate-900/80 border text-sm text-slate-100 placeholder-slate-500 rounded-xl p-3.5 transition-all focus:outline-none focus:ring-2 resize-none disabled:opacity-50 disabled:cursor-not-allowed  }
          {...props}
        />
        <div className=flex items-center justify-between text-xs>
          {error ? (
            <p className=text-rose-400 font-medium>{error}</p>
          ) : helperText ? (
            <p className=text-slate-400>{helperText}</p>
          ) : (
            <span />
          )}
          {wordLimit != null && currentWordCount != null && (
            <span
              className={ont-mono text-[11px] }
            >
              {currentWordCount}/{wordLimit} words
            </span>
          )}
        </div>
      </div>
    );
  }
);
Textarea.displayName = 'Textarea';
, utf8);

// 7. Slider.tsx
fs.writeFileSync(path.join(uiDir, Slider.tsx), 'use client';

import React from 'react';

export interface SliderProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label?: string;
  unit?: string;
  className?: string;
}

export function Slider({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  label,
  unit = '%',
  className = '',
}: SliderProps) {
  const percentage = ((value - min) / (max - min)) * 100;

  return (
    <div className={space-y-2 w-full }>
      {label && (
        <div className=flex items-center justify-between text-xs>
          <span className=font-semibold text-slate-300 uppercase tracking-wider text-[11px]>
            {label}
          </span>
          <span className=font-mono font-bold text-amber-300>
            {value}
            {unit}
          </span>
        </div>
      )}
      <div className=relative flex items-center h-5>
        <input
          type=range
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={e => onChange(Number(e.target.value))}
          className=w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-400/40
          style={{
            background: linear-gradient(to right, #f59e0b 0%, #f59e0b %, #1e293b %, #1e293b 100%),
          }}
        />
      </div>
    </div>
  );
}
, utf8);

// 8. Tooltip.tsx
fs.writeFileSync(path.join(uiDir, Tooltip.tsx), 'use client';

import React, { useState, ReactNode } from 'react';
import { motion, AnimatePresence } from 'motion/react';

export interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  position?: 'top' | 'bottom' | 'left' | 'right';
  className?: string;
}

export function Tooltip({
  content,
  children,
  position = 'top',
  className = '',
}: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false);

  const positionStyles = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
  };

  return (
    <div
      className={elative inline-flex }
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
      onFocus={() => setIsVisible(true)}
      onBlur={() => setIsVisible(false)}
    >
      {children}
      <AnimatePresence>
        {isVisible && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className={bsolute z-50 pointer-events-none px-3 py-1.5 text-xs text-slate-200 bg-slate-900 border border-slate-700/80 rounded-xl shadow-xl whitespace-nowrap }
          >
            {content}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
, utf8);

// 9. index.ts
fs.writeFileSync(path.join(uiDir, index.ts), export * from './Button';
export * from './Badge';
export * from './Card';
export * from './Modal';
export * from './Input';
export * from './Textarea';
export * from './Slider';
export * from './Tooltip';
, utf8);

console.log(All UI primitives generated successfully!);
