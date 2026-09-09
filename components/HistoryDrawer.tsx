'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { SavedSchema } from '@/lib/types';
import { sound } from '@/lib/audio';
import { useAuth } from '@/lib/auth-context';

interface HistoryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  schemas: SavedSchema[];
  onSelectSchemaToResume: (schema: SavedSchema) => void;
  onStartDrill: (schema: SavedSchema) => void;
  onDeleteSchema: (id: string) => void;
  onClearAll: () => void;
  onOpenAuth: () => void;
  onShareSchema?: (schema: SavedSchema) => void;
}

export function HistoryDrawer({
  isOpen,
  onClose,
  schemas,
  onSelectSchemaToResume,
  onStartDrill,
  onDeleteSchema,
  onClearAll,
  onOpenAuth,
  onShareSchema
}: HistoryDrawerProps) {
  const { user, cloudSchemas } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'conceptual' | 'memorization'>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  if (!isOpen) return null;

  // Merge cloud schemas and local schemas by id
  const displaySchemas = user && cloudSchemas.length > 0 ? cloudSchemas : schemas;

  const filteredSchemas = displaySchemas.filter(s => {
    const matchesSearch = s.topicSummary.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesMode = filterMode === 'all' || s.mode === filterMode;
    return matchesSearch && matchesMode;
  });

  const handleCopyRemNote = (s: SavedSchema) => {
    let content = `# ${s.topicSummary}\n\n`;
    s.activities.forEach(act => {
      const resp = s.userResponses[act.id] || { field1: '', field2: '', field3: '' };
      content += `${act.title} :: ${resp.field1}\n`;
      content += `  - Elaborative Mechanism ;; ${resp.field2}\n`;
      if (resp.field3) content += `  - Connection Anchor ;; ${resp.field3}\n`;
    });
    navigator.clipboard.writeText(content);
    setCopiedId(s.id);
    sound.playBeep(880, 'sine', 0.1);
    setTimeout(() => setCopiedId(null), 1800);
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex justify-end bg-chassis/70 ">
        <motion.div
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition-none={{ type: 'spring', damping: 25, stiffness: 220 }}
          className="w-full max-w-md bg-chassis border-l border-steel h-full flex flex-col "
        >
          {/* Header */}
          <div className="p-5 border-b border-steel bg-deck flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-steel/10 border border-steel/30 text-bone ">
                <span className="text-amber font-bold font-mono">[ HIST ]</span>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-bone text-base">Saved Schemas</h3>
                  {user ? (
                    <span className="px-2 py-0.5 bg-amber/10 border border-amber/30 text-amber text-[9px] font-bold flex items-center gap-1">
                      <span className="text-amber font-bold font-mono">[ CLOUD ]</span>
                      Cloud Synced
                    </span>
                  ) : (
                    <button 
                      onClick={onOpenAuth}
                      className="px-2 py-0.5 bg-steel/10 hover:bg-steel/20 border border-steel/30 text-bone text-[9px] font-bold flex items-center gap-1 transition-none-all"
                    >
                      <span className="text-amber font-bold font-mono">[ CLOUD ]</span>
                      Enable Cloud
                    </button>
                  )}
                </div>
                <p className="text-xs text-solder">{displaySchemas.length} encoded topics recorded</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-solder hover:text-bone hover:bg-steel transition-none-colors"
            >
              <span className="text-amber font-bold font-mono">[ X ]</span>
            </button>
          </div>

          {/* Search & Filter Bar */}
          <div className="p-4 border-b border-steel/80 bg-[#0B0D14] space-y-3">
            <div className="relative">
              <span className="text-amber font-bold font-mono">[ SEARCH ]</span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search topics by title..."
                className="w-full pl-9 pr-3 py-2 bg-deck border border-steel text-xs text-bone placeholder:text-bone outline-none focus:border-steel"
              />
            </div>

            <div className="flex gap-2 text-[11px]">
              <button
                onClick={() => setFilterMode('all')}
                className={`px-2.5 py-1  font-bold transition-none-colors ${
                  filterMode === 'all'
                    ? 'bg-steel text-bone'
                    : 'bg-deck text-solder hover:text-bone'
                }`}
              >
                All ({displaySchemas.length})
              </button>
              <button
                onClick={() => setFilterMode('conceptual')}
                className={`px-2.5 py-1  font-bold transition-none-colors ${
                  filterMode === 'conceptual'
                    ? 'bg-steel text-bone'
                    : 'bg-deck text-solder hover:text-bone'
                }`}
              >
                Conceptual
              </button>
              <button
                onClick={() => setFilterMode('memorization')}
                className={`px-2.5 py-1  font-bold transition-none-colors ${
                  filterMode === 'memorization'
                    ? 'bg-steel text-bone'
                    : 'bg-deck text-solder hover:text-bone'
                }`}
              >
                Memorization
              </button>
            </div>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {filteredSchemas.length === 0 ? (
              <div className="text-center py-16 text-solder text-xs">
                <span className="text-amber font-bold font-mono">[ BOOK ]</span>
                <p className="font-semibold">No saved schemas found</p>
                <p className="text-[11px] text-bone mt-1">Complete a workout to store your encoded schema.</p>
              </div>
            ) : (
              filteredSchemas.map((schema) => {
                const dateStr = new Date(schema.timestamp).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                });

                return (
                  <div
                    key={schema.id}
                    className="p-4 bg-deck border border-steel space-y-3 hover:border-steel transition-none-all group"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className={`px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider  ${
                            schema.mode === 'memorization'
                              ? 'bg-amber/20 text-amber border border-amber/30'
                              : 'bg-steel/20 text-bone border border-steel/30'
                          }`}>
                            {schema.mode === 'memorization' ? 'Mnemonic Mode' : 'Conceptual'}
                          </span>
                          <span className="text-[10px] text-solder flex items-center gap-1">
                            <span className="text-amber font-bold font-mono">[ DATE ]</span>
                            {dateStr}
                          </span>
                        </div>
                        <h4 className="text-sm font-bold text-bone group-hover:text-bone transition-none-colors">
                          {schema.topicSummary}
                        </h4>
                        {schema.sourceFileName && (
                          <span className="text-[10px] text-solder flex items-center gap-1 mt-0.5">
                            <span className="text-amber font-bold font-mono">[ EXPORT ]</span>
                            {schema.sourceFileName}
                          </span>
                        )}
                      </div>

                      <button
                        onClick={() => onDeleteSchema(schema.id)}
                        className="p-1.5 text-solder hover:text-hazard400 hover:bg-steel transition-none-colors"
                        title="Delete schema"
                      >
                        <span className="text-hazard font-bold font-mono">[ DEL ]</span>
                      </button>
                    </div>

                    <div className="flex items-center justify-between pt-1 text-xs">
                      <div className="flex items-center gap-1 text-amber font-mono font-bold text-[11px]">
                        <span className="text-amber font-bold font-mono">[ ZAP ]</span>
                        {schema.xpEarned} XP
                      </div>

                      <div className="flex items-center gap-1.5">
                        {onShareSchema && (
                          <button
                            type="button"
                            onClick={() => {
                              onShareSchema(schema);
                            }}
                            className="p-1.5 bg-deck hover:bg-steel border border-steel/30 hover:border-steel/60 text-bone text-[11px] font-bold transition-none-all flex items-center gap-1 cursor-pointer"
                            title="Share stateless URL"
                          >
                            <span className="text-amber font-bold font-mono">[ SHARE ]</span>
                            <span className="hidden sm:inline">Share</span>
                          </button>
                        )}

                        <button
                          onClick={() => handleCopyRemNote(schema)}
                          className="px-2.5 py-1 bg-deck hover:bg-steel border border-steel text-solder text-[11px] font-bold transition-none-all flex items-center gap-1 cursor-pointer"
                          title="Copy RemNote format"
                        >
                          {copiedId === schema.id ? <span className="text-amber font-bold font-mono">[ OK ]</span> : <span className="text-amber font-bold font-mono">[ COPY ]</span>}
                          RemNote
                        </button>

                        <button
                          onClick={() => {
                            onStartDrill(schema);
                            onClose();
                          }}
                          className="px-3 py-1 bg-steel hover:bg-steel text-bone text-[11px] font-bold transition-none-all flex items-center gap-1 cursor-pointer"
                        >
                          <span className="text-amber font-bold font-mono">[ PLAY ]</span>
                          Drill
                        </button>

                        <button
                          onClick={() => {
                            onSelectSchemaToResume(schema);
                            onClose();
                          }}
                          className="px-3 py-1 bg-steel hover:bg-steel text-bone text-[11px] font-bold transition-none-all flex items-center gap-1 cursor-pointer"
                        >
                          View
                          <span className="text-amber font-bold font-mono">[ NEXT ]</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer */}
          {displaySchemas.length > 0 && (
            <div className="p-3.5 border-t border-steel bg-deck flex items-center justify-between text-xs">
              <button
                onClick={() => {
                  if (confirm('Are you sure you want to clear all schemas?')) {
                    onClearAll();
                  }
                }}
                className="text-solder hover:text-hazard400 text-[11px] font-medium"
              >
                Clear All Schemas
              </button>
              <span className="text-[10px] text-solder font-mono">
                {user ? 'Synced with Firestore' : 'Stored locally'}
              </span>
            </div>
          )}

        </motion.div>
      </div>
    </AnimatePresence>
  );
}
