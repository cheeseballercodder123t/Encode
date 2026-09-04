'use client';

import React, { useRef, useState, useEffect } from 'react';
import { Palette, RotateCcw, PenTool, Eraser, Check } from 'lucide-react';

interface SketchCanvasProps {
  onSaveSketch?: (dataUrl: string) => void;
}

export function SketchCanvas({ onSaveSketch }: SketchCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [color, setColor] = useState('#818cf8'); // Indigo default
  const [lineWidth, setLineWidth] = useState(3);
  const [isEraser, setIsEraser] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Handle high-DPI displays
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * 2;
    canvas.height = rect.height * 2;
    ctx.scale(2, 2);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }, []);

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    setIsDrawing(true);
    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    ctx.beginPath();
    ctx.moveTo(clientX - rect.left, clientY - rect.top);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    ctx.strokeStyle = isEraser ? '#07080D' : color;
    ctx.lineWidth = isEraser ? 16 : lineWidth;
    ctx.lineTo(clientX - rect.left, clientY - rect.top);
    ctx.stroke();
  };

  const stopDrawing = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    if (onSaveSketch && canvasRef.current) {
      onSaveSketch(canvasRef.current.toDataURL());
    }
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  return (
    <div className="rounded-xl border border-indigo-500/30 bg-[#07080D] p-3 space-y-2">
      {/* Canvas Toolbar */}
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setIsEraser(false)}
            className={`p-1.5 rounded-lg border transition-colors ${!isEraser ? 'bg-indigo-600/30 text-indigo-300 border-indigo-500/40' : 'bg-slate-900 text-slate-400 border-slate-800'}`}
            title="Pen"
          >
            <PenTool className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => setIsEraser(true)}
            className={`p-1.5 rounded-lg border transition-colors ${isEraser ? 'bg-indigo-600/30 text-indigo-300 border-indigo-500/40' : 'bg-slate-900 text-slate-400 border-slate-800'}`}
            title="Eraser"
          >
            <Eraser className="w-3.5 h-3.5" />
          </button>

          {/* Color Presets */}
          {!isEraser && (
            <div className="flex items-center gap-1 pl-1">
              {['#818cf8', '#34d399', '#f43f5e', '#fbbf24', '#ffffff'].map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`w-4 h-4 rounded-full border ${color === c ? 'ring-2 ring-white scale-110' : 'border-slate-700'}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={clearCanvas}
          className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-rose-400 p-1 rounded transition-colors"
          title="Clear canvas"
        >
          <RotateCcw className="w-3 h-3" />
          <span>Clear</span>
        </button>
      </div>

      {/* Drawing Area */}
      <canvas
        ref={canvasRef}
        onMouseDown={startDrawing}
        onMouseMove={draw}
        onMouseUp={stopDrawing}
        onMouseLeave={stopDrawing}
        onTouchStart={startDrawing}
        onTouchMove={draw}
        onTouchEnd={stopDrawing}
        className="w-full h-36 bg-[#0B0D14] rounded-lg border border-slate-800 cursor-crosshair touch-none"
      />
      <span className="text-[10px] text-slate-500 block text-right font-mono">
        Paivio Dual-Coding Mental Sketchpad
      </span>
    </div>
  );
}