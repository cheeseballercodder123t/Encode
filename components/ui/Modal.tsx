'use client';

import React, { useEffect, ReactNode } from 'react';
import { motion, AnimatePresence } from 'motion/react';

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

export function Modal({ isOpen, onClose, title, description, icon, children, footer, maxWidth = 'md', showCloseButton = true }: ModalProps) {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape' && onClose) onClose(); };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const maxWidthStyles: Record<string, string> = {
    sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-lg', xl: 'max-w-xl',
    '2xl': 'max-w-2xl', '3xl': 'max-w-3xl', '4xl': 'max-w-4xl', full: 'max-w-5xl',
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-chassis/90 overflow-y-auto">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0" onClick={onClose} />
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition-none={{ duration: 0.1 }}
          className={`relative z-10 w-full ${maxWidthStyles[maxWidth]} bg-deck border border-steel rounded-none overflow-hidden my-8`}
          onClick={e => e.stopPropagation()}
        >
          {(title || icon) && (
            <div className="p-4 border-b border-steel bg-chassis flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                {icon && <div className="shrink-0 text-amber">{icon}</div>}
                <div className="min-w-0">
                  {title && <h3 className="font-bold text-bone text-sm uppercase tracking-wider font-mono truncate">{title}</h3>}
                  {description && <p className="text-[10px] text-solder font-mono truncate mt-0.5">{description}</p>}
                </div>
              </div>
              {showCloseButton && onClose && (
                <button type="button" onClick={onClose} className="p-1 text-solder hover:text-bone hover:bg-deck rounded-none cursor-pointer font-mono text-xs" aria-label="Close modal">
                  [ X ]
                </button>
              )}
            </div>
          )}
          <div className="p-4 overflow-y-auto max-h-[calc(85vh-130px)]">{children}</div>
          {footer && <div className="p-3 border-t border-steel bg-chassis flex items-center justify-end gap-2">{footer}</div>}
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
