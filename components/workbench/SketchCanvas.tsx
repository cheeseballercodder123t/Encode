'use client';

import React, { useRef, useState, useEffect } from 'react';

interface SketchCanvasProps {
  onSaveSketch?: (dataUrl: string) => void;
}

export function SketchCanvas({ onSaveSketch }: SketchCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const activeTouchIdRef = useRef<number | null>(null);
  const strokeHistoryRef = useRef<ImageData[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [color, setColor] = useState('#818cf8'); // Indigo default
  const [lineWidth, setLineWidth] = useState(3);
  const [isEraser, setIsEraser] = useState(false);
  const [canUndo, setCanUndo] = useState(false);

  const setupCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Handle high-DPI displays, capped so large phones do not allocate
    // oversized backing stores that drop strokes.
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  };

  useEffect(() => {
    setupCanvas();
    let resizeTimer: ReturnType<typeof setTimeout> | null = null;
    const handleResize = () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        // Preserve existing strokes across rotation/resize by snapshotting
        // the current bitmap, then restoring it onto the resized backing store.
        const canvas = canvasRef.current;
        const snapshot = canvas?.toDataURL();
        setupCanvas();
        if (canvas && snapshot) {
          const img = new Image();
          img.onload = () => {
            const ctx = canvas.getContext('2d');
            if (!ctx) return;
            const rect = canvas.getBoundingClientRect();
            ctx.clearRect(0, 0, rect.width, rect.height);
            ctx.drawImage(img, 0, 0, rect.width, rect.height);
          };
          img.src = snapshot;
        }
      }, 120);
    };
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
      if (resizeTimer) clearTimeout(resizeTimer);
    };
  }, []);

  const getPoint = (
    canvas: HTMLCanvasElement,
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>
  ) => {
    const rect = canvas.getBoundingClientRect();
    // Prefer changedTouches so touchend (where e.touches is empty) still maps
    // to the stroke that just ended.
    const touchList = 'changedTouches' in e ? e.changedTouches : null;
    const touch =
      touchList && touchList.length > 0
        ? Array.from(touchList).find(t => t.identifier === activeTouchIdRef.current) ?? touchList[0]
        : null;
    const clientX = touch ? touch.clientX : (e as React.MouseEvent<HTMLCanvasElement>).clientX;
    const clientY = touch ? touch.clientY : (e as React.MouseEvent<HTMLCanvasElement>).clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  const snapshotForUndo = (canvas: HTMLCanvasElement) => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    try {
      const snapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);
      strokeHistoryRef.current.push(snapshot);
      // Cap the stack so long sessions do not balloon memory on phones.
      if (strokeHistoryRef.current.length > 20) strokeHistoryRef.current.shift();
      setCanUndo(true);
    } catch {
      // getImageData can throw on tainted canvases; drawing still works.
    }
  };

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    // Ignore synthetic mouse events that some browsers fire after touch.
    if ('touches' in e && e.cancelable) e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Track one touch at a time so palm/second fingers cannot hijack the line.
    if ('touches' in e) {
      if (isDrawing) return;
      const touch = e.changedTouches[0];
      if (!touch) return;
      activeTouchIdRef.current = touch.identifier;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    snapshotForUndo(canvas);
    setIsDrawing(true);
    const { x, y } = getPoint(canvas, e);

    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    if ('touches' in e && e.cancelable) e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Ignore non-active touches when several fingers are down.
    if ('touches' in e && activeTouchIdRef.current !== null) {
      const stillDown = Array.from(e.touches).some(t => t.identifier === activeTouchIdRef.current);
      if (!stillDown) return;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { x, y } = getPoint(canvas, e);

    ctx.strokeStyle = isEraser ? '#07080D' : color;
    // Slightly heavier lines on coarse pointers so strokes stay visible.
    ctx.lineWidth = isEraser ? 16 : (activeTouchIdRef.current !== null ? lineWidth + 1 : lineWidth);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = (e?: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (e && 'touches' in e && activeTouchIdRef.current !== null) {
      const ended = Array.from(e.changedTouches).some(t => t.identifier === activeTouchIdRef.current);
      // Another finger lifted while the drawing finger is still down.
      if (!ended && e.touches.length > 0) return;
      activeTouchIdRef.current = null;
    }
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
    snapshotForUndo(canvas);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  const undoStroke = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const previous = strokeHistoryRef.current.pop();
    if (!previous) return;
    ctx.putImageData(previous, 0, 0);
    setCanUndo(strokeHistoryRef.current.length > 0);
  };

  return (
    <div className=" border border-steel/30 bg-[#07080D] p-3 space-y-2">
      {/* Canvas Toolbar */}
      <div className="flex items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setIsEraser(false)}
            className={`min-h-[44px] px-2.5 flex items-center border transition-colors ${!isEraser ? 'bg-steel/30 text-bone border-steel/40' : 'bg-deck text-solder border-steel'}`}
            title="Pen"
            aria-pressed={!isEraser}
          >
            <span className="text-amber font-bold font-mono text-[11px]">[ PEN ]</span>
          </button>

          <button
            type="button"
            onClick={() => setIsEraser(true)}
            className={`min-h-[44px] px-2.5 flex items-center border transition-colors ${isEraser ? 'bg-steel/30 text-bone border-steel/40' : 'bg-deck text-solder border-steel'}`}
            title="Eraser"
            aria-pressed={isEraser}
          >
            <span className="text-amber font-bold font-mono text-[11px]">[ ERASER ]</span>
          </button>

          {/* Color Presets */}
          {!isEraser && (
            <div className="flex items-center gap-2 pl-1">
              {['#818cf8', '#34d399', '#f43f5e', '#fbbf24', '#ffffff'].map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  aria-label={`Sketch color ${c}`}
                  aria-pressed={color === c}
                  className={`w-7 h-7 min-h-[28px] min-w-[28px] border ${color === c ? 'ring-2 ring-white scale-110' : 'border-steel'}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={undoStroke}
            disabled={!canUndo}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center gap-1 px-2 text-[11px] text-solder hover:text-bone transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            title="Undo last stroke"
          >
            <span className="text-amber font-bold font-mono">[ UNDO ]</span>
          </button>

          <button
            type="button"
            onClick={clearCanvas}
            className="min-h-[44px] flex items-center gap-1 px-2 text-[11px] text-solder hover:text-hazard400 transition-colors"
            title="Clear canvas"
          >
            <span className="text-amber font-bold font-mono">[ RESET ]</span>
            <span>Clear</span>
          </button>
        </div>
      </div>

      {/* Drawing Area : taller on phones so a finger does not cover the stroke. */}
      <canvas
        ref={canvasRef}
        onMouseDown={startDrawing}
        onMouseMove={draw}
        onMouseUp={stopDrawing}
        onMouseLeave={stopDrawing}
        onTouchStart={startDrawing}
        onTouchMove={draw}
        onTouchEnd={stopDrawing}
        onTouchCancel={stopDrawing}
        onContextMenu={e => e.preventDefault()}
        className="w-full h-44 sm:h-36 bg-[#0B0D14] border border-steel cursor-crosshair touch-none select-none"
      />
      <span className="text-[10px] text-solder block text-right font-mono">
        Paivio Dual-Coding Mental Sketchpad
      </span>
    </div>
  );
}