'use client';

import React, { createContext, useContext, useEffect, useState, useSyncExternalStore } from 'react';
import { 
  User, 
  onAuthStateChanged, 
  signInWithPopup, 
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInAnonymously,
  signOut,
  updateProfile
} from 'firebase/auth';
import { 
  doc, 
  getDoc, 
  setDoc, 
  collection, 
  onSnapshot, 
  query, 
  orderBy, 
  deleteDoc,
  writeBatch
} from 'firebase/firestore';
import { auth, db, googleProvider } from './firebase';
import { AISettings, SavedSchema } from './types';
import { loadSavedSchemas, saveSchemaToHistory, loadAISettings } from './storage';
import { mergeCloudSettings, nextSettingsStamp, shouldApplyCloudSettings } from './settings-sync';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  cloudSchemas: SavedSchema[];
  cloudStats: { totalXp: number; schemasCompleted: number };
  isSyncing: boolean;
  /** Epoch ms of the last successful cloud write, or null if none yet. */
  lastSyncedAt: number | null;
  /** Set when the latest cloud write failed : surfaces sync problems in the UI. */
  lastSyncError: string | null;
  /** Local-only schemas not yet confirmed in the cloud (shown as "pending"). */
  pendingLocalCount: number;
  /** True once a cloud settings backup has been restored into local storage this session. */
  settingsRestored: boolean;
  signInGoogle: () => Promise<void>;
  signInAnonymous: () => Promise<void>;
  logOut: () => Promise<void>;
  saveSchemaToCloud: (schema: SavedSchema) => Promise<void>;
  deleteSchemaFromCloud: (schemaId: string) => Promise<void>;
  syncLocalToCloud: () => Promise<number>;
  /** Backs up AI settings to the user's Firestore profile (merge). */
  backupSettingsToCloud: (settings: AISettings) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

