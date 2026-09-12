'use client';

import React, { useState } from 'react';
import { Activity, MnemonicStoryboardVisualData, StoryboardTile } from '@/lib/types';
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
    <div className="border border-steel bg-chassis p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-steel pb-3 gap-2">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-amber block">
            MNEMONIC STORYBOARD // INTERACTIVE ELEMENT GRID
          </span>
          <h4 className="text-xs font-bold text-bone">
            {visualData.questTitle}
          </h4>
        </div>
        <span className="text-[9px] font-mono font-bold text-solder border border-steel px-2 py-0.5">
          {tiles.length} TILES
        </span>
      </div>

      {/* Action Controls */}
      <div className="flex items-center gap-2">
        {/* Tab Switcher */}
        <div className="flex border border-steel bg-chassis">
          <button
            type="button"
            onClick={() => { setActiveTab('grid'); playSound('click'); }}
            className={`px-3 py-1 text-[11px] font-bold border-r border-steel transition-none ${
              activeTab === 'grid'
                ? 'bg-amber text-chassis'
                : 'bg-deck text-solder'
            }`}
          >
            ELEMENT GRID
          </button>
          <button
            type="button"
            onClick={() => { setActiveTab('story'); playSound('click'); }}
            className={`px-3 py-1 text-[11px] font-bold transition-none ${
              activeTab === 'story'
                ? 'bg-amber text-chassis'
                : 'bg-deck text-solder'
            }`}
          >
            STORY WALK
          </button>
        </div>

        <button
          type="button"
          onClick={toggleCloakMode}
          className={`text-[10px] font-mono font-bold uppercase tracking-wider border transition-none cursor-pointer ${
            cloakMode
              ? 'bg-hazard border-hazard text-bone'
              : 'bg-chassis border-steel text-solder'
          }`}
        >
          [ CLOAK: {cloakMode ? 'ON' : 'OFF'} ]
        </button>
                        </div>

      {/* VIEW 1: Interactive Element Tiles */}
      {activeTab === 'grid' && (
        <div className="space-y-3">
          {/* Tiles Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
            {tiles.map((tile, idx) => {
              const isRevealed = !cloakMode || revealedCloaks[idx];

              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleTileClick(idx)}
                  className="p-3 border text-left transition-none cursor-pointer"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[9px] font-mono font-bold text-solder">
                      {tile.numberOrOrder || idx + 1}
                    </span>
                    <span className="text-[9px] font-mono text-solder">
                      {isRevealed ? tile.mnemonicHook.slice(0, 18) + '...' : 'MNEMONIC HIDDEN'}
                    </span>
                  </div>
                  <div className={`w-10 h-10 border flex items-center justify-center font-mono text-lg font-bold mb-1 ${
                    activeTileIndex === idx ? 'border-amber text-chassis' : 'border-steel text-bone'
                  }`}>
                    {tile.symbol}
                  </div>
                  <div className="text-xs font-bold text-bone truncate">
                    {tile.name}
                  </div>
                  {tile.categoryTag && (
                    <span className="inline-block mt-1 text-[9px] font-mono border border-steel px-1 py-0.5 text-solder">
                      {tile.categoryTag}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Selected Tile Inspector Card */}
          {activeTile && (
            <div className="p-3.5 bg-deck/90 border border-amber/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-amber/20 border border-amber/40 flex flex-col items-center justify-center font-mono shrink-0">
                  <span className="text-[9px] text-solder">{activeTile.numberOrOrder || 1}</span>
                  <span className="text-lg font-black text-amber300 leading-tight">{activeTile.symbol}</span>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h5 className="font-bold text-bone text-sm">{activeTile.name}</h5>
                    {activeTile.categoryTag && (
                      <span className="px-1.5 py-0.5 bg-amber950 border border-amber/30 text-[9px] text-amber300 font-mono">
                        {activeTile.categoryTag}
                      </span>
                    )}
                  </div>
                  <p className="text-bone mt-0.5 leading-relaxed font-mono">
                    <strong className="text-amber font-mono font-bold">Unforgettable Sensory Hook: </strong>
                    &ldquo;{activeTile.mnemonicHook}&rdquo;
                  </p>
                </div>
              </div>

              <div className="text-[10px] text-solder shrink-0 self-end sm:self-center font-mono">
                Tile {activeTileIndex !== null ? activeTileIndex + 1 : 1} of {tiles.length}
              </div>
            </div>
          )}
        </div>
      )}

      {/* VIEW 2: Full Narrative Story Walk */}
      {activeTab === 'story' && (
        <div className="p-4 border border-steel bg-deck space-y-3">
          <div className="flex items-center gap-2 text-xs font-bold text-amber uppercase tracking-wider">
            THE CONNECTED MNEMONIC NARRATIVE
          </div>
          <p className="text-sm text-bone leading-relaxed font-mono p-4 border border-steel bg-chassis">
            {visualData.narrativeStory}
          </p>
          <p className="text-[11px] text-solder">
            <strong>MEMORY RULE:</strong> Read through this story twice. Picture each bizarre action vividly in your mind. The sequence of actions locks the order into long-term visual memory.
          </p>
        </div>
      )}

      {/* User Deduction / Active Scaffold Output */}
      {(field1 || field2) && (
        <div className="p-3 border border-steel bg-deck text-xs space-y-1">
          <span className="text-[10px] font-mono font-bold uppercase text-amber block">
            YOUR PERSONAL MNEMONIC SCHEMA
          </span>
          {field1 && <p className="text-bone"><strong>STORY / PEG:</strong> {field1}</p>}
          {field2 && <p className="text-solder"><strong>ITEMS ENCODED:</strong> {field2}</p>}
        </div>
      )}

    </div>
  );
}