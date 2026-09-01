'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
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
import { SavedSchema } from './types';
import { loadSavedSchemas, saveSchemaToHistory } from './storage';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  cloudSchemas: SavedSchema[];
  cloudStats: { totalXp: number; schemasCompleted: number };
  isSyncing: boolean;
  signInGoogle: () => Promise<void>;
  signInAnonymous: () => Promise<void>;
  logOut: () => Promise<void>;
  saveSchemaToCloud: (schema: SavedSchema) => Promise<void>;
  deleteSchemaFromCloud: (schemaId: string) => Promise<void>;
  syncLocalToCloud: () => Promise<number>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [cloudSchemas, setCloudSchemas] = useState<SavedSchema[]>([]);
  const [cloudStats, setCloudStats] = useState({ totalXp: 0, schemasCompleted: 0 });
  const [isSyncing, setIsSyncing] = useState(false);

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
    } catch (err) {
      console.error("Error bulk syncing local schemas:", err);
    } finally {
      setIsSyncing(false);
    }
    return count;
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        cloudSchemas,
        cloudStats,
        isSyncing,
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
