import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getDatabase } from 'firebase/database';
import { getMessaging, isSupported as isMessagingSupported } from 'firebase/messaging';
import { getAnalytics, isSupported as isAnalyticsSupported } from 'firebase/analytics';

// Official mdchatpro Firebase Configuration
export const firebaseConfig = {
  apiKey: 'AIzaSyAQmNN8pj5HOAaraT8-arZoVpn6FgFEXRQ',
  authDomain: 'mdchatpro.firebaseapp.com',
  projectId: 'mdchatpro',
  storageBucket: 'mdchatpro.firebasestorage.app',
  messagingSenderId: '561164399873',
  appId: '1:561164399873:web:5a39c774380ac715b39700',
  measurementId: 'G-ZVPEQ9K6ZE',
};

export const vapidKey = '';

export const isFirebaseConfigured = true;

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });
const db = getFirestore(app);
const storage = getStorage(app);
const rtdb = null;
let analytics = null;

if (typeof window !== 'undefined' && firebaseConfig.measurementId) {
  isAnalyticsSupported()
    .then((supported) => {
      if (supported) {
        analytics = getAnalytics(app);
      }
    })
    .catch(() => {});
}

export async function getMessagingInstance() {
  try {
    const supported = await isMessagingSupported();
    if (!supported) return null;
    return getMessaging(app);
  } catch {
    return null;
  }
}

export { app, auth, googleProvider, db, storage, rtdb, analytics };
