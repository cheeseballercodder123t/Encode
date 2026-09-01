'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  History, 
  X, 
  Trash2, 
  Play, 
  Copy, 
  Check, 
  FileText, 
  Search, 
  BookOpen, 
  Calendar, 
  Zap,
  ArrowRight,
  Cloud,
  FileDown,
  Share2
} from 'lucide-react';
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
      <div className="fixed inset-0 z-50 flex justify-end bg-black/70 backdrop-blur-sm">
        <motion.div
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', damping: 25, stiffness: 220 }}
          className="w-full max-w-md bg-[#0F111A] border-l border-slate-800 h-full flex flex-col shadow-2xl"
        >
          {/* Header */}
          <div className="p-5 border-b border-slate-800 bg-[#131622] flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 rounded-xl">
                <History className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-white text-base">Saved Schemas</h3>
                  {user ? (
                    <span className="px-2 py-0.2 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[9px] font-bold rounded flex items-center gap-1">
                      <Cloud className="w-2.5 h-2.5" />
                      Cloud Synced
                    </span>
                  ) : (
                    <button 
                      onClick={onOpenAuth}
                      className="px-2 py-0.2 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 text-[9px] font-bold rounded flex items-center gap-1 transition-all"
                    >
                      <Cloud className="w-2.5 h-2.5" />
                      Enable Cloud
                    </button>
                  )}
                </div>
                <p className="text-xs text-slate-400">{displaySchemas.length} encoded topics recorded</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Search & Filter Bar */}
          <div className="p-4 border-b border-slate-800/80 bg-[#0B0D14] space-y-3">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search topics by title..."
                className="w-full pl-9 pr-3 py-2 bg-[#141724] border border-slate-800 rounded-lg text-xs text-slate-200 placeholder:text-slate-600 outline-none focus:border-indigo-500"
              />
            </div>

            <div className="flex gap-2 text-[11px]">
              <button
                onClick={() => setFilterMode('all')}
                className={`px-2.5 py-1 rounded-md font-bold transition-colors ${
                  filterMode === 'all'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-[#141724] text-slate-400 hover:text-slate-200'
                }`}
              >
                All ({displaySchemas.length})
              </button>
              <button
                onClick={() => setFilterMode('conceptual')}
                className={`px-2.5 py-1 rounded-md font-bold transition-colors ${
                  filterMode === 'conceptual'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-[#141724] text-slate-400 hover:text-slate-200'
                }`}
              >
                Conceptual
              </button>
              <button
                onClick={() => setFilterMode('memorization')}
                className={`px-2.5 py-1 rounded-md font-bold transition-colors ${
                  filterMode === 'memorization'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-[#141724] text-slate-400 hover:text-slate-200'
                }`}
              >
                Memorization
              </button>
            </div>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {filteredSchemas.length === 0 ? (
              <div className="text-center py-16 text-slate-500 text-xs">
                <BookOpen className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p className="font-semibold">No saved schemas found</p>
                <p className="text-[11px] text-slate-600 mt-1">Complete a workout to store your encoded schema.</p>
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
                    className="p-4 bg-[#141724] border border-slate-800 rounded-xl space-y-3 hover:border-slate-700 transition-all group"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className={`px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded ${
                            schema.mode === 'memorization'
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                              : 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                          }`}>
                            {schema.mode === 'memorization' ? 'Mnemonic Mode' : 'Conceptual'}
                          </span>
                          <span className="text-[10px] text-slate-500 flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {dateStr}
                          </span>
                        </div>
                        <h4 className="text-sm font-bold text-white group-hover:text-indigo-300 transition-colors">
                          {schema.topicSummary}
                        </h4>
                        {schema.sourceFileName && (
                          <span className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
                            <FileDown className="w-3 h-3 text-indigo-400" />
                            {schema.sourceFileName}
                          </span>
                        )}
                      </div>

                      <button
                        onClick={() => onDeleteSchema(schema.id)}
                        className="p-1.5 text-slate-500 hover:text-red-400 rounded-lg hover:bg-slate-800 transition-colors"
                        title="Delete schema"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="flex items-center justify-between pt-1 text-xs">
                      <div className="flex items-center gap-1 text-amber-400 font-mono font-bold text-[11px]">
                        <Zap className="w-3 h-3" />
                        {schema.xpEarned} XP
                      </div>

                      <div className="flex items-center gap-1.5">
                        {onShareSchema && (
                          <button
                            type="button"
                            onClick={() => {
                              onShareSchema(schema);
                            }}
                            className="p-1.5 bg-[#1A1E2C] hover:bg-[#222738] border border-cyan-500/30 hover:border-cyan-500/60 text-cyan-400 text-[11px] font-bold rounded-lg transition-all flex items-center gap-1 cursor-pointer"
                            title="Share stateless URL"
                          >
                            <Share2 className="w-3 h-3" />
                            <span className="hidden sm:inline">Share</span>
                          </button>
                        )}

                        <button
                          onClick={() => handleCopyRemNote(schema)}
                          className="px-2.5 py-1 bg-[#1A1E2C] hover:bg-[#222738] border border-slate-700 text-slate-300 text-[11px] font-bold rounded-lg transition-all flex items-center gap-1 cursor-pointer"
                          title="Copy RemNote format"
                        >
                          {copiedId === schema.id ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-indigo-400" />}
                          RemNote
                        </button>

                        <button
                          onClick={() => {
                            onStartDrill(schema);
                            onClose();
                          }}
                          className="px-3 py-1 bg-purple-600 hover:bg-purple-500 text-white text-[11px] font-bold rounded-lg shadow-sm transition-all flex items-center gap-1 cursor-pointer"
                        >
                          <Play className="w-3 h-3 fill-current" />
                          Drill
                        </button>

                        <button
                          onClick={() => {
                            onSelectSchemaToResume(schema);
                            onClose();
                          }}
                          className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-bold rounded-lg shadow-sm transition-all flex items-center gap-1 cursor-pointer"
                        >
                          View
                          <ArrowRight className="w-3 h-3" />
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
            <div className="p-3.5 border-t border-slate-800 bg-[#131622] flex items-center justify-between text-xs">
              <button
                onClick={() => {
                  if (confirm('Are you sure you want to clear all schemas?')) {
                    onClearAll();
                  }
                }}
                className="text-slate-500 hover:text-red-400 text-[11px] font-medium"
              >
                Clear All Schemas
              </button>
              <span className="text-[10px] text-slate-500 font-mono">
                {user ? 'Synced with Firestore' : 'Stored locally'}
              </span>
            </div>
          )}

        </motion.div>
      </div>
    </AnimatePresence>
  );
}
