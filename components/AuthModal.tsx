'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Cloud, 
  CloudOff, 
  LogOut, 
  LogIn, 
  User as UserIcon, 
  RefreshCw, 
  Check, 
  Sparkles, 
  Zap, 
  ShieldCheck,
  X,
  Smartphone,
  Laptop
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AuthModal({ isOpen, onClose }: AuthModalProps) {
  const { user, loading, isSyncing, signInGoogle, signInAnonymous, logOut, cloudStats, syncLocalToCloud } = useAuth();
  const [syncSuccessCount, setSyncSuccessCount] = useState<number | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleGoogleLogin = async () => {
    try {
      setIsProcessing(true);
      setErrorMsg(null);
      await signInGoogle();
      onClose();
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Failed to sign in with Google');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleGuestLogin = async () => {
    try {
      setIsProcessing(true);
      setErrorMsg(null);
      await signInAnonymous();
      onClose();
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Failed to sign in as guest');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSyncLocal = async () => {
    try {
      setErrorMsg(null);
      const count = await syncLocalToCloud();
      setSyncSuccessCount(count);
      setTimeout(() => setSyncSuccessCount(null), 3000);
    } catch (err: any) {
      setErrorMsg('Failed to sync local data.');
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          className="w-full max-w-md bg-[#0F111A] border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        >
          {/* Header */}
          <div className="p-5 border-b border-slate-800 bg-[#131622] flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 rounded-xl">
                <Cloud className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-white text-base">Cloud Sync & Account</h3>
                <p className="text-xs text-slate-400">Firebase Firestore multi-device synchronization</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6 space-y-5">
            {errorMsg && (
              <div className="p-3 bg-red-500/10 border border-red-500/30 text-red-300 text-xs rounded-xl">
                {errorMsg}
              </div>
            )}

            {user ? (
              <div className="space-y-4">
                {/* User card */}
                <div className="p-4 bg-[#141724] border border-slate-800 rounded-xl flex items-center gap-3">
                  {user.photoURL ? (
                    <img 
                      src={user.photoURL} 
                      alt={user.displayName || 'User'} 
                      className="w-12 h-12 rounded-full border border-indigo-500/40"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center text-indigo-300">
                      <UserIcon className="w-6 h-6" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <h4 className="font-bold text-white text-sm truncate">
                      {user.displayName || (user.isAnonymous ? 'Guest Learner' : user.email || 'Learner')}
                    </h4>
                    <p className="text-xs text-slate-400 truncate">
                      {user.email || (user.isAnonymous ? 'Anonymous Cloud Session' : '')}
                    </p>
                    <span className="inline-flex items-center gap-1 mt-1 text-[10px] text-emerald-400 font-semibold bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.2 rounded-full">
                      <Cloud className="w-3 h-3" />
                      Live Sync Active
                    </span>
                  </div>
                </div>

                {/* Cloud stats */}
                <div className="grid grid-cols-2 gap-3 text-center">
                  <div className="p-3 bg-[#141724] border border-slate-800 rounded-xl">
                    <span className="text-[10px] uppercase font-bold text-slate-500 block mb-1">Cloud Schemas</span>
                    <span className="text-lg font-black text-indigo-300 font-mono">{cloudStats.schemasCompleted}</span>
                  </div>
                  <div className="p-3 bg-[#141724] border border-slate-800 rounded-xl">
                    <span className="text-[10px] uppercase font-bold text-slate-500 block mb-1">Total Cloud XP</span>
                    <span className="text-lg font-black text-amber-400 font-mono flex items-center justify-center gap-1">
                      <Zap className="w-4 h-4" />
                      {cloudStats.totalXp}
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div className="space-y-2 pt-2">
                  <button
                    onClick={handleSyncLocal}
                    disabled={isSyncing}
                    className="w-full flex items-center justify-center gap-2 py-2.5 bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/40 text-indigo-300 font-bold text-xs rounded-xl transition-all"
                  >
                    <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
                    {isSyncing ? 'Syncing...' : 'Sync Local History to Cloud'}
                  </button>

                  {syncSuccessCount !== null && (
                    <p className="text-center text-xs text-emerald-400 flex items-center justify-center gap-1">
                      <Check className="w-3.5 h-3.5" />
                      Successfully synced {syncSuccessCount} schemas!
                    </p>
                  )}

                  <button
                    onClick={async () => {
                      await logOut();
                    }}
                    className="w-full flex items-center justify-center gap-2 py-2 bg-transparent hover:bg-slate-800/60 text-slate-400 hover:text-red-400 font-bold text-xs rounded-xl transition-all"
                  >
                    <LogOut className="w-4 h-4" />
                    Sign Out
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="text-center space-y-2">
                  <div className="w-12 h-12 rounded-2xl bg-indigo-600/10 border border-indigo-500/30 flex items-center justify-center mx-auto text-indigo-400">
                    <Cloud className="w-6 h-6" />
                  </div>
                  <h4 className="font-bold text-white text-sm">Synchronize Across All Your Devices</h4>
                  <p className="text-xs text-slate-400 leading-relaxed max-w-xs mx-auto">
                    Sign in to seamlessly access your encoded study schemas, active drill progress, and XP on phone, tablet, or laptop.
                  </p>
                </div>

                <div className="flex items-center justify-center gap-4 py-1 text-slate-400 text-xs border-y border-slate-800/80">
                  <div className="flex items-center gap-1.5">
                    <Smartphone className="w-4 h-4 text-indigo-400" />
                    <span>Phone</span>
                  </div>
                  <span>•</span>
                  <div className="flex items-center gap-1.5">
                    <Laptop className="w-4 h-4 text-purple-400" />
                    <span>Laptop / Desktop</span>
                  </div>
                </div>

                <div className="space-y-2.5 pt-2">
                  <button
                    onClick={handleGoogleLogin}
                    disabled={isProcessing}
                    className="w-full flex items-center justify-center gap-2.5 py-3 bg-white hover:bg-slate-100 text-slate-900 font-bold text-xs rounded-xl shadow-lg transition-all"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                    </svg>
                    Continue with Google
                  </button>

                  <button
                    onClick={handleGuestLogin}
                    disabled={isProcessing}
                    className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#141724] hover:bg-[#1B1F2E] border border-slate-800 text-slate-300 font-bold text-xs rounded-xl transition-all"
                  >
                    <UserIcon className="w-4 h-4 text-slate-400" />
                    Quick Guest Session
                  </button>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
