'use client';

import React, { useState, useEffect } from 'react';
import { 
  X, 
  Search, 
  FileText, 
  Image as ImageIcon, 
  Loader2, 
  Cloud, 
  Check, 
  AlertCircle, 
  RefreshCw, 
  Download,
  Key,
  ExternalLink,
  Lock
} from 'lucide-react';
import { 
  DriveFileItem, 
  requestDriveAccessToken, 
  fetchDriveFiles, 
  downloadDriveFileToAsset 
} from '@/lib/google-drive';
import { UploadedFileAsset } from '@/lib/types';
import { playSound } from '@/lib/audio';

interface GoogleDriveModalProps {
  isOpen: boolean;
  onClose: () => void;
  onFileImported: (asset: UploadedFileAsset) => void;
}

export function GoogleDriveModal({ isOpen, onClose, onFileImported }: GoogleDriveModalProps) {
  const [accessToken, setAccessToken] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return sessionStorage.getItem('deepencode_gdrive_token') || '';
    }
    return '';
  });
  const [customClientId, setCustomClientId] = useState<string>('');
  const [manualToken, setManualToken] = useState<string>('');
  const [showManualInput, setShowManualInput] = useState<boolean>(false);
  const [files, setFiles] = useState<DriveFileItem[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isDownloading, setIsDownloading] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadFiles = React.useCallback(async (token: string, search: string = '') => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const driveFiles = await fetchDriveFiles(token, search);
      setFiles(driveFiles);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to fetch files from Google Drive');
      if (err.message?.includes('expired') || err.message?.includes('invalid')) {
        setAccessToken('');
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      const savedToken = sessionStorage.getItem('deepencode_gdrive_token');
      if (savedToken) {
        Promise.resolve().then(() => {
          loadFiles(savedToken);
        });
      }
    }
  }, [isOpen, loadFiles]);

  if (!isOpen) return null;

  const handleConnectOAuth = async () => {
    playSound('click');
    setErrorMessage(null);
    setIsLoading(true);
    try {
      const token = await requestDriveAccessToken(customClientId || undefined);
      setAccessToken(token);
      await loadFiles(token, searchQuery);
    } catch (err: any) {
      setErrorMessage(err.message || 'Google OAuth Sign-In was cancelled or failed.');
      setShowManualInput(true);
    } finally {
      setIsLoading(false);
    }
  };

  const handleApplyManualToken = () => {
    if (!manualToken.trim()) return;
    playSound('click');
    const token = manualToken.trim();
    sessionStorage.setItem('deepencode_gdrive_token', token);
    setAccessToken(token);
    loadFiles(token, searchQuery);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (accessToken) {
      loadFiles(accessToken, searchQuery);
    }
  };

  const handleSelectFile = async (file: DriveFileItem) => {
    playSound('click');
    setIsDownloading(file.id);
    setErrorMessage(null);
    try {
      const asset = await downloadDriveFileToAsset(file, accessToken);
      onFileImported(asset);
      playSound('success');
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || `Failed to download ${file.name}`);
    } finally {
      setIsDownloading(null);
    }
  };

  const handleDisconnect = () => {
    playSound('click');
    sessionStorage.removeItem('deepencode_gdrive_token');
    setAccessToken('');
    setFiles([]);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-[#0F111A] border border-indigo-500/30 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-gradient-to-r from-indigo-950/40 via-slate-900 to-slate-950">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <Cloud className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-white text-base">Google Drive Importer</h3>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  PDF Slides & Notes
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Browse and encode lecture slides, textbook PDFs, and diagrams directly from your Google Drive
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Area */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {errorMessage && (
            <div className="p-3 rounded-xl bg-red-950/40 border border-red-500/40 text-xs text-red-300 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-400 mt-0.5" />
              <div className="flex-1 leading-relaxed">{errorMessage}</div>
            </div>
          )}

          {!accessToken ? (
            /* Unauthenticated View */
            <div className="py-8 px-4 text-center space-y-5 max-w-md mx-auto">
              <div className="w-16 h-16 mx-auto rounded-2xl bg-indigo-600/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shadow-xl shadow-indigo-500/10">
                <Cloud className="w-8 h-8" />
              </div>

              <div>
                <h4 className="font-bold text-white text-lg">Connect Google Drive Account</h4>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                  Authorize read-only access to select your PDF presentation slides, lecture notes, and whiteboard images.
                </p>
              </div>

              <button
                onClick={handleConnectOAuth}
                disabled={isLoading}
                className="w-full py-3 px-4 rounded-xl font-bold text-xs text-white bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 shadow-lg shadow-indigo-500/25 flex items-center justify-center gap-2.5 transition cursor-pointer disabled:opacity-50"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Connecting Google OAuth...
                  </>
                ) : (
                  <>
                    <Cloud className="w-4 h-4" />
                    Sign in with Google Drive
                  </>
                )}
              </button>

              <div className="pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowManualInput(!showManualInput)}
                  className="text-[11px] font-semibold text-slate-400 hover:text-indigo-300 transition flex items-center justify-center gap-1 mx-auto cursor-pointer"
                >
                  <Key className="w-3 h-3" />
                  {showManualInput ? 'Hide manual OAuth options' : 'Enter Google OAuth Access Token directly'}
                </button>

                {showManualInput && (
                  <div className="mt-3 p-3 rounded-xl bg-slate-900 border border-slate-800 text-left space-y-2">
                    <label className="text-[11px] font-bold text-slate-300 block">
                      Google OAuth Access Token:
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="password"
                        placeholder="ya29.a0A..."
                        value={manualToken}
                        onChange={(e) => setManualToken(e.target.value)}
                        className="flex-1 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-xs text-indigo-200 focus:outline-none focus:border-indigo-500"
                      />
                      <button
                        onClick={handleApplyManualToken}
                        className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white font-bold text-xs hover:bg-indigo-500 transition cursor-pointer"
                      >
                        Apply
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* Authenticated Drive Files View */
            <div className="space-y-4">
              {/* Top Controls */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                <form onSubmit={handleSearchSubmit} className="flex-1 flex gap-2">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      placeholder="Search PDF slides, lectures, diagrams..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
                    />
                  </div>
                  <button
                    type="submit"
                    className="px-3 py-2 rounded-xl bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 hover:bg-indigo-600/30 text-xs font-bold transition cursor-pointer"
                  >
                    Search
                  </button>
                </form>

                <div className="flex items-center justify-between sm:justify-end gap-2 text-xs">
                  <button
                    onClick={() => loadFiles(accessToken, searchQuery)}
                    disabled={isLoading}
                    className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
                    title="Refresh file list"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                  </button>
                  <button
                    onClick={handleDisconnect}
                    className="px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-red-400 text-[11px] font-bold transition cursor-pointer"
                  >
                    Disconnect
                  </button>
                </div>
              </div>

              {/* Files Grid/List */}
              {isLoading ? (
                <div className="py-12 text-center text-slate-400 space-y-2">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto text-indigo-400" />
                  <p className="text-xs">Fetching Google Drive slides and notes...</p>
                </div>
              ) : files.length === 0 ? (
                <div className="py-12 text-center border-2 border-dashed border-slate-800 rounded-xl space-y-2">
                  <FileText className="w-8 h-8 mx-auto text-slate-600" />
                  <p className="text-xs font-bold text-slate-400">No PDF slides or images found in your Google Drive.</p>
                  <p className="text-[11px] text-slate-500">Upload slides to Google Drive or adjust your search term.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[50vh] overflow-y-auto pr-1">
                  {files.map((file) => {
                    const isPdf = file.mimeType.includes('pdf');
                    const isImg = file.mimeType.includes('image');
                    const isDownloadingThis = isDownloading === file.id;

                    return (
                      <div
                        key={file.id}
                        onClick={() => !isDownloading && handleSelectFile(file)}
                        className="p-3.5 rounded-xl bg-slate-900/80 hover:bg-indigo-950/40 border border-slate-800 hover:border-indigo-500/40 transition flex items-start gap-3 group cursor-pointer"
                      >
                        <div className="w-9 h-9 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 shrink-0 group-hover:bg-indigo-600/20 group-hover:text-indigo-300 transition">
                          {file.thumbnailLink ? (
                            <img src={file.thumbnailLink} alt={file.name} className="w-9 h-9 object-cover rounded-lg" />
                          ) : isPdf ? (
                            <FileText className="w-5 h-5" />
                          ) : isImg ? (
                            <ImageIcon className="w-5 h-5" />
                          ) : (
                            <FileText className="w-5 h-5" />
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <h5 className="font-bold text-white text-xs truncate group-hover:text-indigo-200 transition">
                            {file.name}
                          </h5>
                          <p className="text-[10px] text-slate-400 mt-0.5">
                            {isPdf ? 'PDF Document' : isImg ? 'Image / Diagram' : 'Google Document'}
                            {file.modifiedTime && ` • ${new Date(file.modifiedTime).toLocaleDateString()}`}
                          </p>
                        </div>

                        <div className="shrink-0 pt-1">
                          {isDownloadingThis ? (
                            <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
                          ) : (
                            <Download className="w-4 h-4 text-slate-500 group-hover:text-indigo-400 transition" />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950 flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-1.5 text-[11px]">
            <Lock className="w-3.5 h-3.5 text-emerald-400" />
            <span>Read-only Google Drive OAuth Connection</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold transition cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
