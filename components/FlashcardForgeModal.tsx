'use client';

import React, { useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { AISettings, SegregationReport, UploadedFileAsset } from '@/lib/types';
import { BracketTag } from '@/components/ui/BracketTag';
import { playSound } from '@/lib/audio';
import { ForgeSectionCounts, ForgeSourceKind } from '@/lib/services/forge';

/**
 * The Forge: skip the workout, get the deck.
 *
 * Every other entry point in this app teaches first — paradox, thought
 * experiment, mechanism in your own words — and treats flashcards as the fossil
 * record of that. Sometimes that is not what you want: you have four PDFs, two
 * lectures and an exam on Friday, and you want the cards. This modal takes as
 * many sources as you can throw at it, asks where the deck should go, and never
 * creates a stage, a session or an XP bar.
 */

export type ForgeExportTarget = 'anki' | 'remnote' | 'both';

interface ForgeSourceDraft {
  id: string;
  kind: ForgeSourceKind;
  label: string;
  notes?: string;
  url?: string;
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
const FILE_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif'];

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
        if (!FILE_TYPES.includes(file.type)) {
          setError('Only PDFs and images (PNG/JPEG/WebP) can be forged.');
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
              : [...prev, { id: idFor('file'), kind: 'file' as ForgeSourceKind, label: file.name, file: asset }]
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

  const handleForge = async () => {
    if (sources.length === 0 || sectionList.length === 0) return;
    playSound('click');
    setPhase('forging');
    setError('');
    setOutcomes([]);
    setMerged(null);
    try {
      const res = await fetch('/api/forge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sources: sources.map((s) => ({
            id: s.id,
            kind: s.kind,
            label: s.label,
            notes: s.notes,
            url: s.url,
            file: s.file
              ? { name: s.file.name, type: s.file.type, base64Data: s.file.base64Data }
              : null,
          })),
          include: sectionList,
          settings,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'The forge could not build a deck.');
      }
      setOutcomes(Array.isArray(data.sources) ? data.sources : []);
      setMerged(data.report || null);
      setMergeNote(
        `${data.total ?? 0} card${data.total === 1 ? '' : 's'} forged${data.dropped ? ` · ${data.dropped} duplicate${data.dropped === 1 ? '' : 's'} dropped` : ''}`
      );
      setPhase('done');
      playSound('success');
    } catch (err: any) {
      setPhase('setup');
      setError(err?.message || 'The forge failed. Try again.');
    }
  };

  const deckSize =
    (merged?.declarativeFacts.length || 0) +
    (merged?.conceptualMechanisms.length || 0) +
    (merged?.practiceQuestions?.length || 0) +
    (merged?.workedExamples?.length || 0);
  const emptyDeck = deckSize === 0;

  const sendToExport = (which: ForgeExportTarget) => {
    if (!merged) return;
    playSound('success');
    const report = merged;
    onClose();
    resetTransient();
    onDeckReady(report, which);
  };

  const renderSourceRow = (source: ForgeSourceDraft) => (
    <div key={source.id} className="flex items-center gap-2 p-2 bg-deck border border-edge/40">
      <span className="text-[10px] font-mono font-bold text-amber uppercase tracking-wider shrink-0">
        [ {source.kind === 'youtube' ? 'YT' : source.kind === 'file' ? 'FILE' : 'TEXT'} ]
      </span>
      <span className="min-w-0 flex-1 text-[11px] font-mono text-bone truncate">{source.label}</span>
      <span className="text-[10px] font-mono text-solder shrink-0">
        {source.kind === 'text'
          ? `${(source.notes || '').split(/\s+/).filter(Boolean).length} words`
          : source.kind === 'file'
            ? `${Math.round((source.file?.size || 0) / 1024)} KB`
            : 'captions'}
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
            <button
              type="button"
              onClick={handleClose}
              aria-label="Close forge"
              className="p-2 text-solder hover:text-bone hover:bg-inset cursor-pointer"
            >
              <BracketTag label="X" tone="text-amber" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {phase !== 'done' && (
              <>
                <div className="p-3 bg-deck border border-edge/40 text-[11px] text-solder font-mono leading-relaxed">
                  Nothing here becomes a workout: no stages, no paradoxes, no XP. Sources are cut straight into
                  cards, deduplicated across sources, then run through the same Wozniak enforcement pass and FSRS
                  audit as an encoded deck.
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
                      [ + ADD FILES ]
                    </button>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept="application/pdf,image/png,image/jpeg,image/webp"
                    onChange={(e) => addFiles(e.target.files)}
                    className="hidden"
                    aria-label="Add source files"
                  />
                  {sources.length === 0 ? (
                    <p className="text-[11px] font-mono text-solder p-3 bg-deck/60 border border-edge/40">
                      No sources yet. Paste notes, drop in PDFs and slide photos, or paste a list of YouTube links.
                    </p>
                  ) : (
                    <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">{sources.map(renderSourceRow)}</div>
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
                    Videos are read from their own caption track. No captions → no source text, and the forge says so
                    rather than inventing cards.
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
                    disabled={emptyDeck}
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
