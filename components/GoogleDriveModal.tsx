'use client';

import React, { useState, useEffect } from 'react';
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
    <div className="fixed inset-0 z-50 bg-chassis/80 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-chassis border border-steel/30 overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-steel flex items-center justify-between ">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-steel/10 border border-steel/30 flex items-center justify-center text-bone">
              <span className="text-amber font-bold font-mono">[ CLOUD ]</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-bone text-base">Google Drive Importer</h3>
                <span className="px-2 py-0.5 text-[10px] font-bold uppercase bg-steel/20 text-bone border border-steel/30">
                  PDF Slides & Notes
                </span>
              </div>
              <p className="text-xs text-solder">
                Browse and encode lecture slides, textbook PDFs, and diagrams directly from your Google Drive
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-solder hover:text-bone hover:bg-steel transition-none-colors cursor-pointer"
          >
            <span className="text-amber font-bold font-mono">[ X ]</span>
          </button>
        </div>

        {/* Content Area */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {errorMessage && (
            <div className="p-3 bg-hazard950/40 border border-hazard500/40 text-xs text-hazard300 flex items-start gap-2">
              <span className="text-amber font-bold font-mono">[ ! ]</span>
              <div className="flex-1 leading-relaxed">{errorMessage}</div>
            </div>
          )}

          {!accessToken ? (
            /* Unauthenticated View */
            <div className="py-8 px-4 text-center space-y-5 max-w-md mx-auto">
              <div className="w-16 h-16 mx-auto bg-steel/10 border border-steel/30 flex items-center justify-center text-bone  ">
                <span className="text-amber font-bold font-mono">[ CLOUD ]</span>
              </div>

              <div>
                <h4 className="font-bold text-bone text-lg">Connect Google Drive Account</h4>
                <p className="text-xs text-solder mt-1 leading-relaxed">
                  Authorize read-only access to select your PDF presentation slides, lecture notes, and whiteboard images.
                </p>
              </div>

              <button
                onClick={handleConnectOAuth}
                disabled={isLoading}
                className="w-full py-3 px-4 font-bold text-xs text-bone    hover: hover:   flex items-center justify-center gap-2.5 transition-none cursor-pointer disabled:opacity-50"
              >
                {isLoading ? (
                  <>
                    <span className="text-amber font-bold font-mono">[ BUSY ]</span>
                    Connecting Google OAuth...
                  </>
                ) : (
                  <>
                    <span className="text-amber font-bold font-mono">[ CLOUD ]</span>
                    Sign in with Google Drive
                  </>
                )}
              </button>

              <div className="pt-2 border-t border-steel">
                <button
                  type="button"
                  onClick={() => setShowManualInput(!showManualInput)}
                  className="text-[11px] font-semibold text-solder hover:text-bone transition-none flex items-center justify-center gap-1 mx-auto cursor-pointer"
                >
                  <span className="text-amber font-bold font-mono">[ KEY ]</span>
                  {showManualInput ? 'Hide manual OAuth options' : 'Enter Google OAuth Access Token directly'}
                </button>

                {showManualInput && (
                  <div className="mt-3 p-3 bg-deck border border-steel text-left space-y-2">
                    <label className="text-[11px] font-bold text-solder block">
                      Google OAuth Access Token:
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="password"
                        placeholder="ya29.a0A..."
                        value={manualToken}
                        onChange={(e) => setManualToken(e.target.value)}
                        className="flex-1 px-3 py-1.5 bg-chassis border border-steel text-xs text-bone focus:outline-none focus:border-steel"
                      />
                      <button
                        onClick={handleApplyManualToken}
                        className="px-3 py-1.5 bg-steel text-bone font-bold text-xs hover:bg-steel transition-none cursor-pointer"
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
                    <span className="text-amber font-bold font-mono">[ SEARCH ]</span>
                    <input
                      type="text"
                      placeholder="Search PDF slides, lectures, diagrams..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 bg-deck border border-steel text-xs text-bone placeholder-slate-500 focus:outline-none focus:border-steel transition-none"
                    />
                  </div>
                  <button
                    type="submit"
                    className="px-3 py-2 bg-steel/20 text-bone border border-steel/30 hover:bg-steel/30 text-xs font-bold transition-none cursor-pointer"
                  >
                    Search
                  </button>
                </form>

                <div className="flex items-center justify-between sm:justify-end gap-2 text-xs">
                  <button
                    onClick={() => loadFiles(accessToken, searchQuery)}
                    disabled={isLoading}
                    className="p-2 bg-deck border border-steel text-solder hover:text-bone transition-none cursor-pointer"
                    title="Refresh file list"
                  >
                    <span className="text-amber font-bold font-mono">[ RESET ]</span>
                  </button>
                  <button
                    onClick={handleDisconnect}
                    className="px-2.5 py-1.5 bg-deck border border-steel text-solder hover:text-hazard400 text-[11px] font-bold transition-none cursor-pointer"
                  >
                    Disconnect
                  </button>
                </div>
              </div>

              {/* Files Grid/List */}
              {isLoading ? (
                <div className="py-12 text-center text-solder space-y-2">
                  <span className="text-amber font-bold font-mono">[ BUSY ]</span>
                  <p className="text-xs">Fetching Google Drive slides and notes...</p>
                </div>
              ) : files.length === 0 ? (
                <div className="py-12 text-center border-2 border-dashed border-steel space-y-2">
                  <span className="text-amber font-bold font-mono">[ FILE ]</span>
                  <p className="text-xs font-bold text-solder">No PDF slides or images found in your Google Drive.</p>
                  <p className="text-[11px] text-solder">Upload slides to Google Drive or adjust your search term.</p>
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
                        className="p-3.5 bg-deck/80 hover:bg-steel/40 border border-steel hover:border-steel/40 transition-none flex items-start gap-3 group cursor-pointer"
                      >
                        <div className="w-9 h-9 bg-steel/10 border border-steel/20 flex items-center justify-center text-bone shrink-0 group-hover:bg-steel/20 group-hover:text-bone transition-none">
                          {file.thumbnailLink ? (
                            <img src={file.thumbnailLink} alt={file.name} className="w-9 h-9 object-cover " />
                          ) : isPdf ? (
                            <span className="text-amber font-bold font-mono">[ FILE ]</span>
                          ) : isImg ? (
                            <span className="text-amber font-bold font-mono">[ IMG ]</span>
                          ) : (
                            <span className="text-amber font-bold font-mono">[ FILE ]</span>
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <h5 className="font-bold text-bone text-xs truncate group-hover:text-bone transition-none">
                            {file.name}
                          </h5>
                          <p className="text-[10px] text-solder mt-0.5">
                            {isPdf ? 'PDF Document' : isImg ? 'Image / Diagram' : 'Google Document'}
                            {file.modifiedTime && ` • ${new Date(file.modifiedTime).toLocaleDateString()}`}
                          </p>
                        </div>

                        <div className="shrink-0 pt-1">
                          {isDownloadingThis ? (
                            <span className="text-amber font-bold font-mono">[ BUSY ]</span>
                          ) : (
                            <span className="text-amber font-bold font-mono">[ DL ]</span>
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
        <div className="p-4 border-t border-steel bg-chassis flex items-center justify-between text-xs text-solder">
          <div className="flex items-center gap-1.5 text-[11px]">
            <span className="text-amber font-bold font-mono">[ LOCK ]</span>
            <span>Read-only Google Drive OAuth Connection</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-steel hover:bg-steel text-solder font-bold transition-none cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
