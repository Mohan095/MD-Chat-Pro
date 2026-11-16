import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getDatabase } from 'firebase/database';
import { getMessaging, isSupported as isMessagingSupported } from 'firebase/messaging';
import { getAnalytics, isSupported as isAnalyticsSupported } from 'firebase/analytics';

const env = import.meta.env || {};

const getEnvVar = (viteKey, craKey) => {
  return (env[viteKey] || env[craKey] || '').trim();
};

export const firebaseConfig = {
  apiKey: getEnvVar('VITE_FIREBASE_API_KEY', 'REACT_APP_FIREBASE_API_KEY'),
  authDomain: getEnvVar('VITE_FIREBASE_AUTH_DOMAIN', 'REACT_APP_FIREBASE_AUTH_DOMAIN'),
  projectId: getEnvVar('VITE_FIREBASE_PROJECT_ID', 'REACT_APP_FIREBASE_PROJECT_ID'),
  storageBucket: getEnvVar('VITE_FIREBASE_STORAGE_BUCKET', 'REACT_APP_FIREBASE_STORAGE_BUCKET'),
  messagingSenderId: getEnvVar(
    'VITE_FIREBASE_MESSAGING_SENDER_ID',
    'REACT_APP_FIREBASE_MESSAGING_SENDER_ID'
  ),
  appId: getEnvVar('VITE_FIREBASE_APP_ID', 'REACT_APP_FIREBASE_APP_ID'),
  measurementId: getEnvVar('VITE_FIREBASE_MEASUREMENT_ID', 'REACT_APP_FIREBASE_MEASUREMENT_ID'),
  databaseURL: getEnvVar('VITE_FIREBASE_DATABASE_URL', 'REACT_APP_FIREBASE_DATABASE_URL'),
};

export const vapidKey = getEnvVar('VITE_FIREBASE_VAPID_KEY', 'REACT_APP_FIREBASE_VAPID_KEY');

/**
 * Checks whether valid Firebase project credentials have been provided via environment variables.
 */
export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey &&
    firebaseConfig.projectId &&
    firebaseConfig.authDomain &&
    !firebaseConfig.apiKey.includes('your_firebase_api_key') &&
    !firebaseConfig.projectId.includes('your-project-id')
);

let app = null;
let auth = null;
let googleProvider = null;
let db = null;
let storage = null;
let rtdb = null;
let analytics = null;

if (isFirebaseConfigured) {
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
}

/**
 * Lazily resolves Firebase Cloud Messaging instance when supported by the browser.
 */
export async function getMessagingInstance() {
  if (!isFirebaseConfigured || !app) return null;
  try {
    const supported = await isMessagingSupported();
    if (!supported) return null;
    return getMessaging(app);
  } catch {
    return null;
  }
}

export { app, auth, googleProvider, db, storage, rtdb, analytics };
