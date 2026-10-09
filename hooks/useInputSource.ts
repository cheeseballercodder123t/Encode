'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EncodingGear, UploadedFileAsset } from '@/lib/types';
import { loadStudyPrefs, saveStudyPrefs } from '@/lib/storage';
import { getSessionStateIDB, putSessionStateIDB, deleteSessionStateIDB } from '@/lib/db';

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
  const [activeTab, setStoredActiveTab] = useState<InputSourceTab>('text');
  const sourceTouched = useRef(false);
  const setActiveTab = useCallback((tab: InputSourceTab) => {
    sourceTouched.current = true;
    setStoredActiveTab(tab);
  }, []);
  const [rawNotes, setRawNotes] = useState('');
  const [uploadedFile, setStoredUploadedFile] = useState<UploadedFileAsset | null>(null);
  const [youtubeUrl, setYoutubeUrl] = useState('');

  // Uploaded files survive reloads : the asset (name/type/size/base64) is
  // mirrored into IndexedDB session state.
  //
  // `uploadTouched` is the file-side twin of `sourceTouched`, and it is what
  // defect 41 needed. The hydration read below is async, and the guard the old
  // code used - "skip the write until the read completes" - covered only the
  // mount-time `null`: a file the LEARNER picked while the read was in flight had
  // its write dropped on the floor, and the read then ran `setUploadedFile`
  // unconditionally and replaced the fresh pick with the previous session's
  // upload. Both halves are fixed by recording the explicit action in a ref:
  // the ref is written synchronously by the setter, so it is already true when a
  // read that resolves a moment later checks it, and the persist effect below no
  // longer refuses to save a value the learner chose.
  const uploadTouched = useRef(false);
  const setUploadedFile = useCallback((file: UploadedFileAsset | null) => {
    uploadTouched.current = true;
    setStoredUploadedFile(file);
  }, []);

  /** True once the hydration read has settled - whether or not it found a file. */
  const hydratedRef = useRef(false);
  useEffect(() => {
    let cancelled = false;
    getSessionStateIDB<UploadedFileAsset | null>('last_upload').then((stored) => {
      if (cancelled) return;
      // The stored upload is restored only when the learner has not already
      // answered the same question with a pick of their own.
      if (!uploadTouched.current && stored && stored.base64Data) {
        setStoredUploadedFile(stored);
      }
      hydratedRef.current = true;
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    // The mount-time `null` is not a decision - writing it would delete the very
    // upload the read above is about to restore. Every other change is: a file
    // the learner picked (even one that beat the read) and a restored store both
    // persist here, so a pick is never left unsaved.
    if (!hydratedRef.current && !uploadTouched.current) return;
    if (uploadedFile) {
      void putSessionStateIDB('last_upload', uploadedFile);
    } else {
      void deleteSessionStateIDB('last_upload');
    }
  }, [uploadedFile]);

  // Feature Toggles
  const [enableDeepResearch, setEnableDeepResearch] = useState(true);
  const [enableGuidedPath, setEnableGuidedPath] = useState(false);
  const [strictnessLevel, setStrictnessLevel] = useState<StrictnessLevel>('feynman');
  const [interleaveMode, setInterleaveMode] = useState(false);
  // How deep this session goes. Remembered between sessions: your energy
  // pattern is stable across a semester, and re-picking it every time is its
  // own small friction.
  const [gear, setGear] = useState<EncodingGear>(2);
  // Mr M mode: the first-principles overlay on every stage. Defaults ON — it is
  // the learning style this tool was built around, and it is one pill to turn
  // off. Everything it adds is additive, so `off` means the app as it was.
  const [mrMMode, setMrMMode] = useState(true);

  // Hydrate last-used study prefs once on mount. localStorage cannot be read
  // during render without an SSR hydration mismatch, so syncing from this
  // external system inside an effect is the sanctioned pattern.
  /* eslint-disable react-hooks/set-state-in-effect -- hydration-safe localStorage sync; the rule does not model the external-system-on-mount exception */
  useEffect(() => {
    try {
      const prefs = loadStudyPrefs();
      if (!sourceTouched.current) setStoredActiveTab(prefs.activeTab);
      setEnableDeepResearch(prefs.enableDeepResearch);
      setEnableGuidedPath(prefs.enableGuidedPath);
      setStrictnessLevel(prefs.strictnessLevel);
      setGear(prefs.gear);
      setMrMMode(prefs.mrMMode);
    } catch {
      /* keep defaults */
    } finally {
      setPrefsLoaded(true);
    }
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Persist tab + toggles subtly whenever they change (after initial load)
  useEffect(() => {
    if (!prefsLoaded) return;
    saveStudyPrefs({ activeTab });
  }, [activeTab, prefsLoaded]);

  useEffect(() => {
    if (!prefsLoaded) return;
    saveStudyPrefs({ enableDeepResearch, enableGuidedPath, strictnessLevel, gear, mrMMode });
  }, [enableDeepResearch, enableGuidedPath, strictnessLevel, gear, mrMMode, prefsLoaded]);

  // Auto-detect massive text for Guided Path hint
  const wordCount = useMemo(() => {
    return rawNotes.trim() ? rawNotes.trim().split(/\s+/).length : 0;
  }, [rawNotes]);

  return {
    prefsLoaded,
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
    gear,
    setGear,
    mrMMode,
    setMrMMode,
    wordCount,
  };
}
