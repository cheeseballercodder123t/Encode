'use client';

import React, { useState, useMemo } from 'react';
import { BracketTag } from '@/components/ui/BracketTag';
import { motion } from 'motion/react';
import { SavedSchema } from '@/lib/types';
import { useModalA11y } from '@/hooks/useModalA11y';
import { useClipboardCopy } from '@/hooks/useClipboardCopy';
import { buildShareLink, SHARE_URL_LIMIT_BYTES } from '@/lib/url-share';
import { buildShareSchemaFile, downloadBackup, shareFileSlug } from '@/lib/backup';
import { playSound } from '@/lib/audio';

interface StatelessShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  schema: SavedSchema | null;
}

/**
 * The share sheet, and the one thing it must never do: hand over a link that
 * cannot work.
 *
 * A schema rides to a classmate inside the URL, which is what makes sharing
 * stateless - and what gives it a ceiling. The link is written into the
 * fragment (`#share=`), so the server never sees the payload and a large schema
 * cannot be refused with a 431 before any route runs; `lib/url-share.ts` carries
 * the measurements. What is left is a practical limit: a link longer than a chat
 * message gets split in half by the app it is pasted into, and half a compressed
 * payload decompresses to nothing.
 *
 * So the sheet states the size it computed and, past the limits, stops offering
 * the link as the way to share it - with two real alternatives rather than a
 * dead end: the same deck without the author's own written answers (smaller, and
 * what a classmate actually needs), and a schema file the receiver restores
 * through the analytics sheet's `[ RESTORE BACKUP ]`.
 */
