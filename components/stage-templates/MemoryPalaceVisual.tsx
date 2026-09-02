'use client';

import React, { useState } from 'react';
import { Activity, ActivityVisualData } from '@/lib/types';
import { Compass, MapPin, Footprints, Sparkles, Home } from 'lucide-react';

interface Props {
  activity: Activity;
  field1: string;
  field2: string;
  field3?: string;
}

export function MemoryPalaceVisual({ activity, field1, field2, field3 }: Props) {
  const visualData: ActivityVisualData = activity.visualData || {};
  const [activeLocusIndex, setActiveLocusIndex] = useState(0);

  const defaultRooms = [
    { locusNumber: 1, roomName: 'Foyer / Front Door', itemPlaced: 'Item 1', vividSensoryHook: 'Massive glowing acid dripping on welcome mat' },
    { locusNumber: 2, roomName: 'Living Room Sofa', itemPlaced: 'Item 2', vividSensoryHook: 'Explosive alkali metal bouncing on the velvet cushions' },
    { locusNumber: 3, roomName: 'Kitchen Counter', itemPlaced: 'Item 3', vividSensoryHook: 'Giant smelling sulfur cloud pouring from blender' },
    { locusNumber: 4, roomName: 'Hallway Mirror', itemPlaced: 'Item 4', vividSensoryHook: 'Mirror reflecting pulsating cranial nerves blinking in rhythm' },
    { locusNumber: 5, roomName: 'Balcony / Exit', itemPlaced: 'Item 5', vividSensoryHook: 'Golden trophy vibrating violently in the wind' }
  ];

  const rooms = visualData.palaceRooms && visualData.palaceRooms.length > 0
    ? visualData.palaceRooms
    : defaultRooms;

  return (
    <div className="rounded-xl border border-violet-500/30 bg-gradient-to-br from-violet-950/20 via-[#0E111C] to-slate-900/60 p-4 shadow-lg backdrop-blur-md">
      <div className="flex items-center justify-between border-b border-violet-500/20 pb-2.5 mb-3.5">
        <div className="flex items-center gap-2">
          <div className="p-1 rounded bg-violet-500/20 text-violet-400">
            <Home className="w-3.5 h-3.5" />
          </div>
          <span className="text-[11px] font-black uppercase tracking-wider text-violet-300">
            Method of Loci / Memory Palace Spatial Journey
          </span>
        </div>
        <span className="text-[9px] font-mono font-bold text-violet-300 bg-violet-950/40 border border-violet-500/30 px-2 py-0.5 rounded">
          Spatial Architectural Walkthrough
        </span>
      </div>

      {/* Spatial Journey Map Walkway */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-2 mb-3">
        {rooms.map((room, idx) => {
          const isSelected = idx === activeLocusIndex;
          return (
            <button
              key={idx}
              type="button"
              onClick={() => setActiveLocusIndex(idx)}
              className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer relative ${
                isSelected
                  ? 'bg-violet-600/30 border-violet-400 shadow-md shadow-violet-500/20 text-white'
                  : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="w-5 h-5 rounded-full bg-violet-500/20 border border-violet-400/40 text-violet-300 text-[10px] font-mono font-bold flex items-center justify-center">
                  {room.locusNumber || idx + 1}
                </span>
                {isSelected && <MapPin className="w-3.5 h-3.5 text-violet-400" />}
              </div>

              <div className="text-[11px] font-bold text-white leading-tight line-clamp-1">
                {room.roomName}
              </div>
              <div className="text-[10px] text-violet-300/80 mt-0.5 font-mono line-clamp-1">
                {room.itemPlaced}
              </div>
            </button>
          );
        })}
      </div>

      {/* Focused Locus Station Card */}
      <div className="p-3 rounded-xl bg-violet-950/30 border border-violet-500/30 flex items-start gap-3 text-xs">
        <div className="w-8 h-8 rounded-xl bg-violet-500/20 border border-violet-400/40 text-violet-300 flex items-center justify-center shrink-0 font-mono font-black text-sm">
          #{rooms[activeLocusIndex]?.locusNumber || activeLocusIndex + 1}
        </div>
        <div className="flex-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-white">
              Station: {rooms[activeLocusIndex]?.roomName}
            </span>
            <span className="text-[9px] font-mono font-bold text-violet-400 uppercase">
              Placed: {rooms[activeLocusIndex]?.itemPlaced}
            </span>
          </div>
          <p className="text-[11px] text-slate-300 mt-1 font-serif italic">
            <strong className="text-violet-300 not-italic font-sans">Bizarre Sensory Cue: </strong>
            &ldquo;{rooms[activeLocusIndex]?.vividSensoryHook}&rdquo;
          </p>

          {field1 && (
            <div className="mt-2 pt-2 border-t border-violet-500/20 text-[10px] text-violet-200">
              <strong className="font-mono text-violet-400">Your Locus Placement: </strong>
              {field1}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
