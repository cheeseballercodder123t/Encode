'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AISettings, AIProvider } from '@/lib/types';
import { loadAISettings, saveAISettings, DEFAULT_SETTINGS } from '@/lib/storage';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: (settings: AISettings) => void;
}

export function SettingsModal({ isOpen, onClose, onSaved }: SettingsModalProps) {
  const [settings, setSettings] = useState<AISettings>(() => loadAISettings());
  const [savedSuccess, setSavedSuccess] = useState(false);

  const handleOpenInit = () => {
    setSettings(loadAISettings());
    setSavedSuccess(false);
  };

  const handleSave = () => {
    saveAISettings(settings);
    onSaved(settings);
    setSavedSuccess(true);
    setTimeout(() => {
      setSavedSuccess(false);
      onClose();
    }, 800);
  };

  const handleReset = () => {
    setSettings(DEFAULT_SETTINGS);
    saveAISettings(DEFAULT_SETTINGS);
    onSaved(DEFAULT_SETTINGS);
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-chassis/70 ">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          className="w-full max-w-xl bg-chassis border border-steel overflow-hidden flex flex-col max-h-[90vh]"
        >
          {/* Header */}
          <div className="p-5 border-b border-steel bg-deck flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-steel/10 border border-steel/30 text-bone ">
                <span className="text-amber font-bold font-mono">[ CFG ]</span>
              </div>
              <div>
                <h3 className="font-bold text-bone text-base">AI Engine & API Keys</h3>
                <p className="text-xs text-solder">Configure Gemini, OpenRouter, or OpenAI-compatible endpoints</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-solder hover:text-bone hover:bg-steel transition-none-colors"
            >
              <span className="text-amber font-bold font-mono">[ X ]</span>
            </button>
          </div>

          {/* Body */}
          <div className="p-6 overflow-y-auto space-y-6 text-xs">
            
            {/* Provider Tabs */}
            <div>
              <label className="text-solder font-bold uppercase tracking-wider block mb-2">
                Select AI Provider:
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setSettings({ ...settings, provider: 'gemini' })}
                  className={`p-3  border flex flex-col items-center gap-1.5 transition-none-all ${
                    settings.provider === 'gemini'
                      ? 'bg-steel/20 border-steel text-bone  '
                      : 'bg-deck border-steel text-solder hover:text-bone'
                  }`}
                >
                  <span className="text-amber font-bold font-mono">[ * ]</span>
                  <span className="font-bold text-xs">Google Gemini</span>
                  <span className="text-[10px] text-solder">Default & Fastest</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSettings({ ...settings, provider: 'openrouter' })}
                  className={`p-3  border flex flex-col items-center gap-1.5 transition-none-all ${
                    settings.provider === 'openrouter'
                      ? 'bg-steel/20 border-steel text-bone  '
                      : 'bg-deck border-steel text-solder hover:text-bone'
                  }`}
                >
                  <span className="text-amber font-bold font-mono">[ SERVER ]</span>
                  <span className="font-bold text-xs">OpenRouter</span>
                  <span className="text-[10px] text-solder">Universal Router</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSettings({ ...settings, provider: 'openai' })}
                  className={`p-3  border flex flex-col items-center gap-1.5 transition-none-all ${
                    settings.provider === 'openai'
                      ? 'bg-steel/20 border-steel text-bone  '
                      : 'bg-deck border-steel text-solder hover:text-bone'
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
              <div className="space-y-4 bg-deck p-4 border border-steel">
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
                  className="w-full p-2.5 bg-[#0B0D14] border border-steel text-bone outline-none focus:border-steel font-mono text-xs"
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
                      className="w-full p-2 bg-[#0B0D14] border border-steel text-bone outline-none focus:border-steel font-mono text-xs"
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
                      className="w-full p-2 bg-[#0B0D14] border border-steel text-bone outline-none focus:border-steel font-mono text-xs"
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
              <div className="space-y-4 bg-deck p-4 border border-steel">
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
                  className="w-full p-2.5 bg-[#0B0D14] border border-steel text-bone outline-none focus:border-steel font-mono text-xs"
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
                      className="w-full p-2 bg-[#0B0D14] border border-steel text-bone outline-none focus:border-steel font-mono text-xs"
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
                      className="w-full p-2 bg-[#0B0D14] border border-steel text-bone outline-none focus:border-steel font-mono text-xs"
                    />
                  </div>
                </div>
              </div>
            )}

            {settings.provider === 'openai' && (
              <div className="space-y-4 bg-deck p-4 border border-steel">
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
                    className="w-full p-2.5 bg-[#0B0D14] border border-steel text-bone outline-none focus:border-steel font-mono text-xs"
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
                    className="w-full p-2.5 bg-[#0B0D14] border border-steel text-bone outline-none focus:border-steel font-mono text-xs"
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
                      className="w-full p-2 bg-[#0B0D14] border border-steel text-bone outline-none focus:border-steel font-mono text-xs"
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
                      className="w-full p-2 bg-[#0B0D14] border border-steel text-bone outline-none focus:border-steel font-mono text-xs"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Privacy note */}
            <div className="flex items-start gap-2 text-[11px] text-solder bg-deck/60 p-3 border border-steel">
              <span className="text-amber font-bold font-mono">[ OK ]</span>
              <span>Keys are stored locally in your browser storage and never logged or exposed to third parties.</span>
            </div>

          </div>

          {/* Footer */}
          <div className="p-4 border-t border-steel bg-deck flex items-center justify-between">
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
                onClick={onClose}
                className="px-4 py-2 bg-steel hover:bg-steel text-solder font-bold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                className="flex items-center gap-1.5 px-5 py-2 bg-steel hover:bg-steel text-bone font-bold  "
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
