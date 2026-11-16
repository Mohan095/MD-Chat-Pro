import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getDatabase } from 'firebase/database';
import { getMessaging, isSupported as isMessagingSupported } from 'firebase/messaging';
import { getAnalytics, isSupported as isAnalyticsSupported } from 'firebase/analytics';

const env = import.meta.env || {};

const getEnvVar = (viteKey, craKey, fallback = '') => {
  const val = (env[viteKey] || env[craKey] || '').trim();
  return val || fallback;
};

export const firebaseConfig = {
  apiKey: getEnvVar(
    'VITE_FIREBASE_API_KEY',
    'REACT_APP_FIREBASE_API_KEY',
    'AIzaSyDeXcFamvPcgJCV3NrXa3AxTtHSEcs5OM4'
  ),
  authDomain: getEnvVar(
    'VITE_FIREBASE_AUTH_DOMAIN',
    'REACT_APP_FIREBASE_AUTH_DOMAIN',
    'md-chat-87f45.firebaseapp.com'
  ),
  projectId: getEnvVar(
    'VITE_FIREBASE_PROJECT_ID',
    'REACT_APP_FIREBASE_PROJECT_ID',
    'md-chat-87f45'
  ),
  storageBucket: getEnvVar(
    'VITE_FIREBASE_STORAGE_BUCKET',
    'REACT_APP_FIREBASE_STORAGE_BUCKET',
    'md-chat-87f45.firebasestorage.app'
  ),
  messagingSenderId: getEnvVar(
    'VITE_FIREBASE_MESSAGING_SENDER_ID',
    'REACT_APP_FIREBASE_MESSAGING_SENDER_ID',
    '601166300479'
  ),
  appId: getEnvVar(
    'VITE_FIREBASE_APP_ID',
    'REACT_APP_FIREBASE_APP_ID',
    '1:601166300479:web:97a53763e3fdb76d273f8a'
  ),
  measurementId: getEnvVar(
    'VITE_FIREBASE_MEASUREMENT_ID',
    'REACT_APP_FIREBASE_MEASUREMENT_ID',
    'G-S40KFTWM5D'
  ),
  databaseURL: getEnvVar(
    'VITE_FIREBASE_DATABASE_URL',
    'REACT_APP_FIREBASE_DATABASE_URL',
    ''
  ),
};

export const vapidKey = getEnvVar('VITE_FIREBASE_VAPID_KEY', 'REACT_APP_FIREBASE_VAPID_KEY');

export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.authDomain
);

let app = null;
let auth = null;
let googleProvider = null;
let db = null;
let storage = null;
let rtdb = null;
let analytics = null;

try {
  app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
  auth = getAuth(app);
  googleProvider = new GoogleAuthProvider();
  googleProvider.setCustomParameters({ prompt: 'select_account' });
  db = getFirestore(app);
  storage = getStorage(app);
  if (firebaseConfig.databaseURL) {
    rtdb = getDatabase(app);
  }
  if (typeof window !== 'undefined' && firebaseConfig.measurementId) {
    isAnalyticsSupported()
      .then((supported) => {
        if (supported && app) {
          analytics = getAnalytics(app);
        }
      })
      .catch(() => {});
  }
} catch (error) {
  console.error('[MD Chat Pro] Firebase initialization error:', error);
}

/**
 * Lazily resolves Firebase Cloud Messaging instance when supported by the browser.
 */
export async function getMessagingInstance() {
  if (!app) return null;
  try {
    const supported = await isMessagingSupported();
    if (!supported) return null;
    return getMessaging(app);
  } catch {
    return null;
  }
}

export { app, auth, googleProvider, db, storage, rtdb, analytics };
