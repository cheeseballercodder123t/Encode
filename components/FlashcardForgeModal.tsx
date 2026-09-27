'use client';

import React, { useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { AISettings, SegregationReport, UploadedFileAsset } from '@/lib/types';
import { BracketTag } from '@/components/ui/BracketTag';
import { playSound } from '@/lib/audio';
import {
  ForgeExportTarget,
  ForgeSectionCounts,
  ForgeSourceKind,
} from '@/lib/services/forge';
import type { Contradiction } from '@/lib/services/contradiction';
import { MEDIA_ACCEPT_ATTRIBUTE, isTranscribableMedia } from '@/lib/media-types';
import {
  DeckDiff,
  diffReportAgainstMemory,
  forgetDeckMemory,
  keepOnlyFreshCards,
  knownKeysForTopic,
  recordDeckExport,
  reportCardKeys,
} from '@/lib/deck-memory';
import {
  ForgeRecipe,
  buildForgeRecipe,
  deleteForgeRecipe,
  describeForgeRecipe,
  loadForgeRecipes,
  markForgeRecipeRun,
  saveForgeRecipe,
} from '@/lib/forge-recipes';

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
  const [recipes, setRecipes] = useState<ForgeRecipe[]>([]);
  const [showRecipes, setShowRecipes] = useState(false);
  const [recipeName, setRecipeName] = useState('');
  const [recipeNote, setRecipeNote] = useState('');
  const [missingFiles, setMissingFiles] = useState<string[]>([]);
  const nextId = useRef(1);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const idFor = (prefix: string) => `${prefix}_${nextId.current++}`;
  const sectionList = useMemo(
    () => SECTIONS.filter((s) => sections[s.id]).map((s) => s.id),
    [sections]
  );

  if (!isOpen) return null;

  const resetTransient = () => {
    setPhase('setup');
    setError('');
    setOutcomes([]);
    setMerged(null);
    setMergeNote('');
    setContradictions([]);
    setDiff(null);
    setSkipKnown(false);
    setRecipeNote('');
    setMissingFiles([]);
  };

  const handleClose = () => {
    onClose();
    resetTransient();
  };

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

  const runForge = async (sourceList: ForgeSourceDraft[], wanted: string[]) => {
    if (sourceList.length === 0 || wanted.length === 0) return;
    playSound('click');
    setPhase('forging');
    setError('');
    setOutcomes([]);
    setMerged(null);
    setContradictions([]);
    setDiff(null);
    try {
      const res = await fetch('/api/forge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sources: sourceList.map((s) => ({
            id: s.id,
            kind: s.kind,
            label: s.label,
            notes: s.notes,
            url: s.url,
            file: s.file
              ? { name: s.file.name, type: s.file.type, base64Data: s.file.base64Data }
              : null,
          })),
          include: wanted,
          settings,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'The forge could not build a deck.');
      }
      const report: SegregationReport | null = data.report || null;
      setOutcomes(Array.isArray(data.sources) ? data.sources : []);
      setMerged(report);
      setContradictions(Array.isArray(data.contradictions) ? data.contradictions : []);
      setMergeNote(
        `${data.total ?? 0} card${data.total === 1 ? '' : 's'} forged${data.dropped ? ` · ${data.dropped} duplicate${data.dropped === 1 ? '' : 's'} dropped` : ''}`
      );
      // Deck memory: what has this topic already shipped? The learner decides
      // whether the deck goes out whole or only the cards that are new.
      if (report) {
        const nextDiff = diffReportAgainstMemory(report, knownKeysForTopic(report.topic));
        setDiff(nextDiff);
        setSkipKnown(nextDiff.known > 0);
      }
      setPhase('done');
      playSound('success');
    } catch (err: any) {
      setPhase('setup');
      setError(err?.message || 'The forge failed. Try again.');
    }
  };

  const handleForge = () => runForge(sources, sectionList);

  const deckSize =
    (merged?.declarativeFacts.length || 0) +
    (merged?.conceptualMechanisms.length || 0) +
    (merged?.practiceQuestions?.length || 0) +
    (merged?.workedExamples?.length || 0);
  const emptyDeck = deckSize === 0;
  const shipsOnlyFresh = skipKnown && (diff?.known || 0) > 0;
  const shippingCount = shipsOnlyFresh ? diff?.fresh ?? deckSize : deckSize;

  const sendToExport = (which: ForgeExportTarget) => {
    if (!merged) return;
    playSound('success');
    const report = shipsOnlyFresh && diff ? keepOnlyFreshCards(merged, diff.freshIds) : merged;
    // Remember what actually shipped, so next week's forge can say so.
    recordDeckExport({ topic: report.topic, keys: reportCardKeys(report), surface: which });
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

  const renderSourceRow = (source: ForgeSourceDraft) => (
    <div key={source.id} className="flex items-center gap-2 p-2 bg-deck border border-edge/40">
      <span className="text-[10px] font-mono font-bold text-amber uppercase tracking-wider shrink-0">
        [ {source.kind === 'youtube' ? 'YT' : source.kind === 'file' ? (source.media ? 'AUDIO' : 'FILE') : 'TEXT'} ]
      </span>
      <span className="min-w-0 flex-1 text-[11px] font-mono text-bone truncate">{source.label}</span>
      <span className="text-[10px] font-mono text-solder shrink-0">
        {source.kind === 'text'
          ? `${(source.notes || '').split(/\s+/).filter(Boolean).length} words`
          : source.kind === 'file'
            ? source.media
              ? 'transcribed'
              : `${Math.round((source.file?.size || 0) / 1024)} KB`
            : 'captions / audio'}
      </span>
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

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[56] flex items-center justify-center p-3 bg-chassis/85 overflow-y-auto">
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
                      [ FORGING ] cutting {sources.length} source{sources.length === 1 ? '' : 's'} into cards…
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {sources.map((s) => (
                        <span key={s.id} className="px-2 py-0.5 bg-chassis border border-edge text-[10px] font-mono text-solder">
                          {s.label.slice(0, 28)}
                        </span>
                      ))}
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
                {diff && diff.known > 0 && (
                  <div data-testid="forge-memory" className="p-3 bg-deck border border-gilt/45 space-y-2">
                    <span className="text-[10px] font-mono font-bold text-amber uppercase tracking-wider">
                      [ DECK MEMORY ] {diff.fresh} new · {diff.known} already in your deck
                    </span>
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
                    <p className="text-[10px] font-mono text-solder leading-relaxed">
                      Remembered from every deck this topic has already exported — {shippingCount} card
                      {shippingCount === 1 ? '' : 's'} will ship now.
                    </p>
                    <button
                      type="button"
                      onClick={handleForgetMemory}
                      className="text-[10px] font-mono text-solder hover:text-hazard uppercase tracking-wider cursor-pointer"
                    >
                      [ FORGET THIS TOPIC&apos;S MEMORY ]
                    </button>
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
                    </div>
                  ))}
                </div>

                <div className="space-y-2">
                  <button
                    type="button"
                    data-testid="forge-export-primary"
                    onClick={() => sendToExport(target)}
                    disabled={emptyDeck || shippingCount === 0}
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
                      disabled={emptyDeck}
                      className="px-3 py-2 bg-chassis border border-edge text-bone text-[10px] font-mono font-bold uppercase tracking-wider cursor-pointer disabled:opacity-40"
                    >
                      [ ANKI EXPORT ]
                    </button>
                    <button
                      type="button"
                      data-testid="forge-open-remnote"
                      onClick={() => sendToExport('remnote')}
                      disabled={emptyDeck}
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
            <span className="text-[10px] font-mono text-solder">
              {sectionList.length === 0 ? 'Pick at least one card section' : `${sectionList.length} section(s) selected`}
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
                  disabled={sources.length === 0 || sectionList.length === 0 || phase === 'forging'}
                  className="px-5 py-2.5 bg-amber border border-amber text-chassis text-xs font-mono font-bold uppercase tracking-wider cursor-pointer disabled:opacity-40"
                >
                  {phase === 'forging' ? '[ FORGING… ]' : `[ FORGE ${sources.length || ''} SOURCE${sources.length === 1 ? '' : 'S'} ]`}
                </button>
              )}
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
