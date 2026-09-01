import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { 
  Download, 
  Check, 
  Smartphone, 
  Monitor, 
  Share, 
  X,
  Wifi,
  WifiOff,
  CloudCheck
} from 'lucide-react';

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
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30 animate-pulse">
            <WifiOff className="w-3.5 h-3.5" />
            <span>Offline (IndexedDB Active)</span>
          </div>
        )}

        {/* PWA Install Button */}
        {!isInstalled && (deferredPrompt || isIOS) && (
          <button
            onClick={handleInstallClick}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-md shadow-blue-500/20 transition-all border border-blue-400/30 active:scale-95"
            title="Install DeepEncode locally for offline flight/subway use"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Install App (PWA)</span>
          </button>
        )}
      </div>

      {/* iOS Installation Guide Modal */}
      {showIOSGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-sm rounded-2xl bg-slate-900 border border-slate-700 p-6 shadow-2xl text-slate-200"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Smartphone className="w-5 h-5 text-blue-400" />
                <h3 className="font-bold text-base text-white">Install DeepEncode on iOS</h3>
              </div>
              <button 
                onClick={() => setShowIOSGuide(false)}
                className="p-1 text-slate-400 hover:text-white rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <ol className="space-y-3 text-sm text-slate-300">
              <li className="flex items-start gap-2.5">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-600/30 text-blue-400 flex items-center justify-center text-xs font-bold border border-blue-500/30">1</span>
                <span>Tap the <strong className="text-white">Share</strong> button in Safari toolbar.</span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-600/30 text-blue-400 flex items-center justify-center text-xs font-bold border border-blue-500/30">2</span>
                <span>Scroll down and select <strong className="text-white">Add to Home Screen</strong>.</span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-600/30 text-blue-400 flex items-center justify-center text-xs font-bold border border-blue-500/30">3</span>
                <span>Launch directly from your home screen for full offline IndexedDB access!</span>
              </li>
            </ol>

            <button
              onClick={() => setShowIOSGuide(false)}
              className="mt-6 w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-medium text-sm transition"
            >
              Got it
            </button>
          </motion.div>
        </div>
      )}
    </>
  );
};
