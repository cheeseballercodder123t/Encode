'use client';

import React, { useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { AISettings, SegregationReport, UploadedFileAsset } from '@/lib/types';
import { BracketTag } from '@/components/ui/BracketTag';
import { playSound } from '@/lib/audio';
import {
  ForgeCoverageReport,
  ForgeExportTarget,
  ForgeSectionCounts,
  ForgeSourceKind,
  collectCardFronts,
  mergeAdditionalCards,
} from '@/lib/services/forge';
import { LiveForgeSource, readForgeResponse } from '@/lib/forge-stream';
import { extractSanitizedCardsFromSchema } from '@/lib/anki-exporter';
import {
  DeckMemorySyncResult,
  describeDeckMemorySync,
  syncDeckMemoryWithCloud,
} from '@/lib/deck-memory-cloud';
import { useAuth } from '@/lib/auth-context';
import type { Contradiction } from '@/lib/services/contradiction';
import { MEDIA_ACCEPT_ATTRIBUTE, isTranscribableMedia } from '@/lib/media-types';
import {
  DeckDiff,
  DeckMemorySource,
  deckSourceKey,
  diffReportAgainstMemory,
  forgedSourceLedger,
  forgetDeckMemory,
  keepOnlyFreshCards,
  knownKeysForTopic,
  recordDeckExport,
  recordDeckSources,
  reportCardKeys,
} from '@/lib/deck-memory';
import { generateSegregationRemnote } from '@/lib/remnote';
import { AnkiDeckRead, describeAnkiRead, syncDeckMemoryFromAnki } from '@/lib/anki-memory';
import {
  ForgeRecipe,
  buildForgeRecipe,
  deleteForgeRecipe,
  describeForgeRecipe,
  loadForgeRecipes,
  markForgeRecipeRun,
  saveForgeRecipe,
} from '@/lib/forge-recipes';
import { useModalA11y } from '@/hooks/useModalA11y';

export type { ForgeExportTarget };

/**
 * The Forge: skip the workout, get the deck.
 *
 * Every other entry point in this app teaches first — paradox, thought
 * experiment, mechanism in your own words — and treats flashcards as the fossil
 * record of that. Sometimes that is not what you want: you have four PDFs, two
 * lectures and an exam on Friday, and you want the cards. This modal takes as
 * many sources as you can throw at it, asks where the deck should go, and never
 * creates a stage, a session or an XP bar.
 *
 * It also does the three things a repeat ingest needs: songs you already know
 * (deck memory says `4 new · 12 already in your deck`), sources that disagree
 * (an explicit conflict card instead of whichever claim arrived first), and the
 * same setup next Monday (recipes).
 */

interface ForgeSourceDraft {
  id: string;
  kind: ForgeSourceKind;
  label: string;
  notes?: string;
  url?: string;
  /** True for an uploaded recording, which the server transcribes. */
  media?: boolean;
  file?: UploadedFileAsset | null;
}

interface ForgeSourceOutcome {
  id: string;
  label: string;
  kind: ForgeSourceKind;
  status: 'ok' | 'failed';
  counts: ForgeSectionCounts;
  note?: string;
  /** The source's words, when the route counted them. */
  words?: number;
  /** Words-in → cards-out sanity check (see lib/services/forge.ts). */
  yield?: { verdict: 'healthy' | 'thin' | 'silent' | 'unknown'; expected: number; note?: string };
}

interface FlashcardForgeModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AISettings;
  /** Hands the merged deck to the export surface the learner chose. */
  onDeckReady: (report: SegregationReport, target: ForgeExportTarget) => void;
}

const SECTIONS: { id: keyof ForgeSectionCounts; label: string; blurb: string }[] = [
  { id: 'facts', label: 'FACTS', blurb: 'Atomic cloze cards: dates, constants, formulas, definitions' },
  { id: 'mechanisms', label: 'MECHANISMS', blurb: '4-quadrant concept cards with the lookalike trap' },
  { id: 'drills', label: 'DRILLS', blurb: 'Rapid-fire Q/A, answerable in ~10 seconds' },
  { id: 'examples', label: 'EXAMPLES', blurb: 'Worked examples, one card per step' },
];

const TARGETS: { id: ForgeExportTarget; label: string; blurb: string }[] = [
  { id: 'anki', label: 'ANKI', blurb: '.apkg / .txt deck, Wozniak-enforced' },
  { id: 'remnote', label: 'REMNOTE', blurb: 'Hierarchical markdown, cloze + descriptors' },
  { id: 'both', label: 'BOTH', blurb: 'Open Anki first, RemNote next' },
];

const MAX_SOURCES = 12;
/** Mirrors SOURCE_CONCURRENCY in the route, shown in the pre-flight estimate. */
const SOURCE_CONCURRENCY_UI = 3;
const FILE_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/gif',
];
const MEDIA_TYPES = [
  'audio/mpeg',
  'audio/mp3',
  'audio/mp4',
  'audio/m4a',
  'audio/x-m4a',
  'audio/wav',
  'audio/x-wav',
  'audio/ogg',
  'audio/webm',
  'audio/flac',
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/x-matroska',
];

