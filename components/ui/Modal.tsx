'use client';

import React, { ReactNode } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { BracketTag } from './BracketTag';
import { useModalA11y } from '@/hooks/useModalA11y';

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
  // Esc, scroll lock and focus all come from the one hook every other sheet in
  // the app uses, so this primitive cannot drift from them.
  const sheetRef = useModalA11y(isOpen, onClose);

  const maxWidthStyles: Record<string, string> = {
    sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-lg', xl: 'max-w-xl',
    '2xl': 'max-w-2xl', '3xl': 'max-w-3xl', '4xl': 'max-w-4xl', full: 'max-w-5xl',
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-chassis/90 overflow-y-auto">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-inset/80" onClick={onClose} />
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 24 }}
          transition={{ duration: 0.18 }}
          ref={sheetRef}
          tabIndex={-1}
          className={`leaf-edge sheet-plate relative z-10 w-full ${maxWidthStyles[maxWidth]} bg-deck border border-edge/70 rounded-2xl shadow-raised overflow-hidden mobile-sheet-viewport flex flex-col sm:my-8`}
          onClick={e => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
        >
          {(title || icon) && (
            <div className="sheet-head px-5 py-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                {icon && <div className="shrink-0 text-amber">{icon}</div>}
                <div className="min-w-0">
                  {title && <h3 className="font-display text-[17px] leading-tight text-bone truncate">{title}</h3>}
                  {description && <p className="text-[11px] text-solder truncate mt-0.5">{description}</p>}
                </div>
              </div>
              {showCloseButton && onClose && (
                <button
                  type="button"
                  onClick={onClose}
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full text-solder hover:text-bone hover:bg-bone/[0.06] cursor-pointer font-mono text-xs transition-colors duration-150"
                  aria-label="Close modal"
                >
                  {/* Phone: the close brackets frame the X vertically. */}
                  <BracketTag label="X" tone="" />
                </button>
              )}
            </div>
          )}
          <div className="p-5 overflow-y-auto max-h-[calc(88vh-130px)] max-h-[calc(88dvh-130px)] overscroll-contain [-webkit-overflow-scrolling:touch]">{children}</div>
          {footer && <div className="sheet-head px-5 py-3 border-t border-edge/50 flex items-center justify-end gap-2 flex-wrap mobile-safe-bottom">{footer}</div>}
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
