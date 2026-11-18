import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getDatabase } from 'firebase/database';
import { getMessaging, isSupported as isMessagingSupported } from 'firebase/messaging';
import { getAnalytics, isSupported as isAnalyticsSupported } from 'firebase/analytics';

// Official md-chat-pro Firebase Configuration
export const firebaseConfig = {
  apiKey: 'AIzaSyBK_f7FCzXlwp3ZXtN0-8MgAamsTtYh35Y',
  authDomain: 'md-chat-pro.firebaseapp.com',
  projectId: 'md-chat-pro',
  storageBucket: 'md-chat-pro.firebasestorage.app',
  messagingSenderId: '173037702593',
  appId: '1:173037702593:web:374bb5b13b113a63b0f340',
  measurementId: 'G-JHVZBZ7PHW',
};

export const vapidKey = '';

export const isFirebaseConfigured = true;

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });
let db;
try {
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager(),
    }),
  });
} catch {
  db = getFirestore(app);
}
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
