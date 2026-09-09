import React, { useState, useEffect } from 'react';
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
    return /iphone|ipad|ipod/.test(window.navigator.userAgent.toLowerCase());
  });
  const [showIOSGuide, setShowIOSGuide] = useState(false);
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
      <div className="flex items-center gap-2">
        {/* Offline / Online state indicator badge */}
        {!isOnline && (
          <div className="px-2.5 py-1 bg-chassis border border-hazard text-solder text-[10px] font-mono font-bold uppercase tracking-wider">
            [ LINK: OFFLINE // INDEXEDDB ACTIVE ]
          </div>
        )}

        {/* PWA Install Button */}
        {!isInstalled && (deferredPrompt || isIOS) && (
          <button
            onClick={handleInstallClick}
            className="px-2.5 py-1.5 bg-chassis border border-steel text-solder hover:text-bone hover:border-solder transition-none text-[10px] font-mono font-bold uppercase tracking-wider cursor-pointer"
            title="Install DeepEncode locally for offline flight/subway use"
          >
            [ INSTALL APP: PWA ]
          </button>
        )}
      </div>

      {/* iOS Installation Guide Modal */}
      {showIOSGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-chassis/90 p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="w-full max-w-sm bg-deck border border-steel p-6"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-sm text-bone font-mono uppercase tracking-wider">// INSTALL ON iOS</h3>
              <button
                onClick={() => setShowIOSGuide(false)}
                className="px-2 py-1 text-solder hover:text-bone border border-steel hover:border-solder font-mono text-[10px] font-bold transition-none cursor-pointer"
              >
                [ X ]
              </button>
            </div>

            <ol className="space-y-3 text-xs text-solder font-mono">
              <li className="flex items-start gap-2.5">
                <span className="flex-shrink-0 px-1.5 py-0.5 bg-chassis border border-steel text-amber text-[10px] font-bold">[ 1 ]</span>
                <span>Tap the <strong className="text-bone">Share</strong> button in Safari toolbar.</span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="flex-shrink-0 px-1.5 py-0.5 bg-chassis border border-steel text-amber text-[10px] font-bold">[ 2 ]</span>
                <span>Scroll down and select <strong className="text-bone">Add to Home Screen</strong>.</span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="flex-shrink-0 px-1.5 py-0.5 bg-chassis border border-steel text-amber text-[10px] font-bold">[ 3 ]</span>
                <span>Launch directly from your home screen for full offline IndexedDB access!</span>
              </li>
            </ol>

            <button
              onClick={() => setShowIOSGuide(false)}
              className="mt-6 w-full py-2 bg-amber border border-amber text-chassis font-mono font-bold text-[10px] uppercase tracking-wider transition-none cursor-pointer"
            >
              [ ACKNOWLEDGED ]
            </button>
          </motion.div>
        </div>
      )}
    </>
  );
};
