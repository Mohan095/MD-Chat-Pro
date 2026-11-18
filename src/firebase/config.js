import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getMessaging, isSupported as isMessagingSupported } from 'firebase/messaging';
import { getAnalytics, isSupported as isAnalyticsSupported } from 'firebase/analytics';

// Official md-chat-pro-51a44 Firebase Auth & Analytics Configuration
export const firebaseConfig = {
  apiKey: 'AIzaSyDK4JBj_hpRLJJ81-rzvTNh59Yme_XOjHY',
  authDomain: 'md-chat-pro-51a44.firebaseapp.com',
  projectId: 'md-chat-pro-51a44',
  storageBucket: 'md-chat-pro-51a44.firebasestorage.app',
  messagingSenderId: '603741080485',
  appId: '1:603741080485:web:53b6a402be51e78b24764c',
  measurementId: 'G-B9KM6TWHKF',
};

export const vapidKey = '';

export const isFirebaseConfigured = true;

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });
const db = null;
const storage = null;
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
