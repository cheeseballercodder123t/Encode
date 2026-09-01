'use client';

import React, { useRef, useState } from 'react';
import { 
  FileText, 
  Image as ImageIcon, 
  UploadCloud, 
  X, 
  File, 
  Check, 
  Sparkles,
  AlertCircle,
  Cloud
} from 'lucide-react';
import { UploadedFileAsset } from '@/lib/types';
import { sound } from '@/lib/audio';
import { GoogleDriveModal } from './GoogleDriveModal';

interface FileUploaderProps {
  onFileLoaded: (file: UploadedFileAsset | null) => void;
  selectedFile: UploadedFileAsset | null;
}

export function FileUploader({ onFileLoaded, selectedFile }: FileUploaderProps) {
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
        <div className="p-3 bg-[#141724] border border-indigo-500/40 rounded-xl flex items-center justify-between gap-3 shadow-lg">
          <div className="flex items-center gap-3 min-w-0">
            {selectedFile.previewUrl ? (
              <img
                src={selectedFile.previewUrl}
                alt={selectedFile.name}
                className="w-10 h-10 object-cover rounded-lg border border-slate-700 shrink-0"
              />
            ) : (
              <div className="w-10 h-10 rounded-lg bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shrink-0">
                <FileText className="w-5 h-5" />
              </div>
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-white text-xs truncate">{selectedFile.name}</span>
                <span className="px-1.5 py-0.2 bg-emerald-500/20 text-emerald-300 text-[9px] font-bold rounded">
                  Multimodal Ready
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                {selectedFile.type.includes('pdf') ? 'PDF Document' : 'Image'} • {Math.round(selectedFile.size / 1024)} KB
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={clearFile}
            className="p-1.5 text-slate-400 hover:text-red-400 rounded-lg hover:bg-slate-800 transition-colors shrink-0"
            title="Remove attachment"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => fileInputRef.current?.click()}
          className={`p-4 border-2 border-dashed rounded-xl transition-all cursor-pointer flex flex-col sm:flex-row items-center justify-between gap-3 ${
            isDragging
              ? 'border-indigo-500 bg-indigo-500/10'
              : 'border-slate-800 hover:border-slate-700 bg-[#0F111A]/80 hover:bg-[#121522]'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-600/10 border border-indigo-500/20 text-indigo-400">
              <UploadCloud className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-200">
                  Attach Handwritten Notes, Whiteboard, or PDF Slides
                </span>
                <span className="px-1.5 py-0.2 bg-purple-500/20 text-purple-300 text-[9px] font-bold rounded">
                  Gemini 3.7 Vision
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
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
              className="px-3 py-1.5 bg-indigo-950/60 hover:bg-indigo-900/60 border border-indigo-500/40 text-indigo-300 text-xs font-bold rounded-lg transition-colors shrink-0 flex items-center gap-1.5 cursor-pointer"
            >
              <Cloud className="w-3.5 h-3.5 text-indigo-400" />
              Import Google Drive
            </button>

            <button
              type="button"
              className="px-3 py-1.5 bg-[#181C2C] hover:bg-[#20253A] border border-slate-700 text-slate-200 text-xs font-bold rounded-lg transition-colors shrink-0 flex items-center gap-1.5 cursor-pointer"
            >
              <ImageIcon className="w-3.5 h-3.5 text-indigo-400" />
              Browse Local
            </button>
          </div>
        </div>
      )}

      {errorMessage && (
        <div className="flex items-center gap-1.5 text-xs text-red-400 px-1">
          <AlertCircle className="w-3.5 h-3.5" />
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
