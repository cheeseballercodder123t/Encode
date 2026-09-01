'use client';

import React, { useState } from 'react';
import { Play, Clock, ExternalLink, FastForward, Rewind } from 'lucide-react';
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
    <div className="w-full rounded-2xl border border-red-500/20 bg-slate-900/80 backdrop-blur-xl overflow-hidden shadow-2xl p-4 sm:p-5 space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-red-600/20 border border-red-500/30 text-red-400 shrink-0">
            <Play className="w-4 h-4 fill-red-400" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-slate-100 truncate">
              {youtubeData.title}
            </h3>
            <p className="text-xs text-slate-400 flex items-center gap-2 truncate">
              <span>{youtubeData.authorName || 'YouTube Educator'}</span>
              <span className="inline-block w-1 h-1 rounded-full bg-slate-600" />
              <span>{youtubeData.duration || 'Video Lecture'}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
          {/* Quick Seek Controls */}
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs">
            <button
              type="button"
              onClick={() => handleSeekOffset(-10)}
              title="Rewind 10s"
              className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
            >
              <Rewind className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => handleSeekOffset(10)}
              title="Forward 10s"
              className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
            >
              <FastForward className="w-3.5 h-3.5" />
            </button>
          </div>

          <a 
            href={youtubeData.videoUrl} 
            target="_blank" 
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 transition-colors"
          >
            <span>YouTube</span>
            <ExternalLink className="w-3 h-3 text-slate-400" />
          </a>
        </div>
      </div>

      {/* Video Player Box */}
      <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-black border border-slate-800">
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
            <span className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-cyan-400" />
              Cognitive Milestones & Timestamp Anchors
            </span>
            <span className="text-[11px] text-slate-500">
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
                  className={`flex items-start gap-2.5 p-2.5 rounded-xl text-left border transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-red-500/20 border-red-500/50 text-white shadow-lg shadow-red-500/10 ring-1 ring-red-500/40'
                      : 'bg-slate-800/60 hover:bg-slate-800 border-slate-700/60 text-slate-300'
                  }`}
                >
                  <span className="px-2 py-0.5 rounded-md bg-red-600/30 border border-red-500/40 text-red-300 text-xs font-mono font-bold shrink-0">
                    ▶ {ts.formatted}
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold leading-tight truncate">
                      {ts.label}
                    </p>
                    {ts.insight && (
                      <p className="text-[10px] text-slate-400 line-clamp-1 mt-0.5">
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
