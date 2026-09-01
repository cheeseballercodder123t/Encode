import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

// Initialize Firebase App singleton
export const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);
const configAny = firebaseConfig as any;
export const db = configAny.firestoreDatabaseId 
  ? getFirestore(app, configAny.firestoreDatabaseId)
  : getFirestore(app);
export const googleProvider = new GoogleAuthProvider();
