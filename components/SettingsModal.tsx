'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Key, 
  Settings2, 
  X, 
  Check, 
  Server, 
  Cpu, 
  Sparkles, 
  ShieldCheck, 
  Info,
  ExternalLink
} from 'lucide-react';
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
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          className="w-full max-w-xl bg-[#0F111A] border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        >
          {/* Header */}
          <div className="p-5 border-b border-slate-800 bg-[#131622] flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 rounded-xl">
                <Settings2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-white text-base">AI Engine & API Keys</h3>
                <p className="text-xs text-slate-400">Configure Gemini, OpenRouter, or OpenAI-compatible endpoints</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body */}
          <div className="p-6 overflow-y-auto space-y-6 text-xs">
            
            {/* Provider Tabs */}
            <div>
              <label className="text-slate-300 font-bold uppercase tracking-wider block mb-2">
                Select AI Provider:
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setSettings({ ...settings, provider: 'gemini' })}
                  className={`p-3 rounded-xl border flex flex-col items-center gap-1.5 transition-all ${
                    settings.provider === 'gemini'
                      ? 'bg-indigo-600/20 border-indigo-500 text-white shadow-lg shadow-indigo-500/10'
                      : 'bg-[#141724] border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Sparkles className="w-4 h-4 text-indigo-400" />
                  <span className="font-bold text-xs">Google Gemini</span>
                  <span className="text-[10px] text-slate-500">Default & Fastest</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSettings({ ...settings, provider: 'openrouter' })}
                  className={`p-3 rounded-xl border flex flex-col items-center gap-1.5 transition-all ${
                    settings.provider === 'openrouter'
                      ? 'bg-indigo-600/20 border-indigo-500 text-white shadow-lg shadow-indigo-500/10'
                      : 'bg-[#141724] border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Server className="w-4 h-4 text-purple-400" />
                  <span className="font-bold text-xs">OpenRouter</span>
                  <span className="text-[10px] text-slate-500">Universal Router</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSettings({ ...settings, provider: 'openai' })}
                  className={`p-3 rounded-xl border flex flex-col items-center gap-1.5 transition-all ${
                    settings.provider === 'openai'
                      ? 'bg-indigo-600/20 border-indigo-500 text-white shadow-lg shadow-indigo-500/10'
                      : 'bg-[#141724] border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Cpu className="w-4 h-4 text-emerald-400" />
                  <span className="font-bold text-xs">OpenAI / Compatible</span>
                  <span className="text-[10px] text-slate-500">Custom BaseURL</span>
                </button>
              </div>
            </div>

            {/* Provider-Specific Configuration */}
            {settings.provider === 'gemini' && (
              <div className="space-y-4 bg-[#141724] p-4 rounded-xl border border-slate-800">
                <div className="flex items-center justify-between">
                  <div className="font-bold text-slate-200 flex items-center gap-1.5">
                    <Key className="w-3.5 h-3.5 text-indigo-400" />
                    Gemini API Key (Optional)
                  </div>
                  <span className="text-[10px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded">
                    Default Built-in Active
                  </span>
                </div>
                <p className="text-slate-400 text-[11px] leading-relaxed">
                  Leave blank to use the built-in applet server key, or supply your own Google AI Studio API key.
                </p>
                <input
                  type="password"
                  value={settings.geminiApiKey || ''}
                  onChange={(e) => setSettings({ ...settings, geminiApiKey: e.target.value })}
                  placeholder="AIzaSy... (Leave blank for default)"
                  className="w-full p-2.5 bg-[#0B0D14] border border-slate-700 rounded-lg text-slate-200 outline-none focus:border-indigo-500 font-mono text-xs"
                />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                  <div>
                    <label className="text-slate-400 block mb-1 font-semibold text-[11px]">
                      Main Schema Generator:
                    </label>
                    <select
                      value={settings.geminiModel || 'gemini-3.7-flash'}
                      onChange={(e) => setSettings({ ...settings, geminiModel: e.target.value })}
                      className="w-full p-2 bg-[#0B0D14] border border-slate-700 rounded-lg text-slate-200 outline-none focus:border-indigo-500"
                    >
                      <option value="gemini-3.7-flash">gemini-3.7-flash (Default & Multimodal)</option>
                      <option value="gemini-2.5-flash">gemini-2.5-flash</option>
                      <option value="gemini-2.5-pro">gemini-2.5-pro (Deepest Quality)</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-slate-400 block mb-1 font-semibold text-[11px]">
                      Lightweight Feynman Answer Checker:
                    </label>
                    <select
                      value={settings.geminiCheckerModel || 'gemini-3.5-flash-lite'}
                      onChange={(e) => setSettings({ ...settings, geminiCheckerModel: e.target.value })}
                      className="w-full p-2 bg-[#0B0D14] border border-slate-700 rounded-lg text-slate-200 outline-none focus:border-indigo-500"
                    >
                      <option value="gemini-3.5-flash-lite">gemini-3.5-flash-lite (Default & Ultra Fast)</option>
                      <option value="gemini-2.5-flash-lite">gemini-2.5-flash-lite</option>
                      <option value="gemini-3.7-flash">gemini-3.7-flash</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {settings.provider === 'openrouter' && (
              <div className="space-y-4 bg-[#141724] p-4 rounded-xl border border-slate-800">
                <div className="flex items-center justify-between">
                  <div className="font-bold text-slate-200 flex items-center gap-1.5">
                    <Key className="w-3.5 h-3.5 text-purple-400" />
                    OpenRouter API Key
                  </div>
                  <a 
                    href="https://openrouter.ai/keys" 
                    target="_blank" 
                    rel="noreferrer"
                    className="text-[10px] text-purple-400 hover:underline flex items-center gap-1"
                  >
                    Get Key <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
                <input
                  type="password"
                  value={settings.openrouterApiKey || ''}
                  onChange={(e) => setSettings({ ...settings, openrouterApiKey: e.target.value })}
                  placeholder="sk-or-v1-..."
                  className="w-full p-2.5 bg-[#0B0D14] border border-slate-700 rounded-lg text-slate-200 outline-none focus:border-indigo-500 font-mono text-xs"
                />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                  <div>
                    <label className="text-slate-400 block mb-1 font-semibold text-[11px]">
                      Main Generator Model ID:
                    </label>
                    <input
                      type="text"
                      value={settings.openrouterModel || 'google/gemini-2.5-flash'}
                      onChange={(e) => setSettings({ ...settings, openrouterModel: e.target.value })}
                      placeholder="e.g. google/gemini-2.5-flash"
                      className="w-full p-2 bg-[#0B0D14] border border-slate-700 rounded-lg text-slate-200 outline-none focus:border-indigo-500 font-mono text-xs"
                    />
                  </div>

                  <div>
                    <label className="text-slate-400 block mb-1 font-semibold text-[11px]">
                      Lightweight Checker Model ID:
                    </label>
                    <input
                      type="text"
                      value={settings.openrouterCheckerModel || 'google/gemini-2.5-flash-lite'}
                      onChange={(e) => setSettings({ ...settings, openrouterCheckerModel: e.target.value })}
                      placeholder="e.g. google/gemini-2.5-flash-lite"
                      className="w-full p-2 bg-[#0B0D14] border border-slate-700 rounded-lg text-slate-200 outline-none focus:border-indigo-500 font-mono text-xs"
                    />
                  </div>
                </div>
              </div>
            )}

            {settings.provider === 'openai' && (
              <div className="space-y-4 bg-[#141724] p-4 rounded-xl border border-slate-800">
                <div>
                  <div className="font-bold text-slate-200 flex items-center gap-1.5 mb-1">
                    <Server className="w-3.5 h-3.5 text-emerald-400" />
                    Custom API Base URL
                  </div>
                  <input
                    type="text"
                    value={settings.openaiBaseUrl || 'https://api.openai.com/v1'}
                    onChange={(e) => setSettings({ ...settings, openaiBaseUrl: e.target.value })}
                    placeholder="https://api.openai.com/v1 or http://localhost:11434/v1"
                    className="w-full p-2.5 bg-[#0B0D14] border border-slate-700 rounded-lg text-slate-200 outline-none focus:border-indigo-500 font-mono text-xs"
                  />
                  <span className="text-[10px] text-slate-500 mt-1 block">Supports OpenAI, Groq, Ollama, LM Studio, or vLLM</span>
                </div>

                <div>
                  <div className="font-bold text-slate-200 flex items-center gap-1.5 mb-1">
                    <Key className="w-3.5 h-3.5 text-emerald-400" />
                    API Key
                  </div>
                  <input
                    type="password"
                    value={settings.openaiApiKey || ''}
                    onChange={(e) => setSettings({ ...settings, openaiApiKey: e.target.value })}
                    placeholder="sk-..."
                    className="w-full p-2.5 bg-[#0B0D14] border border-slate-700 rounded-lg text-slate-200 outline-none focus:border-indigo-500 font-mono text-xs"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-slate-400 block mb-1 font-semibold text-[11px]">
                      Main Generator Model:
                    </label>
                    <input
                      type="text"
                      value={settings.openaiModel || 'gpt-4o-mini'}
                      onChange={(e) => setSettings({ ...settings, openaiModel: e.target.value })}
                      placeholder="e.g. gpt-4o-mini"
                      className="w-full p-2 bg-[#0B0D14] border border-slate-700 rounded-lg text-slate-200 outline-none focus:border-indigo-500 font-mono text-xs"
                    />
                  </div>

                  <div>
                    <label className="text-slate-400 block mb-1 font-semibold text-[11px]">
                      Lightweight Checker Model:
                    </label>
                    <input
                      type="text"
                      value={settings.openaiCheckerModel || 'gpt-4o-mini'}
                      onChange={(e) => setSettings({ ...settings, openaiCheckerModel: e.target.value })}
                      placeholder="e.g. gpt-4o-mini"
                      className="w-full p-2 bg-[#0B0D14] border border-slate-700 rounded-lg text-slate-200 outline-none focus:border-indigo-500 font-mono text-xs"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Privacy note */}
            <div className="flex items-start gap-2 text-[11px] text-slate-400 bg-slate-900/60 p-3 rounded-lg border border-slate-800">
              <ShieldCheck className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
              <span>Keys are stored locally in your browser storage and never logged or exposed to third parties.</span>
            </div>

          </div>

          {/* Footer */}
          <div className="p-4 border-t border-slate-800 bg-[#131622] flex items-center justify-between">
            <button
              type="button"
              onClick={handleReset}
              className="text-xs text-slate-400 hover:text-slate-200"
            >
              Reset to Defaults
            </button>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg font-bold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                className="flex items-center gap-1.5 px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold shadow-lg shadow-indigo-500/20"
              >
                {savedSuccess ? <Check className="w-4 h-4 text-emerald-300" /> : null}
                {savedSuccess ? 'Saved!' : 'Save Configuration'}
              </button>
            </div>
          </div>

        </motion.div>
      </div>
    </AnimatePresence>
  );
}
