'use client';

import { useMemo, useState } from 'react';
import { UploadedFileAsset } from '@/lib/types';

export type InputSourceTab = 'text' | 'file' | 'youtube';
export type StrictnessLevel = 'sherpa' | 'feynman' | 'viva';

/**
 * Input-source state for the launchpad: raw notes, file uploads, YouTube URL,
 * generation feature toggles and derived helpers (word count for Guided Path).
 */
export function useInputSource() {
  const [activeTab, setActiveTab] = useState<InputSourceTab>('text');
  const [rawNotes, setRawNotes] = useState('');
  const [uploadedFile, setUploadedFile] = useState<UploadedFileAsset | null>(null);
  const [youtubeUrl, setYoutubeUrl] = useState('');

  // Feature Toggles
  const [enableDeepResearch, setEnableDeepResearch] = useState(true);
  const [enableGuidedPath, setEnableGuidedPath] = useState(false);
  const [strictnessLevel, setStrictnessLevel] = useState<StrictnessLevel>('feynman');
  const [interleaveMode, setInterleaveMode] = useState(false);

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
