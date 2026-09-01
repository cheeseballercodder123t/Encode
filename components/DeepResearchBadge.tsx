'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Lightbulb, Sparkles, ExternalLink, ChevronDown, ChevronUp, ShieldCheck } from 'lucide-react';
import { ResearchContextItem } from '@/lib/types';

interface DeepResearchBadgeProps {
  context: ResearchContextItem;
}

export function DeepResearchBadge({ context }: DeepResearchBadgeProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="w-full rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 space-y-2 transition-all">
      <div 
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center justify-between cursor-pointer select-none"
      >
        <div className="flex items-center gap-2">
          <span className="flex items-center justify-center w-6 h-6 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/40">
            <Lightbulb className="w-3.5 h-3.5 fill-amber-300" />
          </span>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-amber-300">
              Context Added by Deep Research
            </span>
            <span className="px-1.5 py-0.2 bg-amber-400/20 text-amber-200 text-[9px] font-black rounded uppercase">
              Prerequisite
            </span>
          </div>
        </div>

        <button 
          type="button"
          className="text-amber-400 hover:text-amber-200 p-1 rounded-lg text-xs font-bold flex items-center gap-1"
        >
          <span className="text-[11px] hidden sm:inline">{isExpanded ? 'Hide Details' : 'Why this was added'}</span>
          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {/* Summary preview */}
      <p className="text-xs text-amber-100/90 font-medium leading-relaxed">
        <strong className="text-amber-300 font-bold">{context.conceptAdded}:</strong> {context.explanation}
      </p>

      {/* Expanded Socratic Breakdown */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden pt-2 border-t border-amber-500/20 space-y-2.5 text-xs text-slate-300"
          >
            <div className="p-2.5 bg-black/40 rounded-lg border border-amber-500/20 space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 block">
                Omission Detected in Raw Notes:
              </span>
              <p className="text-[11px] text-slate-300 italic">
                &ldquo;{context.detectedGap}&rdquo;
              </p>
            </div>

            {context.sourceTitle && (
              <div className="flex items-center justify-between text-[10px] text-amber-300/80 pt-1">
                <span className="flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
                  Grounded in: {context.sourceTitle}
                </span>
                {context.sourceUrl && (
                  <a 
                    href={context.sourceUrl} 
                    target="_blank" 
                    rel="noreferrer"
                    className="flex items-center gap-0.5 text-amber-300 hover:underline"
                  >
                    Reference Link <ExternalLink className="w-3 h-3 ml-0.5" />
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
