'use client';

import { useEffect, useMemo, useState } from 'react';
import { UploadedFileAsset } from '@/lib/types';
import { loadStudyPrefs, saveStudyPrefs } from '@/lib/storage';

export type InputSourceTab = 'text' | 'file' | 'youtube';
export type StrictnessLevel = 'sherpa' | 'feynman' | 'viva';

/**
 * Input-source state for the launchpad: raw notes, file uploads, YouTube URL,
 * generation feature toggles and derived helpers (word count for Guided Path).
 *
 * Study prefs (tab, strictness, toggles) are loaded once from localStorage and
 * persisted subtly on every change — no re-configuration between sessions.
 */
export function useInputSource() {
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const [activeTab, setActiveTab] = useState<InputSourceTab>('text');
  const [rawNotes, setRawNotes] = useState('');
  const [uploadedFile, setUploadedFile] = useState<UploadedFileAsset | null>(null);
  const [youtubeUrl, setYoutubeUrl] = useState('');

  // Feature Toggles
  const [enableDeepResearch, setEnableDeepResearch] = useState(true);
  const [enableGuidedPath, setEnableGuidedPath] = useState(false);
  const [strictnessLevel, setStrictnessLevel] = useState<StrictnessLevel>('feynman');
  const [interleaveMode, setInterleaveMode] = useState(false);

  // Hydrate last-used study prefs once on mount
  useEffect(() => {
    try {
      const prefs = loadStudyPrefs();
      setActiveTab(prefs.activeTab);
      setEnableDeepResearch(prefs.enableDeepResearch);
      setEnableGuidedPath(prefs.enableGuidedPath);
      setStrictnessLevel(prefs.strictnessLevel);
    } catch {
      /* keep defaults */
    } finally {
      setPrefsLoaded(true);
    }
  }, []);

  // Persist tab + toggles subtly whenever they change (after initial load)
  useEffect(() => {
    if (!prefsLoaded) return;
    saveStudyPrefs({ activeTab });
  }, [activeTab, prefsLoaded]);

  useEffect(() => {
    if (!prefsLoaded) return;
    saveStudyPrefs({ enableDeepResearch, enableGuidedPath, strictnessLevel });
  }, [enableDeepResearch, enableGuidedPath, strictnessLevel, prefsLoaded]);

  // Auto-detect massive text for Guided Path hint
  const wordCount = useMemo(() => {
    return rawNotes.trim() ? rawNotes.trim().split(/\s+/).length : 0;
  }, [rawNotes]);

  return {
    activeTab,
    setActiveTab,
    rawNotes,
    setRawNotes,
    uploadedFile,
    setUploadedFile,
    youtubeUrl,
    setYoutubeUrl,
    enableDeepResearch,
    setEnableDeepResearch,
    enableGuidedPath,
    setEnableGuidedPath,
    strictnessLevel,
    setStrictnessLevel,
    interleaveMode,
    setInterleaveMode,
    wordCount,
  };
}
