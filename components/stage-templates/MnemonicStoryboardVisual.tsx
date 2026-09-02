'use client';

import React, { useState } from 'react';
import { Activity, MnemonicStoryboardVisualData, StoryboardTile } from '@/lib/types';
import { Sparkles, Eye, EyeOff, BookOpen, Layers, CheckCircle2, Zap } from 'lucide-react';
import { playSound } from '@/lib/audio';

interface Props {
  activity: Activity;
  field1: string;
  field2: string;
  field3?: string;
  selectedPreset?: string;
}

const DEFAULT_TILES: StoryboardTile[] = [
  { symbol: 'H', name: 'Hydrogen', numberOrOrder: 1, categoryTag: 'Reactive Nonmetal', mnemonicHook: 'Harry the flying Helicopter chugging water', color: 'cyan' },
  { symbol: 'He', name: 'Helium', numberOrOrder: 2, categoryTag: 'Noble Gas', mnemonicHook: 'Inhaling glowing balloons and squeaking hilarious jokes', color: 'purple' },
  { symbol: 'Li', name: 'Lithium', numberOrOrder: 3, categoryTag: 'Alkali Metal', mnemonicHook: 'Chewing giant iPhone batteries that shoot sparks', color: 'emerald' },
  { symbol: 'Be', name: 'Beryllium', numberOrOrder: 4, categoryTag: 'Alkaline Earth', mnemonicHook: 'A golden Beetle wearing diamond armor', color: 'amber' },
  { symbol: 'B', name: 'Boron', numberOrOrder: 5, categoryTag: 'Metalloid', mnemonicHook: 'A Bored professor balancing on a broomstick', color: 'rose' }
];

