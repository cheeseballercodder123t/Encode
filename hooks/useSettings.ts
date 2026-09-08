'use client';

import { useState, useSyncExternalStore } from 'react';
import { AISettings } from '@/lib/types';
import { loadAISettings } from '@/lib/storage';
import { sound } from '@/lib/audio';

function subscribeToConnectivity(onStoreChange: () => void) {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener('online', onStoreChange);
  window.addEventListener('offline', onStoreChange);
  return () => {
    window.removeEventListener('online', onStoreChange);
    window.removeEventListener('offline', onStoreChange);
  };
}

/**
 * Global, app-level settings: AI model configuration (persisted to
 * localStorage via SettingsModal), audio mute state and connectivity status.
 */
export function useSettings() {
  const [aiSettings, setAiSettings] = useState<AISettings>(() => loadAISettings());
  const [soundMuted, setSoundMuted] = useState(false);

  // Track connectivity for the Offline Mode indicator + offline fallback generation
  const isOffline = useSyncExternalStore(
    subscribeToConnectivity,
    () => (typeof navigator !== 'undefined' ? !navigator.onLine : false),
    () => false
  );

  // Toggle sound
  const toggleSound = () => {
    const nextState = !soundMuted;
    setSoundMuted(nextState);
    sound.enabled = !nextState;
    if (!nextState) sound.playBeep(600, 'sine', 0.1);
  };

  return {
    aiSettings,
    setAiSettings,
    soundMuted,
    setSoundMuted,
    toggleSound,
    isOffline,
  };
}