export default function StatelessShareModal({
  isOpen,
  onClose,
  schema
}: StatelessShareModalProps) {
  // The copy confirmation is the shared hook's, not this sheet's: the link is
  // only marked copied for a write that actually landed, and a refusal is shown
  // rather than logged where the learner will never see it (defect 35).
  const linkCopy = useClipboardCopy(3000);
  const [preferSlim, setPreferSlim] = useState(false);

  const shareStats = useMemo(() => {
    if (!schema) return null;
    const link = buildShareLink(schema);
    const savingsPct = link.rawBytes > 0
      ? Math.max(0, Math.round(((link.rawBytes - link.payloadBytes) / link.rawBytes) * 100))
      : 0;
    return { ...link, savingsPct };
  }, [schema]);

  // Esc closes, the page behind stops scrolling, focus moves in and back out.
  const sheetRef = useModalA11y(isOpen, onClose);

  if (!isOpen || !schema || !shareStats) return null;

  const slim = shareStats.slim;
  const usingSlim = preferSlim && Boolean(slim);
  const activeUrl = usingSlim ? slim!.url : shareStats.url;
  const activeBytes = usingSlim ? slim!.urlBytes : shareStats.urlBytes;
  // A link is offered unless even the slim deck is past the limit: a link that
  // arrives broken is worse than no link, because the recipient gets silence.
  const offersLink = !shareStats.unshareable;
  const kb = (bytes: number) => (bytes / 1024).toFixed(1);

  const handleCopyLink = async () => {
    const outcome = await linkCopy.copy(activeUrl);
    // The confirmation sound is played for a write that landed, and for nothing
    // else - a chime over a refused copy is the same lie as `[ OK ]`.
    if (outcome.ok) playSound('success');
  };

  const handleNativeShare = async () => {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: `DeepEncode: ${schema.topicSummary}`,
          text: `Check out this cognitive encoding schema for "${schema.topicSummary}"!`,
          url: activeUrl,
        });
        playSound('pop');
      } catch {
        // User cancelled or share failed
      }
    } else {
      void handleCopyLink();
    }
  };

  /** The share that has no length problem at all: a file the app can restore. */
  const handleSaveFile = () => {
    downloadBackup(
      buildShareSchemaFile(schema),
      `deepencode-schema-${shareFileSlug(schema)}.json`
    );
    playSound('success');
  };

  return (
    <div ref={sheetRef} role="dialog" aria-modal="true" tabIndex={-1} className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-chassis/85 overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="leaf-edge sheet-plate relative w-full max-w-xl rounded-2xl bg-deck border border-edge/40 overflow-hidden my-6 flex flex-col"
      >
        {/* Header */}
        <div className="p-4 sm:p-6 border-b border-edge/30 flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 flex items-center justify-center shrink-0">
              <span className="text-amber font-bold font-mono">[ SHARE ]</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg sm:text-xl font-black text-bone">
                  Stateless URL Sharing
                </h2>
                <span className="px-2 py-0.5 bg-inset/20 text-bone border border-edge/30 text-[10px] font-black uppercase tracking-wider">
                  No Database Required
                </span>
              </div>
              <p className="text-xs text-solder mt-0.5">
                Share full study schemas with classmates using pure URL compression.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="text-solder hover:text-bone p-2 bg-inset/80 hover:bg-inset transition-colors duration-150 cursor-pointer text-xs"
          >
            <BracketTag label="X" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-6 space-y-5 text-bone">
          {/* Target Schema Preview */}
          <div className="p-3.5 bg-chassis border border-edge space-y-1.5">
            <div className="flex items-center justify-between text-[11px] text-solder">
              <span className="font-semibold uppercase tracking-wider text-solder">Schema to Share</span>
              <span className="px-2 py-0.5 bg-inset/20 text-bone font-bold text-[10px]">
                {schema.isGuidedPath ? 'Guided Path Chapter' : '5-Stage Schema'}
              </span>
            </div>
            <h3 className="text-sm font-bold text-bone line-clamp-1">
              {schema.topicSummary}
            </h3>
            <div className="flex items-center gap-3 text-[11px] text-solder">
              <span>{schema.activities?.length || 0} Exercises & Flashcards</span>
              <span>•</span>
              <span className="text-amber font-semibold">+{schema.xpEarned || 0} XP Record</span>
            </div>
          </div>

          {/* Size guard: what the link costs, and what to do when it is too much */}
          {shareStats.unshareable && (
            <div data-testid="share-too-long" className="p-3.5 bg-hazard/10 border border-hazard/40 space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-hazard-300">
                <span className="font-mono">[ TOO LONG ]</span>
                <span>This schema does not fit in a link</span>
              </div>
              <p className="text-[11px] text-solder leading-relaxed">
                It compresses to <strong className="text-bone">{kb(shareStats.payloadBytes)} KB</strong>, and a
                URL that long is cut in half by chat apps, mail clients and the server itself — the
                recipient would get a broken link with no explanation. Nothing was copied.
              </p>
              <p className="text-[11px] text-solder leading-relaxed">
                Send it as a file instead: your classmate opens DeepEncode, then Analytics →{' '}
                <strong className="text-bone">[ RESTORE BACKUP ]</strong>, and the deck lands in their library.
              </p>
            </div>
          )}

          {!shareStats.unshareable && shareStats.overLimit && slim && (
            <div data-testid="share-too-long" className="p-3.5 bg-hazard/10 border border-hazard/40 space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-hazard-300">
                <span className="font-mono">[ TOO LONG ]</span>
                <span>This link would arrive broken</span>
              </div>
              <p className="text-[11px] text-solder leading-relaxed">
                The full link is <strong className="text-bone">{kb(shareStats.urlBytes)} KB</strong>, past what a
                URL should carry ({kb(SHARE_URL_LIMIT_BYTES)} KB). Without your written answers it shrinks to{' '}
                <strong className="text-bone">{kb(slim.urlBytes)} KB</strong> and every exercise still arrives —
                your classmate answers them themselves.
              </p>
            </div>
          )}

          {!shareStats.unshareable && !shareStats.overLimit && shareStats.overComfort && (
            <div data-testid="share-long-link" className="p-3.5 bg-amber/10 border border-amber/40 space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-amber">
                <span className="font-mono">[ LONG LINK ]</span>
                <span>Longer than one chat message</span>
              </div>
              <p className="text-[11px] text-solder leading-relaxed">
                {kb(activeBytes)} KB. The link works, but chat apps split long messages — paste it on its own
                line, or share the deck without your written answers
                {slim ? ` (${kb(slim.urlBytes)} KB)` : ''}.
              </p>
            </div>
          )}

          {/* Share Link Input with 1-click Copy */}
          {offersLink && (
            <div className="space-y-2">
              <label className="block text-xs font-bold text-solder">
                {usingSlim ? 'Compressed Shareable URL (without your answers):' : 'Compressed Shareable URL:'}
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  data-testid="share-link-input"
                  value={activeUrl}
                  className="w-full bg-chassis border border-edge px-3.5 py-2.5 text-xs text-bone font-mono focus:outline-none select-all truncate"
                />
                <button
                  type="button"
                  data-testid="share-copy-link"
                  onClick={handleCopyLink}
                  data-copy-status={linkCopy.copied() ? 'copied' : linkCopy.failed() ? 'failed' : 'idle'}
                  title={linkCopy.failed() ? linkCopy.message ?? undefined : undefined}
                  className={`flex items-center gap-1.5 px-4 py-2.5 font-bold text-xs transition-all shrink-0 cursor-pointer ${
                    linkCopy.copied() ? 'bg-amber600 text-bone' : 'bg-inset hover:bg-deck text-bone'
                  }`}
                >
                  {linkCopy.copied() ? (
                    <>
                      <span className="text-amber font-bold font-mono">[ OK ]</span>
                      <span>Copied!</span>
                    </>
                  ) : linkCopy.failed() ? (
                    <>
                      <span className="text-hazard-300 font-bold font-mono">[ ! ]</span>
                      <span>Copy Link</span>
                    </>
                  ) : (
                    <>
                      <span className="text-amber font-bold font-mono">[ COPY ]</span>
                      <span>Copy Link</span>
                    </>
                  )}
                </button>
              </div>

              {/* The refusal is stated where the learner is looking, with what to
                  do instead — the one thing the old console.error never did. */}
              {linkCopy.failed() && (
                <p data-testid="share-copy-failed" className="text-[11px] text-hazard-300 leading-relaxed">
                  {linkCopy.message}
                </p>
              )}

              {slim && (
                <button
                  type="button"
                  data-testid="share-slim-toggle"
                  onClick={() => { setPreferSlim(!usingSlim); playSound('pop'); }}
                  className="w-full text-left text-[11px] text-solder hover:text-bone bg-chassis border border-edge px-3 py-2 transition-colors cursor-pointer"
                >
                  <span className="text-amber font-mono font-bold">{usingSlim ? '[ FULL ]' : '[ SLIM ]'}</span>{' '}
                  {usingSlim
                    ? `Put your written answers back in the link (${kb(shareStats.urlBytes)} KB).`
                    : `Share the deck without your written answers (${kb(slim.urlBytes)} KB) — every exercise still arrives.`}
                </button>
              )}

              {!usingSlim && !shareStats.overLimit && (
                <button
                  type="button"
                  data-testid="share-save-file"
                  onClick={handleSaveFile}
                  className="text-[11px] text-solder hover:text-bone underline decoration-dotted cursor-pointer"
                >
                  Or send it as a file your classmate restores (no size limit)
                </button>
              )}
            </div>
          )}

          {shareStats.unshareable && (
            <button
              type="button"
              data-testid="share-save-file"
              onClick={handleSaveFile}
              className="w-full flex items-center justify-center gap-1.5 px-5 py-3 bg-inset hover:bg-deck border border-edge text-bone font-bold text-xs cursor-pointer"
            >
              <span className="text-amber font-bold font-mono">[ FILE ]</span>
              <span>Save schema file ({kb(shareStats.rawBytes)} KB JSON)</span>
            </button>
          )}

          {/* Compression & Privacy Diagnostics */}
          <div className="grid grid-cols-3 gap-2.5 text-center">
            <div className="p-3 bg-chassis border border-edge">
              <span className="text-[10px] text-solder uppercase block font-semibold">Original Payload</span>
              <span className="text-sm font-bold text-solder">
                {(shareStats.rawBytes / 1024).toFixed(1)} KB
              </span>
            </div>
            <div className="p-3 bg-chassis border border-edge">
              <span className="text-[10px] text-solder uppercase block font-semibold">LZ-Compressed</span>
              <span className="text-sm font-bold text-bone">
                {(shareStats.payloadBytes / 1024).toFixed(1)} KB
              </span>
            </div>
            <div className="p-3 bg-chassis border border-edge">
              <span className="text-[10px] text-solder uppercase block font-semibold">Compression</span>
              <span className="text-sm font-bold text-amber">
                {shareStats.savingsPct}% Reduced
              </span>
            </div>
          </div>

          {/* How It Works Explainer */}
          <div className="p-3.5 bg-inset/30 border border-edge/30 space-y-2 text-xs">
            <div className="flex items-center gap-1.5 font-bold text-bone">
              <span className="text-amber font-bold font-mono">[ OK ]</span>
              <span>How Stateless URL Sharing Works</span>
            </div>
            <ul className="space-y-1.5 text-solder text-[11px] leading-relaxed">
              <li className="flex items-start gap-1.5">
                <span className="text-bone">•</span>
                <span><strong>No Backend Required:</strong> The entire schema is compressed directly into the URL, after the `#`, so it is never sent to a server — no request line, no length rejection, and a bigger schema is simply a longer link.</span>
              </li>
              <li className="flex items-start gap-1.5">
                <span className="text-bone">•</span>
                <span><strong>Zero Account Barrier:</strong> Your classmates don&apos;t need to log in or create an account to immediately practice your analogies and flashcards.</span>
              </li>
              <li className="flex items-start gap-1.5">
                <span className="text-bone">•</span>
                <span><strong>Privacy Preserved:</strong> The schema travels strictly peer-to-peer via the URL without being stored on third-party tracking servers.</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 sm:p-5 bg-chassis border-t border-edge flex items-center justify-between gap-3">
          <span className="text-[11px] text-solder hidden sm:inline">
            {offersLink ? 'Paste in Discord, Slack, WhatsApp, or email' : 'Share the file, not a link'}
          </span>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            {offersLink && typeof navigator !== 'undefined' && 'share' in navigator && (
              <button
                type="button"
                onClick={handleNativeShare}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-bone bg-inset border border-edge cursor-pointer"
              >
                <span className="text-amber font-bold font-mono">[ SEND ]</span>
                <span>Share Via...</span>
              </button>
            )}

            {offersLink ? (
              <button
                type="button"
                data-testid="share-copy-url"
                onClick={handleCopyLink}
                data-copy-status={linkCopy.copied() ? 'copied' : linkCopy.failed() ? 'failed' : 'idle'}
                title={linkCopy.failed() ? linkCopy.message ?? undefined : undefined}
                className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-5 py-2.5 bg-inset hover:bg-deck text-bone font-bold text-xs cursor-pointer"
              >
                {linkCopy.copied() ? (
                  <span className="text-amber font-bold font-mono">[ OK ]</span>
                ) : linkCopy.failed() ? (
                  <span className="text-hazard-300 font-bold font-mono">[ ! ]</span>
                ) : (
                  <span className="text-amber font-bold font-mono">[ COPY ]</span>
                )}
                <span>
                  {linkCopy.copied()
                    ? 'Copied to Clipboard!'
                    : linkCopy.failed()
                      ? 'Copy failed — select the link'
                      : 'Copy Share URL'}
                </span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSaveFile}
                className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-5 py-2.5 bg-inset hover:bg-deck text-bone font-bold text-xs cursor-pointer"
              >
                <span className="text-amber font-bold font-mono">[ FILE ]</span>
                <span>Save schema file</span>
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
