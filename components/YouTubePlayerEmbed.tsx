'use client';

import React, { useState } from 'react';
import { YouTubeMetadata, VideoTimestamp } from '@/lib/types';
import { playSound } from '@/lib/audio';

interface YouTubePlayerEmbedProps {
  youtubeData: YouTubeMetadata;
  activeTimestamp?: VideoTimestamp;
  onSelectTimestamp?: (ts: VideoTimestamp) => void;
}

export function YouTubePlayerEmbed({
  youtubeData,
  activeTimestamp,
  onSelectTimestamp,
}: YouTubePlayerEmbedProps) {
  const [manualSeconds, setManualSeconds] = useState<number | null>(null);

  // Active seconds derived cleanly: manual selection takes precedence when changed
  const currentSeconds = manualSeconds !== null 
    ? manualSeconds 
    : (activeTimestamp?.seconds ?? (youtubeData.timestamps[0]?.seconds ?? 0));

  const handleJumpToTimestamp = (ts: VideoTimestamp) => {
    setManualSeconds(ts.seconds);
    playSound('click');
    if (onSelectTimestamp) {
      onSelectTimestamp(ts);
    }
  };

  const handleSeekOffset = (offsetSeconds: number) => {
    setManualSeconds(Math.max(0, currentSeconds + offsetSeconds));
    playSound('pop');
  };

  const embedUrl = `https://www.youtube-nocookie.com/embed/${youtubeData.videoId}?autoplay=1&start=${currentSeconds}&rel=0`;

  return (
    <div className="w-full border border-hazard500/20 bg-deck/80  overflow-hidden  p-4 sm:p-5 space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-steel pb-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex items-center justify-center w-8 h-8 bg-hazard600/20 border border-hazard500/30 text-hazard400 shrink-0">
            <span className="text-amber font-bold font-mono">[ PLAY ]</span>
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-bone truncate">
              {youtubeData.title}
            </h3>
            <p className="text-xs text-solder flex items-center gap-2 truncate">
              <span>{youtubeData.authorName || 'YouTube Educator'}</span>
              <span className="inline-block w-1 h-1 bg-steel" />
              <span>{youtubeData.duration || 'Video Lecture'}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
          {/* Quick Seek Controls */}
          <div className="flex items-center gap-1 bg-chassis p-1 border border-steel text-xs">
            <button
              type="button"
              onClick={() => handleSeekOffset(-10)}
              title="Rewind 10s"
              className="p-1 hover:bg-steel text-solder hover:text-bone transition-none-colors"
            >
              <span className="text-amber font-bold font-mono">[ REWIND ]</span>
            </button>
            <button
              type="button"
              onClick={() => handleSeekOffset(10)}
              title="Forward 10s"
              className="p-1 hover:bg-steel text-solder hover:text-bone transition-none-colors"
            >
              <span className="text-amber font-bold font-mono">[ SKIP ]</span>
            </button>
          </div>

          <a 
            href={youtubeData.videoUrl} 
            target="_blank" 
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-steel hover:bg-steel text-xs font-semibold text-solder transition-none-colors"
          >
            <span>YouTube</span>
            <span className="text-amber font-bold font-mono">[ EXT ]</span>
          </a>
        </div>
      </div>

      {/* Video Player Box */}
      <div className="relative w-full aspect-video overflow-hidden bg-chassis border border-steel">
        <iframe
          src={embedUrl}
          title={youtubeData.title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          className="absolute inset-0 w-full h-full"
        />
      </div>

      {/* Timestamp milestones bar */}
      {youtubeData.timestamps && youtubeData.timestamps.length > 0 && (
        <div className="space-y-2 pt-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-solder uppercase tracking-wider flex items-center gap-1.5">
              <span className="text-amber font-bold font-mono">[ TIME ]</span>
              Cognitive Milestones & Timestamp Anchors
            </span>
            <span className="text-[11px] text-solder">
              Click anchor to jump to lecture moment
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {youtubeData.timestamps.map((ts, idx) => {
              const isSelected = currentSeconds === ts.seconds;
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleJumpToTimestamp(ts)}
                  className={`flex items-start gap-2.5 p-2.5  text-left border transition-none-all cursor-pointer ${
                    isSelected
                      ? 'bg-hazard500/20 border-hazard500/50 text-bone   ring-1 ring-red-500/40'
                      : 'bg-steel/60 hover:bg-steel border-steel/60 text-solder'
                  }`}
                >
                  <span className="px-2 py-0.5 bg-hazard600/30 border border-hazard500/40 text-hazard300 text-xs font-mono font-bold shrink-0">
                    ▶ {ts.formatted}
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold leading-tight truncate">
                      {ts.label}
                    </p>
                    {ts.insight && (
                      <p className="text-[10px] text-solder line-clamp-1 mt-0.5">
                        {ts.insight}
                      </p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