export function MnemonicStoryboardVisual({ activity, field1, field2, field3 }: Props) {
  const visualData: MnemonicStoryboardVisualData = activity.visualData?.mnemonicStoryboard || {
    questTitle: 'The Genesis Quest: Elements 1 to 10',
    narrativeStory: 'Harry (H) the Helicopter is lifted by floating Helium (He) balloons, crashing into a giant Lithium (Li) battery guarded by an armored Beetle (Be) who is extremely Bored (B)...',
    tiles: DEFAULT_TILES
  };

  const [activeTileIndex, setActiveTileIndex] = useState<number | null>(0);
  const [cloakMode, setCloakMode] = useState<boolean>(false);
  const [revealedCloaks, setRevealedCloaks] = useState<Record<number, boolean>>({});
  const [activeTab, setActiveTab] = useState<'grid' | 'story'>('grid');

  const tiles = visualData.tiles && visualData.tiles.length > 0 ? visualData.tiles : DEFAULT_TILES;
  const activeTile = activeTileIndex !== null ? tiles[activeTileIndex] : null;

  const handleTileClick = (idx: number) => {
    setActiveTileIndex(idx);
    if (cloakMode) {
      setRevealedCloaks(prev => ({ ...prev, [idx]: !prev[idx] }));
    }
    playSound('pop');
  };

  const toggleCloakMode = () => {
    playSound('click');
    setCloakMode(!cloakMode);
    setRevealedCloaks({});
  };

  return (
    <div className="rounded-xl border border-emerald-500/30 bg-gradient-to-br from-emerald-950/20 via-[#0E111C] to-slate-900/60 p-4 shadow-lg backdrop-blur-md transition-all space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between border-b border-emerald-500/20 pb-3 gap-2">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-emerald-400 block">
              Mnemonic Storyboard & Interactive Element Grid
            </span>
            <h4 className="text-xs font-bold text-white">
              {visualData.questTitle}
            </h4>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {/* Tab Switcher */}
          <div className="flex bg-slate-900/80 p-0.5 rounded-lg border border-slate-800">
            <button
              type="button"
              onClick={() => setActiveTab('grid')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-colors ${
                activeTab === 'grid'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Layers className="w-3 h-3 inline mr-1" />
              Element Grid
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('story')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-colors ${
                activeTab === 'story'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <BookOpen className="w-3 h-3 inline mr-1" />
              Story Walk
            </button>
          </div>

          {/* Blind Retrieval Test Cloak Button */}
          <button
            type="button"
            onClick={toggleCloakMode}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all cursor-pointer ${
              cloakMode
                ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
            title="Hide names to test yourself from memory"
          >
            {cloakMode ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
            <span>{cloakMode ? 'Exit Cloak Test' : 'Test Recall (Cloak)'}</span>
          </button>
        </div>
      </div>

      {/* VIEW 1: Interactive Element Tiles */}
      {activeTab === 'grid' && (
        <div className="space-y-3">
          {/* Tiles Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-2.5">
            {tiles.map((tile, idx) => {
              const isSelected = activeTileIndex === idx;
              const isCloaked = cloakMode && !revealedCloaks[idx];

              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleTileClick(idx)}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer relative overflow-hidden flex flex-col justify-between min-h-[95px] ${
                    isSelected
                      ? 'bg-emerald-950/60 border-emerald-400 text-white ring-2 ring-emerald-500/30 shadow-lg shadow-emerald-950/50'
                      : 'bg-slate-900/80 border-slate-800 hover:border-slate-700 text-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between w-full mb-1">
                    <span className="text-[10px] font-mono text-slate-400 font-bold">
                      {tile.numberOrOrder !== undefined ? `#${tile.numberOrOrder}` : `0${idx + 1}`}
                    </span>
                    {tile.categoryTag && (
                      <span className="text-[8px] font-mono px-1 rounded bg-slate-950/80 border border-slate-800 text-emerald-300 truncate max-w-[70px]">
                        {tile.categoryTag}
                      </span>
                    )}
                  </div>

                  <div className="my-1">
                    <div className="text-xl font-black font-mono tracking-tight text-white">
                      {isCloaked ? '??' : tile.symbol}
                    </div>
                    <div className="text-[11px] font-semibold text-slate-300 truncate">
                      {isCloaked ? '(tap to flip)' : tile.name}
                    </div>
                  </div>

                  <div className="text-[9px] text-slate-400 truncate w-full mt-1">
                    {isCloaked ? '⚡ Memory Test' : `Hook: ${tile.mnemonicHook.slice(0, 18)}...`}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Selected Tile Inspector Card */}
          {activeTile && (
            <div className="p-3.5 rounded-xl bg-slate-900/90 border border-emerald-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex flex-col items-center justify-center font-mono shrink-0">
                  <span className="text-[9px] text-slate-400">{activeTile.numberOrOrder || 1}</span>
                  <span className="text-lg font-black text-emerald-300 leading-tight">{activeTile.symbol}</span>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h5 className="font-bold text-white text-sm">{activeTile.name}</h5>
                    {activeTile.categoryTag && (
                      <span className="px-1.5 py-0.2 rounded bg-emerald-950 border border-emerald-500/30 text-[9px] text-emerald-300 font-mono">
                        {activeTile.categoryTag}
                      </span>
                    )}
                  </div>
                  <p className="text-slate-200 mt-0.5 leading-relaxed font-serif">
                    <strong className="text-amber-300 font-sans font-bold">Unforgettable Sensory Hook: </strong>
                    &ldquo;{activeTile.mnemonicHook}&rdquo;
                  </p>
                </div>
              </div>

              <div className="text-[10px] text-slate-400 shrink-0 self-end sm:self-center font-mono">
                Tile {activeTileIndex !== null ? activeTileIndex + 1 : 1} of {tiles.length}
              </div>
            </div>
          )}
        </div>
      )}

      {/* VIEW 2: Full Narrative Story Walk */}
      {activeTab === 'story' && (
        <div className="p-4 rounded-xl bg-slate-900/90 border border-emerald-500/30 space-y-3">
          <div className="flex items-center gap-2 text-xs font-bold text-emerald-400 uppercase tracking-wider">
            <BookOpen className="w-4 h-4" />
            <span>The Connected Mnemonic Narrative</span>
          </div>
          <p className="text-sm text-slate-200 leading-relaxed font-serif bg-slate-950/80 p-4 rounded-xl border border-slate-800">
            {visualData.narrativeStory}
          </p>
          <p className="text-[11px] text-slate-400">
            💡 <strong>Memory Rule:</strong> Read through this story twice. Picture each bizarre action vividly in your mind. The sequence of actions locks the order into long-term visual memory.
          </p>
        </div>
      )}

      {/* User Deduction / Active Scaffold Output */}
      {(field1 || field2) && (
        <div className="p-3 rounded-xl bg-gradient-to-r from-emerald-950/40 to-slate-900/40 border border-emerald-500/30 text-xs space-y-1">
          <span className="text-[10px] font-mono font-bold text-emerald-300 uppercase block">
            Your Personal Mnemonic Schema
          </span>
          {field1 && <p className="text-slate-200"><strong>Story / Peg:</strong> {field1}</p>}
          {field2 && <p className="text-slate-300 text-[11px]"><strong>Items Encoded:</strong> {field2}</p>}
        </div>
      )}
    </div>
  );
}