import { ref, onValue, onDisconnect, set, serverTimestamp as rtdbTimestamp } from 'firebase/database';
import { doc, updateDoc, serverTimestamp as firestoreTimestamp } from 'firebase/firestore';
import { db, rtdb, isFirebaseConfigured } from '../firebase/config';
import { localStore } from './localStore';

/**
 * Manages real-time online/offline user presence using Firebase Realtime Database
 * (with .info/connected and onDisconnect hooks) + Cloud Firestore synchronization.
 */
export function initPresenceTracking(uid) {
  if (!uid) return () => {};

  const setOnlineState = async (isOnline) => {
    if (isFirebaseConfigured && db) {
      try {
        await updateDoc(doc(db, 'users', uid), {
          online: isOnline,
          lastSeen: firestoreTimestamp(),
        });
      } catch {
        // Ignore transient network errors
      }
      return;
    }

    const users = localStore.getUsers();
    const idx = users.findIndex((u) => u.uid === uid);
    if (idx !== -1 && users[idx].online !== isOnline) {
      users[idx].online = isOnline;
      users[idx].lastSeen = new Date().toISOString();
      localStore.saveUsers(users);
    }
  };

  let rtdbUnsubscribe = null;

  if (isFirebaseConfigured && rtdb) {
    try {
      const userStatusDatabaseRef = ref(rtdb, `/status/${uid}`);
      const connectedRef = ref(rtdb, '.info/connected');

      rtdbUnsubscribe = onValue(connectedRef, (snapshot) => {
        if (snapshot.val() === false) return;

        onDisconnect(userStatusDatabaseRef)
          .set({
            state: 'offline',
            lastChanged: rtdbTimestamp(),
          })
          .then(() => {
            set(userStatusDatabaseRef, {
              state: 'online',
              lastChanged: rtdbTimestamp(),
            });
            setOnlineState(true);
          });
      });
    } catch {
      setOnlineState(true);
    }
  } else {
    setOnlineState(true);
  }

  const handleVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      setOnlineState(true);
    }
  };

  const handleBeforeUnload = () => {
    setOnlineState(false);
  };

  window.addEventListener('visibilitychange', handleVisibilityChange);
  window.addEventListener('beforeunload', handleBeforeUnload);

  return () => {
    if (rtdbUnsubscribe) rtdbUnsubscribe();
    window.removeEventListener('visibilitychange', handleVisibilityChange);
    window.removeEventListener('beforeunload', handleBeforeUnload);
  };
}
