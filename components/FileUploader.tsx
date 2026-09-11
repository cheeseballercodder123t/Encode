'use client';

import React, { useRef, useState } from 'react';
import { UploadedFileAsset } from '@/lib/types';
import { sound } from '@/lib/audio';
import { GoogleDriveModal } from './GoogleDriveModal';

interface FileUploaderProps {
  onFileLoaded: (file: UploadedFileAsset | null) => void;
  selectedFile: UploadedFileAsset | null;
  /** Compact strip shown under the notes textarea so file + text can be
      combined. Full dropzone is shown when standalone (02:PDF tab). */
  compact?: boolean;
}

export function FileUploader({ onFileLoaded, selectedFile, compact = false }: FileUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isDriveModalOpen, setIsDriveModalOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFile = (file: File) => {
    setErrorMessage(null);

    const validTypes = [
      'application/pdf',
      'image/png',
      'image/jpeg',
      'image/jpg',
      'image/webp',
      'image/gif'
    ];

    if (!validTypes.includes(file.type)) {
      setErrorMessage('Please upload a PDF document or an image (PNG, JPEG, WebP).');
      return;
    }

    // Limit to 15MB for fast parsing and encoding
    if (file.size > 15 * 1024 * 1024) {
      setErrorMessage('File size exceeds 15MB. Please upload a smaller file.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      if (!result) return;

      // Extract raw base64 data without data-uri prefix for Gemini API
      const base64Data = result.split(',')[1];
      const previewUrl = file.type.startsWith('image/') ? result : undefined;

      const asset: UploadedFileAsset = {
        name: file.name,
        type: file.type,
        size: file.size,
        base64Data,
        previewUrl,
      };

      onFileLoaded(asset);
      sound.playBeep(600, 'sine', 0.1);
    };

    reader.onerror = () => {
      setErrorMessage('Failed to read file.');
    };

    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  const clearFile = (e: React.MouseEvent) => {
    e.stopPropagation();
    onFileLoaded(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="w-full space-y-2">
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf,image/png,image/jpeg,image/webp"
        onChange={handleInputChange}
        className="hidden"
        id="multimodal-file-input"
      />

      {selectedFile ? (
        <div className="p-3 bg-deck border border-steel/40 flex items-center justify-between gap-3 ">
          <div className="flex items-center gap-3 min-w-0">
            {selectedFile.previewUrl ? (
              <img
                src={selectedFile.previewUrl}
                alt={selectedFile.name}
                className="w-10 h-10 object-cover border border-steel shrink-0"
              />
            ) : (
              <div className="w-10 h-10 bg-steel/10 border border-steel/30 flex items-center justify-center text-bone shrink-0">
                <span className="text-amber font-bold font-mono">[ FILE ]</span>
              </div>
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-bone text-xs truncate">{selectedFile.name}</span>
                <span className="px-1.5 py-0.5 bg-amber/20 text-amber300 text-[9px] font-bold ">
                  Multimodal Ready
                </span>
              </div>
              <p className="text-[11px] text-solder">
                {selectedFile.type.includes('pdf') ? 'PDF Document' : 'Image'} • {Math.round(selectedFile.size / 1024)} KB
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={clearFile}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center p-1.5 text-solder hover:text-hazard400 hover:bg-steel transition-none-colors shrink-0"
            title="Remove attachment"
            aria-label="Remove attached file"
          >
            <span className="text-amber font-bold font-mono">[ X ]</span>
          </button>
        </div>
      ) : compact ? (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          className="w-full min-h-[44px] px-3 py-2 bg-chassis/80 border border-dashed border-steel hover:border-amber text-[11px] font-mono text-solder hover:text-bone transition-none cursor-pointer flex items-center gap-2 text-left"
          title="Attach a PDF or image alongside your notes — both are sent to the encoder"
        >
          <span className="text-amber font-bold">[ +ATTACH FILE ]</span>
          <span className="truncate">PDF / image (optional) — combines with notes above</span>
        </button>
      ) : (
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => fileInputRef.current?.click()}
          className={`p-4 border-2 border-dashed  transition-none-all cursor-pointer flex flex-col sm:flex-row items-center justify-between gap-3 ${
            isDragging
              ? 'border-steel bg-steel/10'
              : 'border-steel hover:border-steel bg-chassis/80 hover:bg-deck'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-steel/10 border border-steel/20 text-bone">
              <span className="text-amber font-bold font-mono">[ UPLOAD ]</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-bone">
                  Attach Handwritten Notes, Whiteboard, or PDF Slides
                </span>
                <span className="px-1.5 py-0.5 bg-steel/20 text-bone text-[9px] font-bold ">
                  Gemini 3.7 Vision
                </span>
              </div>
              <p className="text-[11px] text-solder">
                Drag & drop or click to upload PDF lecture slides, diagrams, or photo of notes
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsDriveModalOpen(true);
              }}
              className="px-3 py-1.5 bg-steel/60 hover:bg-steel/60 border border-steel/40 text-bone text-xs font-bold transition-none-colors shrink-0 flex items-center gap-1.5 cursor-pointer"
            >
              <span className="text-amber font-bold font-mono">[ CLOUD ]</span>
              Import Google Drive
            </button>

            <button
              type="button"
              className="px-3 py-1.5 bg-deck hover:bg-steel border border-steel text-bone text-xs font-bold transition-none-colors shrink-0 flex items-center gap-1.5 cursor-pointer"
            >
              <span className="text-amber font-bold font-mono">[ IMG ]</span>
              Browse Local
            </button>
          </div>
        </div>
      )}

      {errorMessage && (
        <div className="flex items-center gap-1.5 text-xs text-hazard400 px-1">
          <span className="text-amber font-bold font-mono">[ ! ]</span>
          <span>{errorMessage}</span>
        </div>
      )}

      <GoogleDriveModal
        isOpen={isDriveModalOpen}
        onClose={() => setIsDriveModalOpen(false)}
        onFileImported={(asset) => {
          onFileLoaded(asset);
          setIsDriveModalOpen(false);
        }}
      />
    </div>
  );
}