export function FlashcardForgeModal({ isOpen, onClose, settings, onDeckReady }: FlashcardForgeModalProps) {
  const [sources, setSources] = useState<ForgeSourceDraft[]>([]);
  const [draftText, setDraftText] = useState('');
  const [draftUrl, setDraftUrl] = useState('');
  const [sections, setSections] = useState<Record<keyof ForgeSectionCounts, boolean>>({
    facts: true,
    mechanisms: true,
    drills: true,
    examples: true,
  });
  const [target, setTarget] = useState<ForgeExportTarget>('anki');
  const [phase, setPhase] = useState<'setup' | 'forging' | 'done'>('setup');
  const [error, setError] = useState('');
  const [outcomes, setOutcomes] = useState<ForgeSourceOutcome[]>([]);
  const [merged, setMerged] = useState<SegregationReport | null>(null);
  const [mergeNote, setMergeNote] = useState('');
  const [contradictions, setContradictions] = useState<Contradiction[]>([]);
  const [diff, setDiff] = useState<DeckDiff | null>(null);
  const [skipKnown, setSkipKnown] = useState(false);
  /** What the real Anki deck said, when AnkiConnect answered. */
  const [ankiRead, setAnkiRead] = useState<AnkiDeckRead | null>(null);
  const [checkingAnki, setCheckingAnki] = useState(false);
  const [recipes, setRecipes] = useState<ForgeRecipe[]>([]);
  const [showRecipes, setShowRecipes] = useState(false);
  const [recipeName, setRecipeName] = useState('');
  const [recipeNote, setRecipeNote] = useState('');
  const [missingFiles, setMissingFiles] = useState<string[]>([]);
  /** Transcripts this session already paid for, so "more" never re-buys them. */
  const [resolved, setResolved] = useState<{ id: string; label?: string; notes: string }[]>([]);
  /** What the last "more" / "condense" pass did, under the deck summary. */
  const [deckNote, setDeckNote] = useState('');
  const [deckNoteError, setDeckNoteError] = useState(false);
  const [deckBusy, setDeckBusy] = useState<'' | 'more' | 'condense'>('');
  /** Sources finished so far, streamed in while the rest are still running. */
  const [liveSources, setLiveSources] = useState<LiveForgeSource[]>([]);
  /** Sources a worker has picked up but not finished. */
  const [liveRunning, setLiveRunning] = useState<string[]>([]);
  const [forgePhase, setForgePhase] = useState('');
  /** Which requested sections actually received cards — and which came back empty. */
  const [coverage, setCoverage] = useState<ForgeCoverageReport | null>(null);
  /**
   * One-step back for the deck. "Generate more" and "condense" are one-way
   * operations on the deck on screen, and a condense pass the learner changes
   * their mind about should not cost a full re-forge to undo.
   */
  const [deckHistory, setDeckHistory] = useState<SegregationReport[]>([]);
  /** "Generate more" as a loop with a target number of cards. */
  const [moreTarget, setMoreTarget] = useState(60);
  const [loopRunning, setLoopRunning] = useState(false);
  const [loopNote, setLoopNote] = useState('');
  const stopLoopRef = useRef(false);
  /** The account's copy of the deck memory, when there is one. */
  const [memorySync, setMemorySync] = useState<DeckMemorySyncResult | null>(null);
  const [memorySyncing, setMemorySyncing] = useState(false);
  /** Bumped when this session writes to the memory, so the panel re-reads it. */
  const [memoryVersion, setMemoryVersion] = useState(0);
  /**
   * Source ids the learner has chosen to leave out of the next pass.
   *
   * Deck memory knows which sources have already been cut into this app's
   * decks, so a re-ingest can say so BEFORE it spends a model call — but it
   * never silently drops a source the learner put in the list: the skip is
   * offered, counted, and reversible.
   */
  const [skippedSources, setSkippedSources] = useState<string[]>([]);
  const { user } = useAuth();
  const nextId = useRef(1);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const idFor = (prefix: string) => `${prefix}_${nextId.current++}`;
  const sectionList = useMemo(
    () => SECTIONS.filter((s) => sections[s.id]).map((s) => s.id),
    [sections]
  );

  /**
   * What the Wozniak pass does to this deck, computed HERE rather than only at
   * export time. The forge already promises that cards go through the 1-idea
   * rule, two-way cloze symmetry and the 20-word ceiling; a promise like that
   * belongs next to the card count, not three clicks later behind an export
   * button. (The pass is deterministic and offline, so this is the real number,
   * not an estimate.)
   */
  const wozniak = useMemo(
    () => (merged ? extractSanitizedCardsFromSchema(null, merged) : null),
    [merged]
  );

  /**
   * The sources in this run — everything the learner added, minus anything they
   * chose to skip. Every path (forge, "generate more", a retry) cuts from here,
   * so a skipped lecture is not quietly re-bought by the next pass.
   */
  const activeSources = useMemo(
    () => sources.filter((s) => !skippedSources.includes(s.id)),
    [sources, skippedSources]
  );

  /**
   * Pre-flight cost estimate, so a twelve-source ingest is a decision rather
   * than a surprise: one model call per source that has to be cut, plus the
   * transcription a video without captions or a recording may need.
   */
  const preflight = useMemo(() => {
    const needsAudio = activeSources.filter(
      (s) => s.kind === 'youtube' || (s.kind === 'file' && s.media)
    ).length;
    return { calls: activeSources.length, needsAudio };
  }, [activeSources]);

  /**
   * Sources this app has already cut into cards, matched against the setup.
   *
   * The card memory answers "have I shipped this card" after the fact; this
   * answers "have I already paid for this lecture" before it, which is the only
   * version of the question that can save money. It reads across topics because
   * the deck has no topic until the merge produces one.
   */
  const forgedBefore = useMemo(() => {
    // Read through the version counter: the store is localStorage, so a forge
    // that just wrote to it changes nothing this component can observe.
    void memoryVersion;
    const ledger = forgedSourceLedger();
    const found = new Map<string, DeckMemorySource & { topic: string }>();
    for (const source of sources) {
      const hit = ledger.get(deckSourceKey(source));
      if (hit) found.set(source.id, hit);
    }
    return found;
  }, [sources, memoryVersion]);

  /** What the Wozniak pass leaves, and which fronts can only be asked one way. */
  const frontQuality = useMemo(
    () => (merged ? generateSegregationRemnote(merged).frontQuality || null : null),
    [merged]
  );



  const resetTransient = () => {
    setPhase('setup');
    setError('');
    setOutcomes([]);
    setMerged(null);
    setMergeNote('');
    setContradictions([]);
    setDiff(null);
    setSkipKnown(false);
    setAnkiRead(null);
    setCheckingAnki(false);
    setRecipeNote('');
    setMissingFiles([]);
    setResolved([]);
    setDeckNote('');
    setDeckNoteError(false);
    setDeckBusy('');
    setLiveSources([]);
    setLiveRunning([]);
    setForgePhase('');
    setCoverage(null);
    setDeckHistory([]);
    setLoopRunning(false);
    setLoopNote('');
    stopLoopRef.current = false;
    setMemorySync(null);
    setMemorySyncing(false);
    // A reopened sheet starts from "use everything you added": the skips were a
    // decision about one run, not a setting.
    setSkippedSources([]);
  };

  const handleClose = () => {
    onClose();
    resetTransient();
  };

  // Esc closes, the page behind stops scrolling, focus moves in and back out.
  const sheetRef = useModalA11y(isOpen, handleClose);

  if (!isOpen) return null;

  const addText = () => {
    const text = draftText.trim();
    if (!text) return;
    playSound('click');
    setSources((prev) => [
      ...prev.slice(0, MAX_SOURCES - 1),
      {
        id: idFor('text'),
        kind: 'text',
        label: `${text.slice(0, 42).replace(/\s+/g, ' ')}${text.length > 42 ? '…' : ''}`,
        notes: text,
      },
    ]);
    setDraftText('');
  };

  const addVideos = () => {
    const urls = draftUrl
      .split(/[\s,]+/)
      .map((u) => u.trim())
      .filter(Boolean);
    if (urls.length === 0) return;
    playSound('click');
    setSources((prev) => [
      ...prev,
      ...urls.slice(0, MAX_SOURCES - prev.length).map((url) => ({
        id: idFor('yt'),
        kind: 'youtube' as ForgeSourceKind,
        label: url,
        url,
      })),
    ]);
    setDraftUrl('');
  };

  const addFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setError('');
    Array.from(files)
      .slice(0, MAX_SOURCES)
      .forEach((file) => {
        const isMedia =
          MEDIA_TYPES.includes(file.type) || isTranscribableMedia(file.type, file.name);
        if (!isMedia && !FILE_TYPES.includes(file.type)) {
          setError('Only PDFs, images (PNG/JPEG/WebP) and audio/video recordings can be forged.');
          return;
        }
        if (file.size > 15 * 1024 * 1024) {
          setError(`${file.name} is over 15MB.`);
          return;
        }
        const reader = new FileReader();
        reader.onload = (e) => {
          const result = e.target?.result as string;
          if (!result) return;
          const base64Data = result.split(',')[1];
          const asset: UploadedFileAsset = {
            name: file.name,
            type: file.type,
            size: file.size,
            base64Data,
            previewUrl: file.type.startsWith('image/') ? result : undefined,
          };
          setSources((prev) =>
            prev.length >= MAX_SOURCES
              ? prev
              : [
                  ...prev,
                  {
                    id: idFor(isMedia ? 'media' : 'file'),
                    kind: 'file' as ForgeSourceKind,
                    label: file.name,
                    media: isMedia,
                    file: asset,
                  },
                ]
          );
          playSound('pop');
        };
        reader.readAsDataURL(file);
      });
  };

  const removeSource = (id: string) => {
    playSound('click');
    setSources((prev) => prev.filter((s) => s.id !== id));
  };

  /** Where a draft source goes on the wire. */
  const sourcePayloadFor = (s: ForgeSourceDraft) => ({
    id: s.id,
    kind: s.kind,
    label: s.label,
    notes: s.notes,
    url: s.url,
    file: s.file ? { name: s.file.name, type: s.file.type, base64Data: s.file.base64Data } : null,
  });

  const deckCount = (report: SegregationReport) =>
    report.declarativeFacts.length +
    report.conceptualMechanisms.length +
    (report.practiceQuestions?.length || 0) +
    (report.workedExamples?.length || 0);

  const noteDeck = (text: string, isError = false) => {
    setDeckNoteError(isError);
    setDeckNote(text);
  };

  /**
   * Re-reads what this topic has already shipped. Every mutation of the deck —
   * a forge, a "more" pass, a condense — has to re-diff, or the export would
   * offer the stale "already in your deck" counts of cards that are no longer
   * there (or miss the ones that just arrived).
   */
  const refreshMemory = (report: SegregationReport, choice: 'reset' | 'keep') => {
    const nextDiff = diffReportAgainstMemory(report, knownKeysForTopic(report.topic));
    setDiff(nextDiff);
    setSkipKnown((prev) => (choice === 'reset' ? nextDiff.known > 0 : prev && nextDiff.known > 0));
    return nextDiff;
  };

  const runForge = async (sourceList: ForgeSourceDraft[], wanted: string[]) => {
    if (sourceList.length === 0 || wanted.length === 0) return;
    playSound('click');
    setPhase('forging');
    setError('');
    setOutcomes([]);
    setMerged(null);
    setContradictions([]);
    setDiff(null);
    setLiveSources([]);
    setLiveRunning([]);
    setForgePhase('');
    try {
      // Streamed: the route cuts three sources at a time and reports each one
      // the moment it lands, so a twelve-source ingest fills the log in as it
      // goes instead of showing a blank panel until the last one finishes.
      const res = await fetch('/api/forge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sources: sourceList.map(sourcePayloadFor),
          include: wanted,
          settings,
          stream: true,
        }),
      });
      const data = await readForgeResponse(res, {
        onPhase: setForgePhase,
        onSourceStart: (id) => setLiveRunning((prev) => (prev.includes(id) ? prev : [...prev, id])),
        onSource: (source) => {
          setLiveRunning((prev) => prev.filter((id) => id !== source.id));
          setLiveSources((prev) => [...prev.filter((row) => row.id !== source.id), source]);
        },
      });
      const report: SegregationReport | null = data.report || null;
      setOutcomes(Array.isArray(data.sources) ? data.sources : []);
      setMerged(report);
      setDeckHistory([]);
      setCoverage(data.coverage || null);
      setResolved(
        Array.isArray(data.resolved)
          ? data.resolved.filter((r: any) => r && typeof r.id === 'string' && typeof r.notes === 'string')
          : []
      );
      noteDeck('');
      setContradictions(Array.isArray(data.contradictions) ? data.contradictions : []);
      setMergeNote(
        `${data.total ?? 0} card${data.total === 1 ? '' : 's'} forged${data.dropped ? ` · ${data.dropped} duplicate${data.dropped === 1 ? '' : 's'} dropped` : ''}`
      );
      // Deck memory: what has this topic already shipped? The learner decides
      // whether the deck goes out whole or only the cards that are new. The
      // local answer lands instantly; the real Anki deck and the account's copy
      // refine it a moment later (see checkAnkiDeck / syncCloudMemory) without
      // ever blocking the result.
      if (report) {
        refreshMemory(report, 'reset');
        setAnkiRead(null);
        void syncCloudMemory(report);
        void checkAnkiDeck(report, true);
        // Remember WHICH sources this deck was built from. Next Monday the same
        // lecture can be skipped before it costs a model call, instead of being
        // re-cut and then diffed back out as "already in your deck".
        rememberForgedSources(report.topic, Array.isArray(data.sources) ? data.sources : []);
      }
      setPhase('done');
      playSound('success');
    } catch (err: any) {
      setPhase('setup');
      setError(err?.message || 'The forge failed. Try again.');
    } finally {
      setForgePhase('');
      setLiveRunning([]);
    }
  };

  const handleForge = () => runForge(activeSources, sectionList);

  /**
   * Asks the real Anki collection what this topic already holds and folds those
   * card fronts into the memory, so a deck built before this app existed (or a
   * card edited in Anki since) is counted as already yours instead of coming
   * back as new. Advisory by design: with Anki closed the local diff stands and
   * the panel says the memory was not verified.
   */
  const checkAnkiDeck = async (report: SegregationReport, resetChoice = false) => {
    setCheckingAnki(true);
    try {
      const result = await syncDeckMemoryFromAnki(report.topic);
      setAnkiRead(result);
      // A fresh forge defaults to "only the new cards"; a manual re-check never
      // overrides the learner's own choice.
      refreshMemory(report, resetChoice ? 'reset' : 'keep');
    } catch {
      setAnkiRead({ ok: false, decks: [], notes: 0, keys: [], error: 'The Anki deck could not be read.' });
    } finally {
      setCheckingAnki(false);
    }
  };

  /**
   * The account's copy of the deck memory. The local store already answers the
   * question on this device; this is what makes the answer true on the next
   * one. Advisory like the rest of the memory: a failure just means the panel
   * says the cloud copy was not reached.
   */
  const syncCloudMemory = async (report: SegregationReport) => {
    if (!user) {
      setMemorySync({ ok: false, topics: 0, changed: false, pushed: false, error: 'Not signed in.' });
      return;
    }
    setMemorySyncing(true);
    try {
      const result = await syncDeckMemoryWithCloud(user.uid);
      setMemorySync(result);
      // The account may know about cards this device did not: re-diff so the
      // "already in your deck" count reflects everything, not just this laptop.
      if (result.ok && result.changed) refreshMemory(report, 'keep');
    } finally {
      setMemorySyncing(false);
    }
  };

  /** One step back: every reshape of the deck pushes the deck it replaced. */
  /**
   * Writes the sources that were actually cut into the memory's source ledger.
   * Only sources the route reported on are recorded, so a source that failed
   * before the model saw it does not come back as "already forged".
   */
  const rememberForgedSources = (
    topic: string,
    cut: { id: string; label?: string; counts?: ForgeSectionCounts }[]
  ) => {
    const drafts = new Map(sources.map((s) => [s.id, s]));
    const entries: { key: string; label: string; cards: number }[] = [];
    for (const source of cut) {
      const draft = drafts.get(source.id);
      if (!draft) continue;
      const counts = source.counts;
      entries.push({
        key: deckSourceKey(draft),
        label: draft.label || source.label || '',
        cards: counts ? counts.facts + counts.mechanisms + counts.drills + counts.examples : 0,
      });
    }
    if (entries.length === 0) return;
    recordDeckSources({ topic, sources: entries });
    setMemoryVersion((version) => version + 1);
  };

  const toggleSourceSkip = (id: string) => {
    playSound('click');
    setSkippedSources((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const pushDeckHistory = (deck: SegregationReport) => {
    setDeckHistory((prev) => [...prev.slice(-9), deck]);
  };

  const undoDeck = () => {
    const previous = deckHistory[deckHistory.length - 1];
    if (!previous) return;
    playSound('click');
    setDeckHistory((prev) => prev.slice(0, -1));
    setMerged(previous);
    refreshMemory(previous, 'keep');
    noteDeck(`Undone — the deck is back to ${deckCount(previous)} cards.`);
  };

  const deckSize =
    (merged?.declarativeFacts.length || 0) +
    (merged?.conceptualMechanisms.length || 0) +
    (merged?.practiceQuestions?.length || 0) +
    (merged?.workedExamples?.length || 0);
  const emptyDeck = deckSize === 0;
  const shipsOnlyFresh = skipKnown && (diff?.known || 0) > 0;
  const shippingCount = shipsOnlyFresh ? diff?.fresh ?? deckSize : deckSize;

  /**
   * One "more" batch on the wire.
   *
   * `only` turns it into a RETRY: the same request, restricted to the sources
   * the learner named, so a single failed source can be re-forged without
   * re-running (or re-paying for) the sources that already worked. Transcripts
   * resolved for the first forge ride along either way, so a lecture recording
   * is never transcribed twice.
   *
   * `include` is aimed at the coverage gaps when there are any: if the model
   * returned no drills, asking it again for "everything" mostly re-earns the
   * facts it already gave. Asking for the empty section is what fills it.
   */
  const fetchMoreBatch = async (
    only?: string[],
    /**
     * The grow loop's view of the deck, not this render's.
     *
     * A batch that appends cards leaves `merged` stale for the rest of the
     * loop, and a do-not-repeat list frozen at the pre-loop deck is exactly how
     * a loop talks itself into stopping early: the model is never told about
     * the cards the last batch just added, so it offers them again, and the
     * merge drops every one — two of those in a row and the loop declares the
     * sources exhausted while they still had material left.
     */
    fresh: { existing?: string[]; include?: string[] } = {}
  ): Promise<{ addition: SegregationReport | null; dropped: number; coverage: ForgeCoverageReport | null }> => {
    if (!merged) return { addition: null, dropped: 0, coverage: null };
    const existing = fresh.existing ?? collectCardFronts(merged);
    const targets =
      fresh.include ?? (!only && coverage && coverage.gaps.length > 0 ? coverage.gaps : sectionList);
    // A retry names its source explicitly, so it is sent even if that source is
    // currently skipped: the learner asked for THAT one, not for the batch.
    const payloadSources = only ? sources.filter((s) => only.includes(s.id)) : activeSources;
    const res = await fetch('/api/forge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: only ? 'retry' : 'more',
        only,
        sources: payloadSources.map(sourcePayloadFor),
        resolved,
        existing,
        include: targets,
        settings,
        stream: true,
      }),
    });
    const data = await readForgeResponse(res, {
      onPhase: setForgePhase,
      onSourceStart: (id) => setLiveRunning((prev) => (prev.includes(id) ? prev : [...prev, id])),
      onSource: (source) => {
        setLiveRunning((prev) => prev.filter((id) => id !== source.id));
        setLiveSources((prev) => [...prev.filter((row) => row.id !== source.id), source]);
      },
    });

    const freshCoverage = (data?.coverage as ForgeCoverageReport | undefined) || null;
    if (freshCoverage) setCoverage(freshCoverage);
    // A retry rewrites just that row of the source log: the source that failed
    // is no longer a failure, and its note says what it finally contributed.
    if (only && Array.isArray(data?.sources)) {
      setOutcomes((prev) =>
        prev.map((row) => {
          if (!only.includes(row.id)) return row;
          const retried = (data.sources as any[]).find((s) => s && s.id === row.id);
          if (!retried) return row;
          return {
            ...row,
            status: retried.status === 'ok' ? ('ok' as const) : row.status,
            counts: retried.counts || row.counts,
            note: retried.note || 're-forged',
          };
        })
      );
    }

    return {
      addition: (data?.report as SegregationReport) || null,
      dropped: Number(data?.dropped) || 0,
      coverage: freshCoverage,
    };
  };

  /**
   * "Keep going until the deck is actually big enough."
   *
   * One batch is a guess at how much is missing; this is the loop that stops
   * when it is done rather than when the learner gives up clicking. It stops
   * on the target, on the Stop button, or after TWO consecutive batches that
   * came back empty — because at that point the model is telling us the source
   * material has no more testable items in it, and a third call would only
   * invent cards. The count updates live.
   */
  const runMoreLoop = async () => {
    if (!merged || deckBusy !== '' || loopRunning) return;
    const target = Math.max(0, Math.floor(moreTarget));
    let deck = merged;
    if (target <= deckCount(deck)) {
      setLoopNote(`The deck already holds ${deckCount(deck)} cards — raise the target to keep going.`);
      return;
    }

    playSound('click');
    stopLoopRef.current = false;
    setLoopRunning(true);
    setLoopNote(`${deckCount(deck)} / ${target} cards…`);
    noteDeck('');
    let emptyBatches = 0;
    let batches = 0;
    let added = 0;
    // Aim every batch at whatever is STILL missing, read off the last response
    // rather than the coverage the loop walked in with.
    let include = coverage && coverage.gaps.length > 0 ? coverage.gaps : sectionList;

    try {
      while (deckCount(deck) < target && emptyBatches < 2 && !stopLoopRef.current) {
        setDeckBusy('more');
        const { addition, coverage: batchCoverage } = await fetchMoreBatch(undefined, {
          existing: collectCardFronts(deck),
          include,
        });
        if (batchCoverage) include = batchCoverage.gaps.length > 0 ? batchCoverage.gaps : sectionList;
        batches += 1;
        if (!addition) {
          emptyBatches += 1;
          setLoopNote(`Batch ${batches} returned nothing (${emptyBatches} of 2 empty — the loop stops at two).`);
          continue;
        }
        const next = mergeAdditionalCards(deck, addition);
        if (next.added === 0) {
          emptyBatches += 1;
          setLoopNote(`Batch ${batches} had no new cards (${emptyBatches} of 2 empty — the loop stops at two).`);
          continue;
        }
        pushDeckHistory(deck);
        deck = next.report;
        added += next.added;
        emptyBatches = 0;
        setMerged(deck);
        refreshMemory(deck, 'keep');
        setLoopNote(`${deckCount(deck)} / ${target} cards · ${batches} extra batch${batches === 1 ? '' : 'es'} · +${added}`);
      }
    } catch (err: any) {
      setLoopNote(err?.message || 'The grow loop stopped — the deck on screen is intact.');
    } finally {
      setDeckBusy('');
      setLoopRunning(false);
      setForgePhase('');
      setLiveSources([]);
      setLiveRunning([]);
    }

    const reached = deckCount(deck) >= target;
    setLoopNote(
      reached
        ? `Target reached: ${deckCount(deck)} cards (+${added} across ${batches} extra batch${batches === 1 ? '' : 'es'}).`
        : stopLoopRef.current
          ? `Stopped at ${deckCount(deck)} cards (+${added}).`
          : `Sources are exhausted at ${deckCount(deck)} cards (+${added}) — two batches came back with nothing new. Add another source to keep going.`
    );
    if (added > 0) playSound('success');
  };

  /** Re-forge ONE failed source, leaving the sources that worked alone. */
  const handleRetrySource = async (id: string) => {
    if (!merged || deckBusy !== '' || loopRunning) return;
    const row = outcomes.find((o) => o.id === id);
    playSound('click');
    setDeckBusy('more');
    setLiveSources([]);
    setLiveRunning([]);
    noteDeck(`Retrying ${row?.label || 'that source'}…`);
    try {
      const { addition } = await fetchMoreBatch([id]);
      if (!addition) throw new Error('That source returned nothing again — the reason is in its row.');
      const next = mergeAdditionalCards(merged, addition);
      if (next.added === 0) {
        noteDeck(`Retrying ${row?.label || 'that source'} produced no new cards — the deck already covers it.`);
        return;
      }
      pushDeckHistory(merged);
      setMerged(next.report);
      refreshMemory(next.report, 'keep');
      noteDeck(`Retried ${row?.label || 'the source'}: +${next.added} card${next.added === 1 ? '' : 's'} — the deck now holds ${deckCount(next.report)}.`);
      playSound('success');
    } catch (err: any) {
      noteDeck(err?.message || 'Retrying that source failed.', true);
    } finally {
      setDeckBusy('');
      setForgePhase('');
      setLiveSources([]);
      setLiveRunning([]);
    }
  };

  /**
   * "That is not enough cards." Re-runs the SAME sources, but the prompt is
   * handed every card already in the deck and the batch is deduped against it,
   * so this can only ever ADD cards — it can never quietly re-ship the deck you
   * already have. Transcripts resolved for the first forge are reused, so a
   * lecture recording is never transcribed (or paid for) twice.
   */
  const handleGenerateMore = async () => {
    const base = merged;
    if (!base || deckBusy !== '') return;
    playSound('click');
    setDeckBusy('more');
    noteDeck('');
    setLiveSources([]);
    setLiveRunning([]);
    try {
      const { addition } = await fetchMoreBatch();
      if (!addition) {
        noteDeck('The model returned no additional cards.');
        return;
      }
      const next = mergeAdditionalCards(base, addition);
      if (next.added === 0) {
        noteDeck(
          'Nothing new came back — the model found no testable item in these sources that the deck does not already cover. Add another source, or turn on more card sections.'
        );
        return;
      }
      pushDeckHistory(base);
      setMerged(next.report);
      refreshMemory(next.report, 'keep');
      noteDeck(
        `+${next.added} more card${next.added === 1 ? '' : 's'}${
          next.dropped > 0 ? ` (${next.dropped} repeat${next.dropped === 1 ? '' : 's'} dropped)` : ''
        } — the deck now holds ${deckCount(next.report)}.`
      );
      playSound('success');
    } catch (err: any) {
      noteDeck(err?.message || 'Adding more cards failed.', true);
    } finally {
      setDeckBusy('');
      setForgePhase('');
      setLiveSources([]);
      setLiveRunning([]);
    }
  };

  /**
   * "That is too many cards." One editor pass folds overlapping cards into
   * fewer, denser ones. It can only ever shorten the deck, and a pass that
   * finds no real overlap leaves the deck exactly as it was.
   */
  const handleCondense = async () => {
    const base = merged;
    if (!base || deckBusy !== '') return;
    playSound('click');
    setDeckBusy('condense');
    noteDeck('');
    try {
      const before = deckCount(base);
      const res = await fetch('/api/forge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'condense', report: base, settings }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'The condense pass failed; your deck is unchanged.');
      const condensed: SegregationReport | null = data.report || null;
      if (!condensed) throw new Error('The condense pass returned nothing; your deck is unchanged.');

      const after = deckCount(condensed);
      if (after >= before) {
        noteDeck(`No overlap left to fold — the deck is already lean at ${before} cards.`);
        return;
      }
      // The condensed deck keeps the topic it came from, so deck memory and the
      // export still recognise it as the same topic.
      const nextDeck: SegregationReport = { ...condensed, topic: base.topic || condensed.topic };
      // One step back: folding a deck the learner disagrees with must not cost
      // a full re-forge.
      pushDeckHistory(base);
      setMerged(nextDeck);
      // The conflict panel quoted cards that may have just been merged away.
      setContradictions([]);
      refreshMemory(nextDeck, 'keep');
      noteDeck(`Condensed ${before} → ${after} card${after === 1 ? '' : 's'}.`);
      playSound('success');
    } catch (err: any) {
      noteDeck(err?.message || 'Condensing failed; your deck is unchanged.', true);
    } finally {
      setDeckBusy('');
    }
  };

  const sendToExport = (which: ForgeExportTarget) => {
    if (!merged) return;
    playSound('success');
    const report = shipsOnlyFresh && diff ? keepOnlyFreshCards(merged, diff.freshIds) : merged;
    // Remember what actually shipped, so next week's forge can say so — on this
    // device, and (when signed in) on the account, so the next machine knows.
    recordDeckExport({ topic: report.topic, keys: reportCardKeys(report), surface: which });
    void syncDeckMemoryWithCloud(user?.uid || null);
    onClose();
    resetTransient();
    onDeckReady(report, which);
  };

  const handleForgetMemory = () => {
    if (!merged) return;
    playSound('click');
    forgetDeckMemory(merged.topic);
    setDiff({ freshIds: [], knownIds: [], fresh: deckSize, known: 0 });
    setSkipKnown(false);
    setAnkiRead(null);
    setRecipeNote(`Deck memory for "${merged.topic}" cleared.`);
  };

  const openRecipes = () => {
    playSound('click');
    const next = !showRecipes;
    setShowRecipes(next);
    if (next) setRecipes(loadForgeRecipes());
  };

  const handleSaveRecipe = () => {
    if (sources.length === 0) {
      setRecipeNote('Add at least one source before saving a recipe.');
      return;
    }
    const name = recipeName.trim() || `${sources.length}-source forge`;
    const draft = {
      name,
      sections: sectionList,
      target,
      sources: sources.map((s) => ({ kind: s.kind, label: s.label, notes: s.notes, url: s.url })),
    };
    const existing = recipes.find((r) => r.name.toLowerCase() === name.toLowerCase()) || null;
    const recipe = buildForgeRecipe(draft, existing);
    if (!recipe) {
      setRecipeNote('That setup cannot be saved as a recipe.');
      return;
    }
    setRecipes(saveForgeRecipe(recipe));
    setRecipeName('');
    playSound('success');
    setRecipeNote(
      recipe.fileNames.length > 0
        ? `Saved "${recipe.name}". ${recipe.fileNames.length} file(s) will have to be re-attached when you run it.`
        : `Saved "${recipe.name}".`
    );
  };

  const handleLoadRecipe = (recipe: ForgeRecipe, run: boolean) => {
    playSound('click');
    const loaded: ForgeSourceDraft[] = recipe.sources
      .filter((s) => s.kind !== 'file')
      .map((s) => ({
        id: idFor(s.kind === 'youtube' ? 'yt' : 'text'),
        kind: s.kind,
        label: s.label,
        notes: s.notes,
        url: s.url,
      }));
    const nextSections: Record<keyof ForgeSectionCounts, boolean> = {
      facts: recipe.sections.includes('facts'),
      mechanisms: recipe.sections.includes('mechanisms'),
      drills: recipe.sections.includes('drills'),
      examples: recipe.sections.includes('examples'),
    };
    const wanted = SECTIONS.filter((s) => nextSections[s.id]).map((s) => s.id);

    setSources(loaded);
    setSections(nextSections);
    setTarget(recipe.target);
    setMissingFiles(recipe.fileNames);
    setRecipeNote(
      recipe.fileNames.length > 0
        ? `Loaded "${recipe.name}" — re-attach ${recipe.fileNames.join(', ')} before forging.`
        : `Loaded "${recipe.name}".`
    );
    if (run) setRecipes(markForgeRecipeRun(recipe.id));

    if (run && loaded.length > 0) void runForge(loaded, wanted);
  };

  const handleDeleteRecipe = (recipe: ForgeRecipe) => {
    playSound('click');
    setRecipes(deleteForgeRecipe(recipe.id));
    setRecipeNote(`Deleted "${recipe.name}".`);
  };

  const renderSourceRow = (source: ForgeSourceDraft) => {
    const forged = forgedBefore.get(source.id);
    const skipped = skippedSources.includes(source.id);
    return (
    <div
      key={source.id}
      className={`flex items-center gap-2 p-2 bg-deck border ${
        skipped ? 'border-edge/40 opacity-60' : forged ? 'border-gilt/40' : 'border-edge/40'
      }`}
    >
      <span className="text-[10px] font-mono font-bold text-amber uppercase tracking-wider shrink-0">
        [ {source.kind === 'youtube' ? 'YT' : source.kind === 'file' ? (source.media ? 'AUDIO' : 'FILE') : 'TEXT'} ]
      </span>
      <span className={`min-w-0 flex-1 text-[11px] font-mono truncate ${skipped ? 'text-solder line-through' : 'text-bone'}`}>
        {source.label}
      </span>
      {/* Already cut into a deck before: the count and the topic it landed in,
          so "skip this" is an informed click rather than a guess. */}
      {forged && (
        <span
          data-testid={`forge-forged-${source.id}`}
          title={`Already forged into "${forged.topic}" — ${forged.cards} card${forged.cards === 1 ? '' : 's'} on ${new Date(forged.at).toLocaleDateString()}`}
          className="shrink-0 px-1.5 py-0.5 text-[9px] font-mono font-bold uppercase border border-gilt/50 text-amber"
        >
          [ FORGED × {forged.cards} ]
        </span>
      )}
      <span className="text-[10px] font-mono text-solder shrink-0">
        {source.kind === 'text'
          ? `${(source.notes || '').split(/\s+/).filter(Boolean).length} words`
          : source.kind === 'file'
            ? source.media
              ? 'transcribed'
              : `${Math.round((source.file?.size || 0) / 1024)} KB`
            : 'captions / audio'}
      </span>
      {forged && (
        <button
          type="button"
          data-testid={`forge-skip-${source.id}`}
          onClick={() => toggleSourceSkip(source.id)}
          aria-pressed={skipped}
          title={skipped ? 'Include this source in the next pass' : 'Leave this source out — you have already cut it'}
          className="shrink-0 px-2 py-1 bg-chassis border border-edge text-solder hover:text-amber text-[10px] font-mono font-bold cursor-pointer"
        >
          {skipped ? '[ USE ]' : '[ SKIP ]'}
        </button>
      )}
      <button
        type="button"
        onClick={() => removeSource(source.id)}
        aria-label={`Remove source ${source.label}`}
        className="shrink-0 px-2 py-1 bg-chassis border border-edge text-solder hover:text-hazard text-[10px] font-mono font-bold cursor-pointer"
      >
        [ X ]
      </button>
    </div>
    );
  };

  return (
    <AnimatePresence>
      <div ref={sheetRef} role="dialog" aria-modal="true" tabIndex={-1} className="fixed inset-0 z-[56] flex items-center justify-center p-3 bg-chassis/85 overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 14 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 14 }}
          className="w-full max-w-3xl bg-chassis border border-edge overflow-hidden flex flex-col max-h-[92vh]"
        >
          <div className="px-4 py-3 border-b border-edge bg-deck flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 bg-inset/10 border border-edge/30">
                <span className="text-amber font-bold font-mono">[ FORGE ]</span>
              </div>
              <div>
                <h3 className="font-bold text-bone text-sm font-mono uppercase tracking-tight">
                  Flashcard Forge · no encoding
                </h3>
                <p className="text-[10px] text-solder font-mono">
                  many sources in, one deck out — choose where it lands
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                data-testid="forge-recipes-toggle"
                onClick={openRecipes}
                className="px-2.5 py-1.5 bg-chassis border border-edge text-[10px] font-mono font-bold uppercase tracking-wider text-solder hover:text-amber cursor-pointer"
              >
                [ RECIPES ]
              </button>
              <button
                type="button"
                onClick={handleClose}
                aria-label="Close forge"
                className="p-2 text-solder hover:text-bone hover:bg-inset cursor-pointer"
              >
                <BracketTag label="X" tone="text-amber" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {showRecipes && (
              <div className="space-y-2 p-3 bg-deck border border-gilt/45" data-testid="forge-recipes">
                <span className="text-[10px] font-mono font-bold text-amber uppercase tracking-wider">
                  Recipes · the weekly ingest
                </span>
                <p className="text-[11px] text-solder font-mono leading-relaxed">
                  A recipe is the setup, not the deck: which sources, which sections, which export surface.
                  Files are remembered by name, so a recipe with PDFs asks for them back.
                </p>
                {recipes.length === 0 ? (
                  <p className="text-[11px] text-solder font-mono">No recipes yet. Build a setup and save it.</p>
                ) : (
                  <div className="space-y-1.5">
                    {recipes.map((recipe) => (
                      <div
                        key={recipe.id}
                        data-testid={`forge-recipe-${recipe.id}`}
                        className="p-2 bg-chassis border border-edge/40 flex items-center gap-2"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-[11px] font-mono text-bone truncate">{recipe.name}</p>
                          <p className="text-[10px] font-mono text-solder">{describeForgeRecipe(recipe)}</p>
                        </div>
                        <button
                          type="button"
                          data-testid={`forge-run-recipe-${recipe.id}`}
                          onClick={() => handleLoadRecipe(recipe, true)}
                          className="shrink-0 px-2.5 py-1 bg-amber border border-amber text-chassis text-[10px] font-mono font-bold uppercase tracking-wider cursor-pointer"
                        >
                          [ RUN ]
                        </button>
                        <button
                          type="button"
                          onClick={() => handleLoadRecipe(recipe, false)}
                          className="shrink-0 px-2 py-1 bg-chassis border border-edge text-solder hover:text-bone text-[10px] font-mono font-bold uppercase cursor-pointer"
                        >
                          [ LOAD ]
                        </button>
                        <button
                          type="button"
                          aria-label={`Delete recipe ${recipe.name}`}
                          onClick={() => handleDeleteRecipe(recipe)}
                          className="shrink-0 px-2 py-1 bg-chassis border border-edge text-solder hover:text-hazard text-[10px] font-mono font-bold cursor-pointer"
                        >
                          [ X ]
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="text"
                    value={recipeName}
                    onChange={(e) => setRecipeName(e.target.value)}
                    placeholder="Monday lectures"
                    aria-label="Recipe name"
                    className="flex-1 px-2.5 py-1.5 bg-chassis border border-edge text-[11px] text-bone placeholder-solder focus:outline-none focus:border-amber font-mono"
                  />
                  <button
                    type="button"
                    data-testid="forge-save-recipe"
                    onClick={handleSaveRecipe}
                    className="shrink-0 px-3 py-1.5 bg-chassis border border-edge text-bone text-[10px] font-mono font-bold uppercase tracking-wider cursor-pointer"
                  >
                    [ SAVE CURRENT SETUP ]
                  </button>
                </div>
                {recipeNote && <p className="text-[10px] font-mono text-amber">{recipeNote}</p>}
              </div>
            )}

            {phase !== 'done' && (
              <>
                <div className="p-3 bg-deck border border-edge/40 text-[11px] text-solder font-mono leading-relaxed">
                  Nothing here becomes a workout: no stages, no paradoxes, no XP. Sources are cut straight into
                  cards, deduplicated across sources, then run through the same Wozniak enforcement pass and FSRS
                  audit as an encoded deck. A video is read from its captions, or transcribed from its own audio when
                  it has none. Where two sources disagree, you get one conflict card that names both.
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono font-bold text-solder uppercase tracking-wider">
                      Sources ({sources.length}/{MAX_SOURCES})
                    </span>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="text-[10px] font-mono font-bold text-amber uppercase tracking-wider cursor-pointer"
                    >
                      [ + ADD FILES / RECORDINGS ]
                    </button>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept={`application/pdf,image/png,image/jpeg,image/webp,${MEDIA_ACCEPT_ATTRIBUTE}`}
                    onChange={(e) => addFiles(e.target.files)}
                    className="hidden"
                    aria-label="Add source files"
                  />
                  {sources.length === 0 ? (
                    <p className="text-[11px] font-mono text-solder p-3 bg-deck/60 border border-edge/40">
                      No sources yet. Paste notes, drop in PDFs, slide photos or a lecture recording, or paste a list
                      of YouTube links.
                    </p>
                  ) : (
                    <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">{sources.map(renderSourceRow)}</div>
                  )}
                  {missingFiles.length > 0 && (
                    <p className="text-[10px] font-mono text-hazard">
                      Re-attach from the recipe: {missingFiles.join(', ')}
                    </p>
                  )}
                  {/* Memory-aware ingest: deck memory already knows which of
                      these lectures were cut before, so it says so BEFORE the
                      model calls are spent rather than after the diff. */}
                  {forgedBefore.size > 0 && (
                    <div className="p-2.5 bg-deck border border-gilt/40 space-y-1" data-testid="forge-known-sources">
                      <p className="text-[10px] font-mono text-amber leading-relaxed">
                        {skippedSources.length > 0 ? '[ - ] ' : '[ ! ] '}
                        {forgedBefore.size} of {sources.length} source
                        {sources.length === 1 ? '' : 's'} already cut into a deck
                        {skippedSources.length > 0
                          ? ` — ${skippedSources.length} skipped, ${activeSources.length} will run`
                          : ` (${[...forgedBefore.values()].reduce((n, s) => n + s.cards, 0)} cards so far)`}
                        .
                      </p>
                      <button
                        type="button"
                        data-testid="forge-skip-forged"
                        onClick={() => {
                          playSound('click');
                          const knownIds = [...forgedBefore.keys()];
                          setSkippedSources((prev) => (prev.length > 0 ? [] : knownIds));
                        }}
                        className="text-[10px] font-mono font-bold text-amber underline cursor-pointer"
                      >
                        {skippedSources.length > 0
                          ? 'use them again'
                          : `skip ${forgedBefore.size} already-forged source${forgedBefore.size === 1 ? '' : 's'}`}
                      </button>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <span className="text-[10px] font-mono font-bold text-solder uppercase tracking-wider">
                    Add pasted notes / source text
                  </span>
                  <textarea
                    value={draftText}
                    onChange={(e) => setDraftText(e.target.value)}
                    rows={3}
                    placeholder="Paste a topic's notes, a lecture summary, or a list of facts…"
                    className="w-full p-3 bg-deck border border-edge text-xs text-bone placeholder-solder focus:outline-none focus:border-amber resize-none font-mono leading-relaxed"
                  />
                  <button
                    type="button"
                    onClick={addText}
                    disabled={!draftText.trim() || sources.length >= MAX_SOURCES}
                    className="px-3 py-1.5 bg-chassis border border-edge text-bone text-[10px] font-mono font-bold uppercase tracking-wider cursor-pointer disabled:opacity-40"
                  >
                    [ + ADD TEXT SOURCE ]
                  </button>
                </div>

                <div className="space-y-2">
                  <span className="text-[10px] font-mono font-bold text-solder uppercase tracking-wider">
                    Add YouTube lectures (one per line)
                  </span>
                  <textarea
                    value={draftUrl}
                    onChange={(e) => setDraftUrl(e.target.value)}
                    rows={2}
                    placeholder="https://www.youtube.com/watch?v=…"
                    className="w-full p-3 bg-deck border border-edge text-xs text-bone placeholder-solder focus:outline-none focus:border-amber resize-none font-mono leading-relaxed"
                  />
                  <button
                    type="button"
                    onClick={addVideos}
                    disabled={!draftUrl.trim() || sources.length >= MAX_SOURCES}
                    className="px-3 py-1.5 bg-chassis border border-edge text-bone text-[10px] font-mono font-bold uppercase tracking-wider cursor-pointer disabled:opacity-40"
                  >
                    [ + ADD VIDEOS ]
                  </button>
                  <p className="text-[10px] font-mono text-solder">
                    Captions come first (manual, then auto-generated). Only when a video has none is its audio
                    transcribed — and if that is not possible either, the source says so rather than inventing cards.
                  </p>
                </div>

                <div className="space-y-2">
                  <span className="text-[10px] font-mono font-bold text-solder uppercase tracking-wider">
                    Card sections
                  </span>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                    {SECTIONS.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        title={s.blurb}
                        onClick={() => setSections((prev) => ({ ...prev, [s.id]: !prev[s.id] }))}
                        className={`px-2.5 py-1.5 text-[10px] font-mono font-bold uppercase tracking-wider border cursor-pointer ${
                          sections[s.id] ? 'bg-amber border-amber text-chassis' : 'bg-chassis border-edge text-solder'
                        }`}
                      >
                        [ {s.label} ]
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <span className="text-[10px] font-mono font-bold text-solder uppercase tracking-wider">
                    Export target
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
                    {TARGETS.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setTarget(t.id)}
                        title={t.blurb}
                        className={`px-2.5 py-2 text-left border cursor-pointer ${
                          target === t.id ? 'bg-amber border-amber text-chassis' : 'bg-chassis border-edge text-solder'
                        }`}
                      >
                        <span className="block text-[10px] font-mono font-bold uppercase tracking-wider">
                          [ {t.label} ]
                        </span>
                        <span className="block text-[10px] font-mono mt-0.5 leading-snug opacity-90">{t.blurb}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {error && <p className="text-[11px] font-mono text-hazard">{error}</p>}

                {phase === 'forging' && (
                  <div className="p-3 bg-deck border border-amber/40 space-y-2">
                    <span className="text-[10px] font-mono font-bold text-amber uppercase tracking-wider">
                      [ FORGING ]{' '}
                      {forgePhase || `cutting ${sources.length} source${sources.length === 1 ? '' : 's'} into cards…`}
                    </span>
                    <p className="text-[10px] font-mono text-solder leading-relaxed">
                      Three sources run at a time, and each row lands the moment its cards are back — no waiting for
                      the slowest source to see the fastest.
                    </p>
                    <div className="space-y-1" data-testid="forge-live-sources">
                      {sources.map((s) => {
                        const done = liveSources.find((row) => row.id === s.id);
                        const running = liveRunning.includes(s.id);
                        const total = done
                          ? done.counts.facts + done.counts.mechanisms + done.counts.drills + done.counts.examples
                          : 0;
                        return (
                          <div key={s.id} className="flex items-center gap-2 text-[10px] font-mono">
                            <span className={done ? 'text-signal' : running ? 'text-amber' : 'text-solder'}>
                              {done ? '[ OK ]' : running ? '[ CUTTING ]' : '[ QUEUED ]'}
                            </span>
                            <span className="min-w-0 flex-1 truncate text-bone">{s.label}</span>
                            <span className="text-solder shrink-0">
                              {done ? `${total} card${total === 1 ? '' : 's'}` : running ? '…' : '—'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            )}

            {phase === 'done' && merged && (
              <div className="space-y-4" data-testid="forge-result">
                <div className="p-3 bg-deck border border-amber/40 space-y-1">
                  <span className="text-[10px] font-mono font-bold text-amber uppercase tracking-wider">
                    [ DECK FORGED ] {mergeNote}
                  </span>
                  <p className="text-[11px] font-mono text-bone">
                    {merged.declarativeFacts.length} facts · {merged.conceptualMechanisms.length} mechanisms ·{' '}
                    {merged.practiceQuestions?.length || 0} drills · {merged.workedExamples?.length || 0} examples
                  </p>
                  <p className="text-[10px] font-mono text-solder">{merged.topic}</p>
                  {/* The deck the export will actually hold, not the raw batch. */}
                  {wozniak && (
                    <p className="text-[10px] font-mono text-solder leading-relaxed" data-testid="forge-wozniak">
                      Wozniak pass: <span className="text-bone font-bold">{wozniak.cards.length}</span> card
                      {wozniak.cards.length === 1 ? '' : 's'} after sanitizing
                      {wozniak.addedSymmetric > 0 ? ` (+${wozniak.addedSymmetric} reverse cloze)` : ''}
                      {wozniak.heldBack.length > 0
                        ? ` · ${wozniak.heldBack.length} held back by the 20-word ceiling`
                        : ''}
                      {wozniak.cards.length !== deckSize ? ` · ${deckSize} forged` : ''}.
                    </p>
                  )}
                  {/* A card count says how big the deck is, not whether it is
                      complete — this is the section that came back empty. */}
                  {coverage && (
                    <p className="text-[10px] font-mono leading-relaxed" data-testid="forge-coverage">
                      <span className={coverage.gaps.length > 0 ? 'text-hazard' : 'text-signal'}>
                        {coverage.gaps.length > 0 ? '[ ! ] ' : '[ OK ] '}
                      </span>
                      <span className={coverage.gaps.length > 0 ? 'text-hazard' : 'text-solder'}>
                        {coverage.note}
                      </span>
                    </p>
                  )}
                  {/* A gap is only actionable if you know whose it is: a section
                      missing from ONE lecture is a prompt to re-ask, a section
                      missing from every source is a prompt to read something
                      else instead of paying for a third pass over the same
                      slides. */}
                  {coverage && coverage.gapOwners.length > 0 && (
                    <ul className="text-[10px] font-mono text-solder leading-relaxed" data-testid="forge-gap-owners">
                      {coverage.gapOwners.map((gap) => (
                        <li key={gap.section} className={gap.silentIn.length > 0 ? 'text-hazard' : undefined}>
                          - {gap.note}
                        </li>
                      ))}
                    </ul>
                  )}
                  {/* The direction rule, stated up front: a front that is a
                      label (Step 2, vs X, Why) can only ever be asked one way,
                      and that is a note about the SOURCE, not about the model. */}
                  {frontQuality && (
                    <p className="text-[10px] font-mono text-solder leading-relaxed" data-testid="forge-front-quality">
                      Fronts: {frontQuality.twoWay} two-way · {frontQuality.forwardOnly} one way only
                      {frontQuality.labelled > 0
                        ? ` — ${frontQuality.labelled} are labels or questions (${frontQuality.examples.join(', ')}${
                            frontQuality.labelled > frontQuality.examples.length ? ', …' : ''
                          })`
                        : ''}
                      .
                    </p>
                  )}
                </div>

                {/* Too few cards, or too many: both are one click from here. */}
                <div className="p-3 bg-deck border border-edge/40 space-y-2">
                  <p className="text-[11px] font-mono text-solder leading-relaxed">
                    Deck size: <span className="text-bone font-bold">{deckSize}</span> card
                    {deckSize === 1 ? '' : 's'}. Still short of what you need? Generate more — it re-reads the same
                    sources and only appends cards the deck does not already have. Too much overlap? Condense folds
                    overlapping cards into fewer, denser ones.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <button
                      type="button"
                      data-testid="forge-more"
                      onClick={handleGenerateMore}
                      disabled={deckBusy !== '' || emptyDeck}
                      className="px-3 py-2 bg-chassis border border-amber/60 text-amber text-[10px] font-mono font-bold uppercase tracking-wider cursor-pointer disabled:opacity-40"
                    >
                      {deckBusy === 'more' ? '[ ADDING MORE… ]' : '[ + GENERATE MORE FLASHCARDS ]'}
                    </button>
                    <button
                      type="button"
                      data-testid="forge-condense"
                      onClick={handleCondense}
                      disabled={deckBusy !== '' || emptyDeck}
                      className="px-3 py-2 bg-chassis border border-edge text-solder hover:text-bone text-[10px] font-mono font-bold uppercase tracking-wider cursor-pointer disabled:opacity-40"
                    >
                      {deckBusy === 'condense' ? '[ CONDENSING… ]' : '[ CONDENSE SOME FLASHCARDS ]'}
                    </button>
                  </div>

                  {/* "More" as a loop with a target: one batch is a guess at how
                      much is missing, so this keeps going until the deck is the
                      size you asked for, the sources run dry (two empty batches),
                      or you stop it. The count below is live. */}
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <span className="text-[10px] font-mono text-solder uppercase tracking-wider">Grow to</span>
                    <input
                      type="number"
                      min={1}
                      max={600}
                      value={moreTarget}
                      onChange={(e) => setMoreTarget(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
                      aria-label="Target card count for the grow loop"
                      data-testid="forge-target"
                      className="w-20 px-2 py-1 bg-chassis border border-edge text-[11px] text-bone font-mono focus:outline-none focus:border-amber"
                    />
                    <span className="text-[10px] font-mono text-solder">cards</span>
                    <button
                      type="button"
                      data-testid="forge-grow-loop"
                      onClick={runMoreLoop}
                      disabled={deckBusy !== '' || loopRunning || emptyDeck}
                      className="px-3 py-2 bg-chassis border border-amber/60 text-amber text-[10px] font-mono font-bold uppercase tracking-wider cursor-pointer disabled:opacity-40"
                    >
                      {loopRunning ? '[ GROWING… ]' : '[ GROW TO TARGET ]'}
                    </button>
                    {loopRunning && (
                      <button
                        type="button"
                        data-testid="forge-stop-loop"
                        onClick={() => {
                          stopLoopRef.current = true;
                        }}
                        className="px-3 py-2 bg-chassis border border-hazard/60 text-hazard text-[10px] font-mono font-bold uppercase tracking-wider cursor-pointer"
                      >
                        [ STOP ]
                      </button>
                    )}
                    <button
                      type="button"
                      data-testid="forge-undo"
                      onClick={undoDeck}
                      disabled={deckHistory.length === 0 || deckBusy !== ''}
                      title="Put the deck back the way it was before the last reshape"
                      className="px-3 py-2 bg-chassis border border-edge text-solder hover:text-bone text-[10px] font-mono font-bold uppercase tracking-wider cursor-pointer disabled:opacity-40"
                    >
                      {deckHistory.length > 0
                        ? `[ UNDO — BACK TO ${deckCount(deckHistory[deckHistory.length - 1])} CARDS ]`
                        : '[ UNDO ]'}
                    </button>
                  </div>
                  {loopNote && (
                    <p data-testid="forge-loop-note" className="text-[10px] font-mono text-solder leading-relaxed">
                      {loopNote}
                    </p>
                  )}
                  {deckNote && (
                    <p
                      data-testid="forge-deck-note"
                      className={`text-[10px] font-mono leading-relaxed ${deckNoteError ? 'text-hazard' : 'text-amber'}`}
                    >
                      {deckNote}
                    </p>
                  )}
                </div>

                {/* Two sources disagreeing is a finding, not a footnote. */}
                {contradictions.length > 0 && (
                  <div
                    data-testid="forge-conflicts"
                    className="p-3 bg-hazard/5 border border-hazard/40 space-y-2"
                  >
                    <span className="text-[10px] font-mono font-bold text-hazard uppercase tracking-wider">
                      [ ! ] {contradictions.length} source conflict{contradictions.length === 1 ? '' : 's'} — conflict
                      card{contradictions.length === 1 ? '' : 's'} lead this deck
                    </span>
                    {contradictions.map((conflict) => (
                      <div key={conflict.id} data-testid={`forge-conflict-${conflict.id}`} className="space-y-0.5">
                        <p className="text-[10px] font-mono text-solder uppercase tracking-wider">
                          {conflict.kind === 'numeric' ? 'different quantity' : 'opposite claim'} · {conflict.summary}
                        </p>
                        {conflict.claims.map((claim) => (
                          <p key={claim.id} className="text-[11px] font-mono text-bone leading-relaxed">
                            <span className="text-hazard">▸</span> {claim.text}{' '}
                            <span className="text-solder">— {claim.sourceLabel}</span>
                          </p>
                        ))}
                      </div>
                    ))}
                    <p className="text-[10px] font-mono text-solder">
                      Resolve it in your notes before you trust either card: the deck ships the disagreement as one
                      card instead of quietly picking a side.
                    </p>
                  </div>
                )}

                {/* Deck memory: what has this topic already shipped? */}
                {diff && (diff.known > 0 || ankiRead) && (
                  <div data-testid="forge-memory" className="p-3 bg-deck border border-gilt/45 space-y-2">
                    <span className="text-[10px] font-mono font-bold text-amber uppercase tracking-wider">
                      [ DECK MEMORY ] {diff.fresh} new · {diff.known} already in your deck
                    </span>
                    <p
                      data-testid="forge-memory-anki"
                      title={!checkingAnki && ankiRead && !ankiRead.ok ? ankiRead.error : undefined}
                      className="text-[10px] font-mono text-solder leading-relaxed"
                    >
                      {checkingAnki
                        ? 'Checking the real Anki deck…'
                        : ankiRead
                          ? describeAnkiRead(ankiRead)
                          : ''}
                    </p>
                    {/* The account's copy of the memory, so the same deck is not
                        "new" again on the next device. */}
                    {(memorySync || memorySyncing) && (
                      <p data-testid="forge-memory-cloud" className="text-[10px] font-mono text-solder leading-relaxed">
                        {describeDeckMemorySync(memorySync, memorySyncing)}
                      </p>
                    )}
                    <div className="flex flex-wrap items-center gap-2">
                      {diff.known > 0 && (
                        <button
                          type="button"
                          data-testid="forge-skip-known"
                          onClick={() => setSkipKnown((prev) => !prev)}
                          className={`px-2.5 py-1.5 text-[10px] font-mono font-bold uppercase tracking-wider border cursor-pointer ${
                            skipKnown ? 'bg-amber border-amber text-chassis' : 'bg-chassis border-edge text-solder'
                          }`}
                        >
                          [ {skipKnown ? 'SHIPPING NEW CARDS ONLY' : 'SHIPPING THE WHOLE DECK'} ]
                        </button>
                      )}
                      <button
                        type="button"
                        data-testid="forge-check-anki"
                        disabled={checkingAnki || !merged}
                        onClick={() => merged && void checkAnkiDeck(merged)}
                        className="px-2.5 py-1.5 bg-chassis border border-edge text-[10px] font-mono font-bold uppercase tracking-wider text-solder hover:text-amber cursor-pointer disabled:opacity-40"
                      >
                        [ {checkingAnki ? 'CHECKING ANKI' : 'CHECK ANKI'} ]
                      </button>
                    </div>
                    <p className="text-[10px] font-mono text-solder leading-relaxed">
                      Kept from every deck this topic has already shipped, plus whatever the real Anki deck holds —{' '}
                      {shippingCount} card{shippingCount === 1 ? '' : 's'} will ship now.
                    </p>
                    <button
                      type="button"
                      onClick={handleForgetMemory}
                      className="text-[10px] font-mono text-solder hover:text-hazard uppercase tracking-wider cursor-pointer"
                    >
                      [ FORGET THIS TOPIC&apos;S MEMORY ]
                    </button>
                    <p className="text-[10px] font-mono text-solder/70 leading-relaxed">
                      Forgetting clears this app&apos;s memory only — the cards in Anki are left alone.
                    </p>
                  </div>
                )}

                <div className="space-y-1.5">
                  <span className="text-[10px] font-mono font-bold text-solder uppercase tracking-wider">
                    Source log
                  </span>
                  {outcomes.map((o) => (
                    <div
                      key={o.id}
                      className={`p-2 border text-[11px] font-mono leading-relaxed ${
                        o.status === 'ok' ? 'bg-deck border-edge/40 text-bone' : 'bg-hazard/5 border-hazard/30 text-hazard'
                      }`}
                    >
                      <span className="font-bold">{o.status === 'ok' ? '[ OK ]' : '[ ! ]'}</span> {o.label}
                      {o.status === 'ok' && (
                        <span className="text-solder">
                          {' '}
                          — {o.counts.facts + o.counts.mechanisms + o.counts.drills + o.counts.examples} cards
                          {o.note ? ` · ${o.note}` : ''}
                        </span>
                      )}
                      {o.status !== 'ok' && o.note ? <span> — {o.note}</span> : null}
                      {/* A source that under-produced is a failure the deck should
                          not hide: it can be re-forged on its own. */}
                      {o.status === 'ok' &&
                        o.yield &&
                        (o.yield.verdict === 'thin' || o.yield.verdict === 'silent') && (
                          <p className="text-[10px] font-mono text-hazard/90 mt-0.5">
                            Under-mined: {o.yield.note} — retry this source, or turn on more card sections.
                          </p>
                        )}
                      {o.status !== 'ok' && (
                        <button
                          type="button"
                          data-testid={`forge-retry-${o.id}`}
                          onClick={() => void handleRetrySource(o.id)}
                          disabled={deckBusy !== '' || loopRunning}
                          className="ml-2 px-2 py-0.5 bg-chassis border border-hazard/50 text-hazard text-[10px] font-mono font-bold uppercase cursor-pointer disabled:opacity-40"
                        >
                          [ RETRY ]
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                <div className="space-y-2">
                  <button
                    type="button"
                    data-testid="forge-export-primary"
                    onClick={() => sendToExport(target)}
                    disabled={emptyDeck || shippingCount === 0 || deckBusy !== ''}
                    className="w-full px-4 py-3 bg-amber border border-amber text-chassis text-xs font-mono font-bold uppercase tracking-wider cursor-pointer disabled:opacity-40"
                  >
                    {target === 'anki'
                      ? '[ EXPORT TO ANKI (.APKG / .TXT) ]'
                      : target === 'remnote'
                        ? '[ EXPORT TO REMNOTE ]'
                        : '[ EXPORT TO ANKI, THEN REMNOTE ]'}
                  </button>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      data-testid="forge-open-anki"
                      onClick={() => sendToExport('anki')}
                      disabled={emptyDeck || deckBusy !== ''}
                      className="px-3 py-2 bg-chassis border border-edge text-bone text-[10px] font-mono font-bold uppercase tracking-wider cursor-pointer disabled:opacity-40"
                    >
                      [ ANKI EXPORT ]
                    </button>
                    <button
                      type="button"
                      data-testid="forge-open-remnote"
                      onClick={() => sendToExport('remnote')}
                      disabled={emptyDeck || deckBusy !== ''}
                      className="px-3 py-2 bg-chassis border border-edge text-bone text-[10px] font-mono font-bold uppercase tracking-wider cursor-pointer disabled:opacity-40"
                    >
                      [ REMNOTE EXPORT ]
                    </button>
                  </div>
                </div>
                <p className="text-[10px] font-mono text-solder">
                  Both surfaces ship this same deck: the Wozniak pass runs before either, and duplicates are counted
                  by the exporter when you push to Anki.
                </p>
              </div>
            )}
          </div>

          <div className="px-4 py-3 border-t border-edge bg-deck flex items-center justify-between gap-3">
            <span className="text-[10px] font-mono text-solder leading-relaxed">
              {sectionList.length === 0 ? 'Pick at least one card section' : `${sectionList.length} section(s) selected`}
              {/* Pre-flight cost estimate: an ingest is a decision, not a surprise. */}
              {sources.length > 0 && (
                <>
                  {' · '}
                  {activeSources.length} source{activeSources.length === 1 ? '' : 's'} · ~{preflight.calls} model call
                  {preflight.calls === 1 ? '' : 's'}
                  {preflight.needsAudio > 0 ? ` · up to ${preflight.needsAudio} transcribed` : ''}
                  {skippedSources.length > 0 ? ` · ${skippedSources.length} skipped` : ''}
                  {preflight.calls > SOURCE_CONCURRENCY_UI ? ` · cut ${SOURCE_CONCURRENCY_UI} at a time` : ''}
                </>
              )}
            </span>
            <div className="flex items-center gap-2">
              <button type="button" onClick={handleClose} className="px-4 py-2 bg-inset text-bone text-xs font-bold cursor-pointer">
                {phase === 'done' ? 'Close' : 'Cancel'}
              </button>
              {phase !== 'done' && (
                <button
                  type="button"
                  data-testid="forge-run"
                  onClick={handleForge}
                  disabled={activeSources.length === 0 || sectionList.length === 0 || phase === 'forging'}
                  className="px-5 py-2.5 bg-amber border border-amber text-chassis text-xs font-mono font-bold uppercase tracking-wider cursor-pointer disabled:opacity-40"
                >
                  {phase === 'forging'
                    ? '[ FORGING… ]'
                    : `[ FORGE ${activeSources.length || ''} SOURCE${activeSources.length === 1 ? '' : 'S'} ]`}
                </button>
              )}
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
