'use client';

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
  isShaking?: boolean;
}

export function Modal({ isOpen, onClose, title, description, icon, children, footer, maxWidth = 'md', showCloseButton = true, isShaking = false }: ModalProps) {
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
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md overflow-y-auto">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0" onClick={onClose} />
        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0, x: isShaking ? [0, -8, 8, -6, 6, 0] : 0 }}
          exit={{ opacity: 0, scale: 0.94, y: 16 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className={`relative z-10 w-full ${maxWidthStyles[maxWidth]} bg-[#0F111A] border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden my-8`}
          onClick={e => e.stopPropagation()}
        >
          {(title || icon) && (
            <div className="p-5 border-b border-slate-800 bg-[#131622] flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                {icon && <div className="shrink-0">{icon}</div>}
                <div className="min-w-0">
                  {title && <h3 className="font-bold text-white text-base truncate">{title}</h3>}
                  {description && <p className="text-xs text-slate-400 truncate mt-0.5">{description}</p>}
                </div>
              </div>
              {showCloseButton && onClose && (
                <button type="button" onClick={onClose} className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer" aria-label="Close modal">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          )}
          <div className="p-5 overflow-y-auto max-h-[calc(85vh-130px)]">{children}</div>
          {footer && <div className="p-4 border-t border-slate-800 bg-[#131622]/50 flex items-center justify-end gap-3">{footer}</div>}
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
