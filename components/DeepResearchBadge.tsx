'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ResearchContextItem } from '@/lib/types';

interface DeepResearchBadgeProps {
  context: ResearchContextItem;
}

export function DeepResearchBadge({ context }: DeepResearchBadgeProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="w-full border border-amber/30 bg-amber/10 p-3.5 space-y-2 transition-none-all">
      <div 
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center justify-between cursor-pointer select-none"
      >
        <div className="flex items-center gap-2">
          <span className="flex items-center justify-center w-6 h-6 bg-amber/20 text-amber border border-amber/40">
            <span className="text-amber font-bold font-mono">[ IDEA ]</span>
          </span>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-amber">
              Context Added by Deep Research
            </span>
            <span className="px-1.5 py-0.5 bg-amber/20 text-amber text-[9px] font-black uppercase">
              Prerequisite
            </span>
          </div>
        </div>

        <button 
          type="button"
          className="text-amber hover:text-amber p-1 text-xs font-bold flex items-center gap-1"
        >
          <span className="text-[11px] hidden sm:inline">{isExpanded ? 'Hide Details' : 'Why this was added'}</span>
          {isExpanded ? <span className="text-amber font-bold font-mono">[ ^ ]</span> : <span className="text-amber font-bold font-mono">[ v ]</span>}
        </button>
      </div>

      {/* Summary preview */}
      <p className="text-xs text-amber-100/90 font-medium leading-relaxed">
        <strong className="text-amber font-bold">{context.conceptAdded}:</strong> {context.explanation}
      </p>

      {/* Expanded Socratic Breakdown */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden pt-2 border-t border-amber/20 space-y-2.5 text-xs text-solder"
          >
            <div className="p-2.5 bg-chassis/40 border border-amber/20 space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber block">
                Omission Detected in Raw Notes:
              </span>
              <p className="text-[11px] text-solder italic">
                &ldquo;{context.detectedGap}&rdquo;
              </p>
            </div>

            {context.sourceTitle && (
              <div className="flex items-center justify-between text-[10px] text-amber/80 pt-1">
                <span className="flex items-center gap-1">
                  <span className="text-amber font-bold font-mono">[ OK ]</span>
                  Grounded in: {context.sourceTitle}
                </span>
                {context.sourceUrl && (
                  <a 
                    href={context.sourceUrl} 
                    target="_blank" 
                    rel="noreferrer"
                    className="flex items-center gap-0.5 text-amber hover:underline"
                  >
                    Reference Link <span className="text-amber font-bold font-mono">[ EXT ]</span>
                  </a>
                )}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
