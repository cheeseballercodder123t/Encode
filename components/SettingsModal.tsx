'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AISettings, AIProvider } from '@/lib/types';
import { loadAISettings, saveAISettings, DEFAULT_SETTINGS, loadStudyPrefs, saveStudyPrefs } from '@/lib/storage';
import { getAllTemplates } from '@/lib/templates/registry';
import { useAuth } from '@/lib/auth-context';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: (settings: AISettings) => void;
  /** Optional cloud backup hook from AuthContext (undefined when unavailable). */
  backupSettingsToCloud?: (settings: any) => Promise<void>;
}

export function SettingsModal({ isOpen, onClose, onSaved, backupSettingsToCloud }: SettingsModalProps) {
  const { settingsRestored: settingsRestoredNotice } = useAuth();
  const [settings, setSettings] = useState<AISettings>(() => loadAISettings());
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [importStatus, setImportStatus] = useState<{ ok: boolean; message: string } | null>(null);
  // Templates the learner hid (not pulling their weight) — persisted subtly.
  const [hiddenTemplates, setHiddenTemplates] = useState<string[]>(() => loadStudyPrefs().hiddenTemplates);

  // Re-sync from storage each time the modal opens. Done as a during-render
  // reset (the same pattern AnkiExportModal uses) so opening never needs a
  // cascading setState-in-effect pass.
  const [wasOpen, setWasOpen] = useState(false);
  if (isOpen && !wasOpen) {
    setWasOpen(true);
    setSettings(loadAISettings());
    setHiddenTemplates(loadStudyPrefs().hiddenTemplates);
    setSavedSuccess(false);
  } else if (!isOpen && wasOpen) {
    setWasOpen(false);
  }

  const toggleHiddenTemplate = (id: string) => {
    setHiddenTemplates(prev => prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]);
  };

  const handleSave = () => {
    const stamped = { ...settings, savedAt: Date.now() } as any;
    saveAISettings(stamped);
    saveStudyPrefs({ hiddenTemplates });
    onSaved(stamped);
    // Fire-and-forget cloud backup (no-op when signed out; failures surface
    // via the header CLOUD status, never block saving locally).
    void backupSettingsToCloud?.(stamped);
    setSavedSuccess(true);
    setTimeout(() => {
      setSavedSuccess(false);
      onClose();
    }, 800);
  };

  /** Downloads a portable JSON snapshot of settings + hidden templates. */
  const handleExport = () => {
    const payload = {
      kind: 'deepencode-settings-v1',
      exportedAt: Date.now(),
      settings: { ...settings, savedAt: (settings as any).savedAt || Date.now() },
      hiddenTemplates,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `deepencode-settings-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  /** Imports a settings JSON (file picker), validating its kind marker. */
  const handleImportFile = async (file: File) => {
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (data?.kind !== 'deepencode-settings-v1' || typeof data.settings !== 'object') {
        throw new Error('Not a DeepEncode settings export.');
      }
      const imported = { ...DEFAULT_SETTINGS, ...data.settings } as AISettings;
      setSettings(imported);
      setHiddenTemplates(Array.isArray(data.hiddenTemplates) ? data.hiddenTemplates : []);
      // Persist immediately so nothing is lost if the user closes without saving.
      const stamped = { ...imported, savedAt: Date.now() } as any;
      saveAISettings(stamped);
      saveStudyPrefs({ hiddenTemplates: Array.isArray(data.hiddenTemplates) ? data.hiddenTemplates : [] });
      onSaved(stamped);
      void backupSettingsToCloud?.(stamped);
      setImportStatus({ ok: true, message: 'Settings imported and saved.' });
    } catch (err: any) {
      setImportStatus({ ok: false, message: err?.message || 'Import failed.' });
    }
  };

  const handleReset = () => {
    setSettings(DEFAULT_SETTINGS);
    saveAISettings(DEFAULT_SETTINGS);
    setHiddenTemplates([]);
    saveStudyPrefs({ hiddenTemplates: [] });
    onSaved(DEFAULT_SETTINGS);
  };

  if (!isOpen) return null;

  const restoredNotice = settingsRestoredNotice && !importStatus
    ? 'Settings restored from your cloud backup.'
    : null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-chassis/70 ">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          className="w-full max-w-xl bg-chassis border border-edge overflow-hidden flex flex-col max-h-[90vh]"
        >
          {/* Header */}
          <div className="p-5 border-b border-edge bg-deck flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-inset/10 border border-edge/30 text-bone ">
                <span className="text-amber font-bold font-mono">[ CFG ]</span>
              </div>
              <div>
                <h3 className="font-bold text-bone text-base">AI Engine & API Keys</h3>
                <p className="text-xs text-solder">Configure Gemini, OpenRouter, or OpenAI-compatible endpoints</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-solder hover:text-bone hover:bg-inset transition-colors duration-150"
            >
              <span className="text-amber font-bold font-mono">[ X ]</span>
            </button>
          </div>

          {/* Body */}
          <div className="p-6 overflow-y-auto space-y-6 text-xs">
            {(importStatus || restoredNotice) && (
              <div
                className={`p-3 border text-xs flex items-start gap-2 ${
                  importStatus && !importStatus.ok
                    ? 'bg-hazard-950/40 border-hazard/40 text-hazard-300'
                    : 'bg-signal-950/40 border-signal/40 text-signal-300'
                }`}
              >
                <span className="font-bold font-mono">{importStatus && !importStatus.ok ? '[ ! ]' : '[ OK ]'}</span>
                <span className="leading-relaxed">{importStatus ? importStatus.message : restoredNotice}</span>
              </div>
            )}
            
            {/* Provider Tabs */}
            <div>
              <label className="text-solder font-bold uppercase tracking-wider block mb-2">
                Select AI Provider:
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setSettings({ ...settings, provider: 'gemini' })}
                  className={`p-3  border flex flex-col items-center gap-1.5 transition-all ${
                    settings.provider === 'gemini'
                      ? 'bg-inset/20 border-edge text-bone  '
                      : 'bg-deck border-edge text-solder hover:text-bone'
                  }`}
                >
                  <span className="text-amber font-bold font-mono">[ * ]</span>
                  <span className="font-bold text-xs">Google Gemini</span>
                  <span className="text-[10px] text-solder">Default & Fastest</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSettings({ ...settings, provider: 'openrouter' })}
                  className={`p-3  border flex flex-col items-center gap-1.5 transition-all ${
                    settings.provider === 'openrouter'
                      ? 'bg-inset/20 border-edge text-bone  '
                      : 'bg-deck border-edge text-solder hover:text-bone'
                  }`}
                >
                  <span className="text-amber font-bold font-mono">[ SERVER ]</span>
                  <span className="font-bold text-xs">OpenRouter</span>
                  <span className="text-[10px] text-solder">Universal Router</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSettings({ ...settings, provider: 'openai' })}
                  className={`p-3  border flex flex-col items-center gap-1.5 transition-all ${
                    settings.provider === 'openai'
                      ? 'bg-inset/20 border-edge text-bone  '
                      : 'bg-deck border-edge text-solder hover:text-bone'
                  }`}
                >
                  <span className="text-amber font-bold font-mono">[ CPU ]</span>
                  <span className="font-bold text-xs">OpenAI / Compatible</span>
                  <span className="text-[10px] text-solder">Custom BaseURL</span>
                </button>
              </div>
            </div>

            {/* Provider-Specific Configuration */}
            {settings.provider === 'gemini' && (
              <div className="space-y-4 bg-deck p-4 border border-edge">
                <div className="flex items-center justify-between">
                  <div className="font-bold text-bone flex items-center gap-1.5">
                    <span className="text-amber font-bold font-mono">[ KEY ]</span>
                    Gemini API Key (Optional)
                  </div>
                  <span className="text-[10px] text-amber bg-amber/10 border border-amber/30 px-2 py-0.5 ">
                    Default Built-in Active
                  </span>
                </div>
                <p className="text-solder text-[11px] leading-relaxed">
                  Leave blank to use the built-in applet server key, or supply your own Google AI Studio API key.
                </p>
                <input
                  type="password"
                  value={settings.geminiApiKey || ''}
                  onChange={(e) => setSettings({ ...settings, geminiApiKey: e.target.value })}
                  placeholder="AIzaSy... (Leave blank for default)"
                  className="w-full p-2.5 bg-[#0B0D14] border border-edge text-bone outline-none focus:border-edge font-mono text-xs"
                />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                  <div>
                    <label className="text-solder block mb-1 font-semibold text-[11px]">
                      Main Schema Generator:
                    </label>
                    <input
                      type="text"
                      list="gemini-models-list"
                      value={settings.geminiModel || 'gemini-3.7-flash'}
                      onChange={(e) => setSettings({ ...settings, geminiModel: e.target.value })}
                      placeholder="e.g. gemini-3.7-flash or gemini-2.5-pro"
                      className="w-full p-2 bg-[#0B0D14] border border-edge text-bone outline-none focus:border-edge font-mono text-xs"
                    />
                    <datalist id="gemini-models-list">
                      <option value="gemini-3.7-flash" />
                      <option value="gemini-2.5-flash" />
                      <option value="gemini-2.5-pro" />
                      <option value="gemini-1.5-pro" />
                      <option value="gemini-1.5-flash" />
                    </datalist>
                  </div>

                  <div>
                    <label className="text-solder block mb-1 font-semibold text-[11px]">
                      Lightweight Feynman Answer Checker:
                    </label>
                    <input
                      type="text"
                      list="gemini-checker-models-list"
                      value={settings.geminiCheckerModel || 'gemini-3.5-flash-lite'}
                      onChange={(e) => setSettings({ ...settings, geminiCheckerModel: e.target.value })}
                      placeholder="e.g. gemini-3.5-flash-lite or gemini-2.5-flash-lite"
                      className="w-full p-2 bg-[#0B0D14] border border-edge text-bone outline-none focus:border-edge font-mono text-xs"
                    />
                    <datalist id="gemini-checker-models-list">
                      <option value="gemini-3.5-flash-lite" />
                      <option value="gemini-2.5-flash-lite" />
                      <option value="gemini-3.7-flash" />
                      <option value="gemini-2.5-flash" />
                    </datalist>
                  </div>
                </div>
              </div>
            )}

            {settings.provider === 'openrouter' && (
              <div className="space-y-4 bg-deck p-4 border border-edge">
                <div className="flex items-center justify-between">
                  <div className="font-bold text-bone flex items-center gap-1.5">
                    <span className="text-amber font-bold font-mono">[ KEY ]</span>
                    OpenRouter API Key
                  </div>
                  <a 
                    href="https://openrouter.ai/keys" 
                    target="_blank" 
                    rel="noreferrer"
                    className="text-[10px] text-bone hover:underline flex items-center gap-1"
                  >
                    Get Key <span className="text-amber font-bold font-mono">[ EXT ]</span>
                  </a>
                </div>
                <input
                  type="password"
                  value={settings.openrouterApiKey || ''}
                  onChange={(e) => setSettings({ ...settings, openrouterApiKey: e.target.value })}
                  placeholder="sk-or-v1-..."
                  className="w-full p-2.5 bg-[#0B0D14] border border-edge text-bone outline-none focus:border-edge font-mono text-xs"
                />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                  <div>
                    <label className="text-solder block mb-1 font-semibold text-[11px]">
                      Main Generator Model ID:
                    </label>
                    <input
                      type="text"
                      value={settings.openrouterModel || 'google/gemini-2.5-flash'}
                      onChange={(e) => setSettings({ ...settings, openrouterModel: e.target.value })}
                      placeholder="e.g. google/gemini-2.5-flash"
                      className="w-full p-2 bg-[#0B0D14] border border-edge text-bone outline-none focus:border-edge font-mono text-xs"
                    />
                  </div>

                  <div>
                    <label className="text-solder block mb-1 font-semibold text-[11px]">
                      Lightweight Checker Model ID:
                    </label>
                    <input
                      type="text"
                      value={settings.openrouterCheckerModel || 'google/gemini-2.5-flash-lite'}
                      onChange={(e) => setSettings({ ...settings, openrouterCheckerModel: e.target.value })}
                      placeholder="e.g. google/gemini-2.5-flash-lite"
                      className="w-full p-2 bg-[#0B0D14] border border-edge text-bone outline-none focus:border-edge font-mono text-xs"
                    />
                  </div>
                </div>
              </div>
            )}

            {settings.provider === 'openai' && (
              <div className="space-y-4 bg-deck p-4 border border-edge">
                <div>
                  <div className="font-bold text-bone flex items-center gap-1.5 mb-1">
                    <span className="text-amber font-bold font-mono">[ SERVER ]</span>
                    Custom API Base URL
                  </div>
                  <input
                    type="text"
                    value={settings.openaiBaseUrl || 'https://api.openai.com/v1'}
                    onChange={(e) => setSettings({ ...settings, openaiBaseUrl: e.target.value })}
                    placeholder="https://api.openai.com/v1 or http://localhost:11434/v1"
                    className="w-full p-2.5 bg-[#0B0D14] border border-edge text-bone outline-none focus:border-edge font-mono text-xs"
                  />
                  <span className="text-[10px] text-solder mt-1 block">Supports OpenAI, Groq, Ollama, LM Studio, or vLLM</span>
                </div>

                <div>
                  <div className="font-bold text-bone flex items-center gap-1.5 mb-1">
                    <span className="text-amber font-bold font-mono">[ KEY ]</span>
                    API Key
                  </div>
                  <input
                    type="password"
                    value={settings.openaiApiKey || ''}
                    onChange={(e) => setSettings({ ...settings, openaiApiKey: e.target.value })}
                    placeholder="sk-..."
                    className="w-full p-2.5 bg-[#0B0D14] border border-edge text-bone outline-none focus:border-edge font-mono text-xs"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-solder block mb-1 font-semibold text-[11px]">
                      Main Generator Model:
                    </label>
                    <input
                      type="text"
                      value={settings.openaiModel || 'gpt-4o-mini'}
                      onChange={(e) => setSettings({ ...settings, openaiModel: e.target.value })}
                      placeholder="e.g. gpt-4o-mini"
                      className="w-full p-2 bg-[#0B0D14] border border-edge text-bone outline-none focus:border-edge font-mono text-xs"
                    />
                  </div>

                  <div>
                    <label className="text-solder block mb-1 font-semibold text-[11px]">
                      Lightweight Checker Model:
                    </label>
                    <input
                      type="text"
                      value={settings.openaiCheckerModel || 'gpt-4o-mini'}
                      onChange={(e) => setSettings({ ...settings, openaiCheckerModel: e.target.value })}
                      placeholder="e.g. gpt-4o-mini"
                      className="w-full p-2 bg-[#0B0D14] border border-edge text-bone outline-none focus:border-edge font-mono text-xs"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Privacy note */}
            <div className="flex items-start gap-2 text-[11px] text-solder bg-deck/60 p-3 border border-edge">
              <span className="text-amber font-bold font-mono">[ OK ]</span>
              <span>Keys are stored locally in your browser storage and never logged or exposed to third parties.</span>
            </div>

            {/* Templates you like / don't: hide any that aren't pulling their weight */}
            <div>
              <label className="text-solder font-bold uppercase tracking-wider block mb-1">
                Stage templates you use:
              </label>
              <p className="text-[11px] text-solder mb-2">
                Hide the ones you never click. Hidden templates are skipped when generating sessions.
              </p>
              <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                {getAllTemplates().map(t => {
                  const hidden = hiddenTemplates.includes(t.id);
                  return (
                    <div
                      key={t.id}
                      className={`flex items-start gap-2 p-2 border ${hidden ? 'border-edge/50 bg-chassis opacity-60' : 'border-edge bg-deck/60'}`}
                    >
                      <button
                        type="button"
                        onClick={() => toggleHiddenTemplate(t.id)}
                        aria-pressed={!hidden}
                        title={hidden ? `Show ${t.title}` : `Hide ${t.title}`}
                        className={`mt-0.5 min-w-[52px] px-2 py-1 text-[10px] font-mono font-bold uppercase border cursor-pointer ${
                          hidden
                            ? 'border-edge text-solder'
                            : 'border-amber bg-amber text-chassis'
                        }`}
                      >
                        {hidden ? '[ OFF ]' : '[ ON ]'}
                      </button>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-bone leading-tight">{t.icon} {t.title}</p>
                        {t.learnerBenefit && (
                          <p className="text-[11px] text-solder leading-snug mt-0.5">{t.learnerBenefit}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

          </div>

          {/* Footer */}
          <div className="p-4 border-t border-edge bg-deck flex items-center justify-between">
            <button
              type="button"
              onClick={handleReset}
              className="text-xs text-solder hover:text-bone"
            >
              Reset to Defaults
            </button>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleExport}
                title="Download settings as a portable JSON file"
                className="px-3 py-2 bg-deck border border-edge text-solder hover:text-bone font-bold text-xs transition-colors duration-150"
              >
                Export
              </button>
              <label
                title="Import a settings JSON file"
                className="px-3 py-2 bg-deck border border-edge text-solder hover:text-bone font-bold text-xs transition-colors duration-150 cursor-pointer"
              >
                Import
                <input
                  type="file"
                  accept="application/json,.json"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleImportFile(f);
                    e.currentTarget.value = '';
                  }}
                />
              </label>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-inset text-solder font-bold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                className="flex items-center gap-1.5 px-5 py-2 bg-inset text-bone font-bold  "
              >
                {savedSuccess ? <span className="text-amber font-bold font-mono">[ OK ]</span> : null}
                {savedSuccess ? 'Saved!' : 'Save Configuration'}
              </button>
            </div>
          </div>

        </motion.div>
      </div>
    </AnimatePresence>
  );
}