const subscribeToHydration = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const hydrated = useSyncExternalStore(subscribeToHydration, clientSnapshot, serverSnapshot);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [cloudSchemas, setCloudSchemas] = useState<SavedSchema[]>([]);
  const [cloudStats, setCloudStats] = useState({ totalXp: 0, schemasCompleted: 0 });
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [lastSyncError, setLastSyncError] = useState<string | null>(null);
  const [settingsRestored, setSettingsRestored] = useState(false);

  // How many local schemas are not yet in the cloud : derived, not state, so
  // the UI can show "N pending" without a cascading render pass.
  const pendingLocalCount = React.useMemo(() => {
    const local = hydrated ? loadSavedSchemas() : [];
    if (!user) return local.length;
    const cloudIds = new Set(cloudSchemas.map((s) => s.id));
    return local.filter((s) => !cloudIds.has(s.id)).length;
  }, [user, cloudSchemas, hydrated]);

  // Listen to Auth State
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        // Ensure user document exists
        try {
          const userRef = doc(db, 'users', currentUser.uid);
          const userSnap = await getDoc(userRef);
          if (!userSnap.exists()) {
            await setDoc(userRef, {
              userId: currentUser.uid,
              email: currentUser.email || '',
              displayName: currentUser.displayName || 'Learner',
              photoURL: currentUser.photoURL || '',
              totalXp: 0,
              schemasCompleted: 0,
              createdAt: Date.now(),
              updatedAt: Date.now()
            });
          } else {
            const data = userSnap.data();
            setCloudStats({
              totalXp: data.totalXp || 0,
              schemasCompleted: data.schemasCompleted || 0
            });
            // Restore cloud settings backup over local defaults : a cleared
            // browser profile re-amputates nothing. Only applied when the backup
            // is genuinely newer than what local storage holds (multi-device
            // safe) - the decision itself is `shouldApplyCloudSettings`, because
            // the version inlined here compared against a field four writers were
            // each responsible for stamping, and two of them did not (defect 36).
            const backup = data.settingsBackup;
            const hasSettings = !!backup && typeof backup === 'object' && !!backup.settings && typeof backup.settings === 'object';
            if (hasSettings) {
              try {
                const current = loadAISettings();
                if (shouldApplyCloudSettings(current, backup)) {
                  const { saveAISettings } = await import('./storage');
                  // The account's stamp travels with its content, so a later edit
                  // on another device still outranks this record.
                  saveAISettings(mergeCloudSettings(current, backup));
                  setSettingsRestored(true);
                }
              } catch (restoreErr) {
                console.warn('Settings restore skipped:', restoreErr);
              }
            }
          }
        } catch (err) {
          console.error("Error checking user profile in Firestore:", err);
        }
      } else {
        setCloudSchemas([]);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Listen to real-time schemas when user is logged in
  useEffect(() => {
    if (!user) return;

    const schemasRef = collection(db, 'users', user.uid, 'schemas');
    const q = query(schemasRef, orderBy('timestamp', 'desc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const schemas: SavedSchema[] = [];
      let totalXp = 0;
      snapshot.forEach((docSnap) => {
        const item = docSnap.data() as SavedSchema;
        schemas.push(item);
        totalXp += item.xpEarned || 0;
      });
      setCloudSchemas(schemas);
      setCloudStats({
        totalXp,
        schemasCompleted: schemas.length
      });
    }, (err) => {
      console.error("Error subscribing to schemas:", err);
    });

    return () => unsubscribe();
  }, [user]);

  const signInGoogle = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      console.error("Google sign in failed:", err);
      throw err;
    }
  };

  const signInAnonymous = async () => {
    try {
      await signInAnonymously(auth);
    } catch (err) {
      console.error("Guest sign in failed:", err);
      throw err;
    }
  };

  const logOut = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error("Logout failed:", err);
      throw err;
    }
  };

  const saveSchemaToCloud = async (schema: SavedSchema) => {
    // Always save to local storage as fallback
    saveSchemaToHistory(schema);

    if (!user) return;

    try {
      setIsSyncing(true);
      const schemaRef = doc(db, 'users', user.uid, 'schemas', schema.id);
      await setDoc(schemaRef, {
        ...schema,
        userId: user.uid,
        updatedAt: Date.now()
      });
      setLastSyncedAt(Date.now());
      setLastSyncError(null);

      // Update user stats
      const userRef = doc(db, 'users', user.uid);
      const currentXp = (cloudStats.totalXp || 0) + (schema.xpEarned || 0);
      const currentCompleted = (cloudSchemas.length || 0) + 1;
      await setDoc(userRef, {
        totalXp: currentXp,
        schemasCompleted: currentCompleted,
        updatedAt: Date.now()
      }, { merge: true });

    } catch (err) {
      console.error("Failed to sync schema to cloud:", err);
      setLastSyncError(err instanceof Error ? err.message : 'Cloud sync failed.');
    } finally {
      setIsSyncing(false);
    }
  };

  const deleteSchemaFromCloud = async (schemaId: string) => {
    if (!user) return;
    try {
      const schemaRef = doc(db, 'users', user.uid, 'schemas', schemaId);
      await deleteDoc(schemaRef);
    } catch (err) {
      console.error("Failed to delete schema from cloud:", err);
    }
  };

  const syncLocalToCloud = async (): Promise<number> => {
    if (!user) return 0;
    const local = loadSavedSchemas();
    if (local.length === 0) return 0;

    setIsSyncing(true);
    let count = 0;
    try {
      const batch = writeBatch(db);
      for (const item of local) {
        const schemaRef = doc(db, 'users', user.uid, 'schemas', item.id);
        batch.set(schemaRef, {
          ...item,
          userId: user.uid,
          updatedAt: Date.now()
        }, { merge: true });
        count++;
      }
      await batch.commit();
      if (count > 0) {
        setLastSyncedAt(Date.now());
        setLastSyncError(null);
      }
    } catch (err) {
      console.error("Error bulk syncing local schemas:", err);
      setLastSyncError(err instanceof Error ? err.message : 'Cloud sync failed.');
    } finally {
      setIsSyncing(false);
    }
    return count;
  };

  /** Backs up AI settings into the user's Firestore profile doc (merge). */
  const backupSettingsToCloud = async (settingsWithMeta: AISettings): Promise<void> => {
    if (!user) return;
    try {
      const { savedAt, ...settings } = settingsWithMeta || ({} as AISettings);
      const userRef = doc(db, 'users', user.uid);
      // `savedAt` is stripped out of the settings body and stored beside it, so
      // the account's record is exactly what the guard compares (defect 36).
      await setDoc(userRef, {
        settingsBackup: { settings, savedAt: nextSettingsStamp(settingsWithMeta, savedAt) },
        updatedAt: Date.now(),
      }, { merge: true });
    } catch (err) {
      console.warn('Settings backup failed:', err);
    }
  };

  // Auto-push local history to the cloud once per sign-in : a returning user
  // never has to remember the "Import Local" button.
  const autoSyncedRef = React.useRef<string | null>(null);
  useEffect(() => {
    if (!user) return;
    if (autoSyncedRef.current === user.uid) return;
    autoSyncedRef.current = user.uid;
    syncLocalToCloud().catch(() => {
      // failure surfaces via lastSyncError inside syncLocalToCloud
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        cloudSchemas,
        cloudStats,
        isSyncing,
        lastSyncedAt,
        lastSyncError,
        pendingLocalCount,
        settingsRestored,
        backupSettingsToCloud,
        signInGoogle,
        signInAnonymous,
        logOut,
        saveSchemaToCloud,
        deleteSchemaFromCloud,
        syncLocalToCloud
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
