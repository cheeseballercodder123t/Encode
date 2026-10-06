import React, { useState, useEffect } from 'react';
import { useModalA11y } from '@/hooks/useModalA11y';
import { BracketTag } from '@/components/ui/BracketTag';
import { motion } from 'motion/react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export const PWAInstallHeader: React.FC = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(() => {
    if (typeof window === 'undefined') return false;
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true
    );
  });
  const [isIOS, setIsIOS] = useState(() => {
    if (typeof window === 'undefined') return false;
    // Match iPadOS 13+ (reports as Macintosh with touch) as well as older
    // iPhone/iPad/iPod user agents. UA sniffing alone misses desktop-mode iPads.
    const ua = window.navigator.userAgent.toLowerCase();
    const maxTouchPoints = window.navigator.maxTouchPoints ?? 0;
    return (
      /iphone|ipad|ipod/.test(ua) ||
      (ua.includes('macintosh') && maxTouchPoints > 1)
    );
  });
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  // Esc closes, the page behind stops scrolling, focus moves in and back out.
  const sheetRef = useModalA11y(showIOSGuide, () => setShowIOSGuide(false));
  const [isOnline, setIsOnline] = useState(() => (typeof window !== 'undefined' ? navigator.onLine : true));

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        setIsInstalled(true);
        setDeferredPrompt(null);
      }
    } else if (isIOS) {
      setShowIOSGuide(true);
    }
  };

  return (
    <>
      <div className="flex items-stretch">
        {/* Offline indicator: sits inline in the instrument strip, so it never
            pushes the row into a second band on phones. */}
        {!isOnline && (
          <div className="max-w-full px-3 min-h-[36px] flex items-center rounded-full border border-hazard-500/40 bg-hazard-950/40 text-hazard-300 text-[10px] font-mono uppercase tracking-[0.16em] whitespace-nowrap">
            [ OFFLINE // INDEXEDDB ACTIVE ]
          </div>
        )}

        {/* PWA Install Button : 44px target, full-width on narrow headers. */}
        {!isInstalled && (deferredPrompt || isIOS) && (
          <button
            onClick={handleInstallClick}
            className="min-h-[36px] flex items-center rounded-full border border-edge/70 bg-deck px-3 text-solder hover:text-bone hover:border-gilt/40 hover:bg-bone/[0.05] transition-colors duration-150 text-[10px] font-mono uppercase tracking-[0.16em] cursor-pointer whitespace-nowrap"
            title="Install DeepEncode locally for offline flight/subway use"
          >
            [ INSTALL APP: PWA ]
          </button>
        )}
      </div>

      {/* iOS Installation Guide Modal : bottom sheet on phones. */}
      {showIOSGuide && (
        <div ref={sheetRef} role="dialog" aria-modal="true" tabIndex={-1} className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-chassis/90 sm:p-4 overflow-y-auto">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            className="leaf-edge sheet-plate w-full max-w-sm bg-deck border border-edge/70 rounded-2xl shadow-raised p-6 mobile-sheet-viewport overflow-y-auto overscroll-contain"
            role="dialog"
            aria-modal="true"
            aria-label="Install on iOS"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-mono text-[11px] uppercase tracking-[0.2em] text-slate-ink">{'// INSTALL ON iOS'}</h3>
              <button
                onClick={() => setShowIOSGuide(false)}
                aria-label="Close iOS install guide"
                className="min-h-[44px] min-w-[44px] flex items-center justify-center px-2 py-1 text-solder hover:text-bone border border-edge hover:border-solder font-mono text-[10px] font-bold transition-none cursor-pointer"
              >
                {/* Phone: the close brackets frame the X vertically. */}
                <BracketTag label="X" tone="" />
              </button>
            </div>

            <ol className="space-y-3 text-xs text-solder font-mono">
              <li className="flex items-start gap-2.5">
                <span className="flex-shrink-0 px-1.5 py-0.5 bg-chassis border border-edge text-amber text-[10px] font-bold">[ 1 ]</span>
                <span>Tap the <strong className="text-bone">Share</strong> button in Safari toolbar.</span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="flex-shrink-0 px-1.5 py-0.5 bg-chassis border border-edge text-amber text-[10px] font-bold">[ 2 ]</span>
                <span>Scroll down and select <strong className="text-bone">Add to Home Screen</strong>.</span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="flex-shrink-0 px-1.5 py-0.5 bg-chassis border border-edge text-amber text-[10px] font-bold">[ 3 ]</span>
                <span>Launch directly from your home screen for full offline IndexedDB access!</span>
              </li>
            </ol>

            <button
              onClick={() => setShowIOSGuide(false)}
              className="mt-6 w-full min-h-[44px] py-2.5 rounded-full bg-gradient-to-b from-amber-400 to-amber-600 text-inset font-mono font-semibold text-[10px] uppercase tracking-[0.16em] shadow-gilt cursor-pointer"
            >
              [ ACKNOWLEDGED ]
            </button>
          </motion.div>
        </div>
      )}
    </>
  );
};
