'use client';

import React, { useState, useMemo } from 'react';
import { motion } from 'motion/react';
import { SavedSchema } from '@/lib/types';
import { compressSchemaForUrl, generateStatelessShareUrl } from '@/lib/url-share';
import { playSound } from '@/lib/audio';

interface StatelessShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  schema: SavedSchema | null;
}

export default function StatelessShareModal({
  isOpen,
  onClose,
  schema
}: StatelessShareModalProps) {
  const [copied, setCopied] = useState(false);

  const shareStats = useMemo(() => {
    if (!schema) return null;
    const rawJson = JSON.stringify(schema);
    const compressed = compressSchemaForUrl(schema);
    const fullUrl = generateStatelessShareUrl(schema);
    
    const rawBytes = new Blob([rawJson]).size;
    const compressedBytes = new Blob([compressed]).size;
    const savingsPct = rawBytes > 0 
      ? Math.max(0, Math.round(((rawBytes - compressedBytes) / rawBytes) * 100))
      : 0;

    return {
      rawBytes,
      compressedBytes,
      savingsPct,
      fullUrl,
      compressedLength: compressed.length
    };
  }, [schema]);

  if (!isOpen || !schema || !shareStats) return null;

  const handleCopyLink = async () => {
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(shareStats.fullUrl);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = shareStats.fullUrl;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopied(true);
      playSound('success');
      setTimeout(() => setCopied(false), 3000);
    } catch (err) {
      console.error('Failed to copy link:', err);
    }
  };

  const handleNativeShare = async () => {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: `DeepEncode: ${schema.topicSummary}`,
          text: `Check out this cognitive encoding schema for "${schema.topicSummary}"!`,
          url: shareStats.fullUrl,
        });
        playSound('pop');
      } catch {
        // User cancelled or share failed
      }
    } else {
      handleCopyLink();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-chassis/85 overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="relative w-full max-w-xl bg-deck border border-steel/40 overflow-hidden my-6 flex flex-col"
      >
        {/* Header */}
        <div className="p-4 sm:p-6 border-b border-steel/30 flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 flex items-center justify-center   shrink-0">
              <span className="text-amber font-bold font-mono">[ SHARE ]</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg sm:text-xl font-black text-bone">
                  Stateless URL Sharing
                </h2>
                <span className="px-2 py-0.5 bg-steel/20 text-bone border border-steel/30 text-[10px] font-black uppercase tracking-wider">
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
            className="text-solder hover:text-bone p-2 bg-steel/80 hover:bg-steel transition-none-colors cursor-pointer text-xs"
          >
            [ X ]
          </button>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-6 space-y-5 text-bone">
          {/* Target Schema Preview */}
          <div className="p-3.5 bg-chassis border border-steel space-y-1.5">
            <div className="flex items-center justify-between text-[11px] text-solder">
              <span className="font-semibold uppercase tracking-wider text-solder">Schema to Share</span>
              <span className="px-2 py-0.5 bg-steel/20 text-bone font-bold text-[10px]">
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

          {/* Share Link Input with 1-click Copy */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-solder">
              Compressed Shareable URL:
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={shareStats.fullUrl}
                className="w-full bg-chassis border border-steel px-3.5 py-2.5 text-xs text-bone font-mono focus:outline-none select-all truncate"
              />
              <button
                type="button"
                onClick={handleCopyLink}
                className={`flex items-center gap-1.5 px-4 py-2.5  font-bold text-xs transition-none-all shrink-0 cursor-pointer  ${
                  copied
                    ? 'bg-amber600 text-bone '
                    : '   hover: hover: text-bone '
                }`}
              >
                {copied ? (
                  <>
                    <span className="text-amber font-bold font-mono">[ OK ]</span>
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <span className="text-amber font-bold font-mono">[ COPY ]</span>
                    <span>Copy Link</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Compression & Privacy Diagnostics */}
          <div className="grid grid-cols-3 gap-2.5 text-center">
            <div className="p-3 bg-chassis border border-steel">
              <span className="text-[10px] text-solder uppercase block font-semibold">Original Payload</span>
              <span className="text-sm font-bold text-solder">
                {(shareStats.rawBytes / 1024).toFixed(1)} KB
              </span>
            </div>
            <div className="p-3 bg-chassis border border-steel">
              <span className="text-[10px] text-solder uppercase block font-semibold">LZ-Compressed</span>
              <span className="text-sm font-bold text-bone">
                {(shareStats.compressedBytes / 1024).toFixed(1)} KB
              </span>
            </div>
            <div className="p-3 bg-chassis border border-steel">
              <span className="text-[10px] text-solder uppercase block font-semibold">Compression</span>
              <span className="text-sm font-bold text-amber">
                {shareStats.savingsPct}% Reduced
              </span>
            </div>
          </div>

          {/* How It Works Explainer */}
          <div className="p-3.5 bg-steel/30 border border-steel/30 space-y-2 text-xs">
            <div className="flex items-center gap-1.5 font-bold text-bone">
              <span className="text-amber font-bold font-mono">[ OK ]</span>
              <span>How Stateless URL Sharing Works</span>
            </div>
            <ul className="space-y-1.5 text-solder text-[11px] leading-relaxed">
              <li className="flex items-start gap-1.5">
                <span className="text-bone">•</span>
                <span><strong>No Backend Required:</strong> The entire schema is compressed directly into the URL query parameter using LZString.</span>
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
        <div className="p-4 sm:p-5 bg-chassis border-t border-steel flex items-center justify-between gap-3">
          <span className="text-[11px] text-solder hidden sm:inline">
            Paste in Discord, Slack, WhatsApp, or email
          </span>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            {typeof navigator !== 'undefined' && 'share' in navigator && (
              <button
                type="button"
                onClick={handleNativeShare}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-bone bg-steel hover:bg-steel border border-steel cursor-pointer"
              >
                <span className="text-amber font-bold font-mono">[ SEND ]</span>
                <span>Share Via...</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleCopyLink}
              className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-5 py-2.5 hover: hover: text-bone font-bold text-xs   cursor-pointer"
            >
              {copied ? <span className="text-amber font-bold font-mono">[ OK ]</span> : <span className="text-amber font-bold font-mono">[ COPY ]</span>}
              <span>{copied ? 'Copied to Clipboard!' : 'Copy Share URL'}</span>
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
