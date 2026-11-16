import {
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  collection,
  onSnapshot,
  serverTimestamp,
  arrayUnion,
  arrayRemove,
} from 'firebase/firestore';
import { updateProfile as updateFirebaseAuthProfile } from 'firebase/auth';
import { auth, db, isFirebaseConfigured } from '../firebase/config';
import { localStore } from './localStore';
import { sanitizeText } from '../utils/security';

/**
 * Subscribes to a single real user profile document in real time.
 */
export function subscribeToUserProfile(uid, callback) {
  if (!uid) return () => {};

  const emitLocal = () => {
    const users = localStore.getUsers();
    const found = users.find((u) => u.uid === uid) || null;
    callback(found ? { ...found } : null);
  };

  if (isFirebaseConfigured && db) {
    return onSnapshot(
      doc(db, 'users', uid),
      (snap) => {
        if (snap.exists()) {
          const data = { uid: snap.id, ...snap.data() };
          localStore.upsertUser(data);
          callback(data);
        } else {
          emitLocal();
        }
      },
      () => {
        emitLocal();
      }
    );
  }

  emitLocal();
  return localStore.subscribe(emitLocal);
}

/**
 * Subscribes to all real registered users in real time (merges Firestore users with local mirror).
 */
export function subscribeToAllUsers(callback) {
  let firestoreUsers = [];

  const emitMerged = () => {
    const map = new Map();
    localStore.getUsers().forEach((u) => {
      if (u?.uid) map.set(u.uid, u);
    });
    firestoreUsers.forEach((u) => {
      if (u?.uid) map.set(u.uid, { ...(map.get(u.uid) || {}), ...u });
    });
    callback(Array.from(map.values()));
  };

  const unsubLocal = localStore.subscribe(emitMerged);

  if (isFirebaseConfigured && db) {
    const unsubFirestore = onSnapshot(
      collection(db, 'users'),
      (snap) => {
        firestoreUsers = snap.docs.map((d) => ({ uid: d.id, ...d.data() }));
        emitMerged();
      },
      () => {
        emitMerged();
      }
    );
    return () => {
      unsubFirestore();
      unsubLocal();
    };
  }

  emitMerged();
  return unsubLocal;
}

/**
 * Fetches a user profile by UID.
 */
export async function getUserById(uid) {
  if (!uid) return null;
  if (isFirebaseConfigured && db) {
    try {
      const snap = await getDoc(doc(db, 'users', uid));
      if (snap.exists()) return { uid: snap.id, ...snap.data() };
    } catch {
      // Fallback to local
    }
  }
  const users = localStore.getUsers();
  return users.find((u) => u.uid === uid) || null;
}

/**
 * Updates user profile fields in Firestore and local mirror.
 */
export async function updateUserProfile(uid, updates) {
  if (!uid) throw new Error('User ID is required.');

  const cleanUpdates = { ...updates };
  if (typeof cleanUpdates.displayName === 'string') {
    cleanUpdates.displayName = sanitizeText(cleanUpdates.displayName, 50);
  }
  if (typeof cleanUpdates.username === 'string') {
    cleanUpdates.username = sanitizeText(cleanUpdates.username, 35)
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '');
  }
  if (typeof cleanUpdates.bio === 'string') {
    cleanUpdates.bio = sanitizeText(cleanUpdates.bio, 220);
  }
  if (typeof cleanUpdates.statusText === 'string') {
    cleanUpdates.statusText = sanitizeText(cleanUpdates.statusText, 60);
  }

  localStore.upsertUser({
    uid,
    ...cleanUpdates,
    updatedAt: new Date().toISOString(),
  });

  if (isFirebaseConfigured && db) {
    try {
      const userRef = doc(db, 'users', uid);
      await setDoc(
        userRef,
        {
          uid,
          ...cleanUpdates,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      if (auth?.currentUser && auth.currentUser.uid === uid) {
        const authProfilePatch = {};
        if (cleanUpdates.displayName) authProfilePatch.displayName = cleanUpdates.displayName;
        if (cleanUpdates.photoURL !== undefined) authProfilePatch.photoURL = cleanUpdates.photoURL;
        if (Object.keys(authProfilePatch).length > 0) {
          await updateFirebaseAuthProfile(auth.currentUser, authProfilePatch);
        }
      }
    } catch (err) {
      console.warn('[userService] Firestore update warning:', err);
    }
  }

  return cleanUpdates;
}

/**
 * Searches real registered users by displayName, username, or email.
 */
export async function searchUsers(searchTerm, currentUid) {
  const term = (searchTerm || '').trim().toLowerCase();

  let allUsers = localStore.getUsers();
  if (isFirebaseConfigured && db) {
    try {
      const snap = await getDocs(collection(db, 'users'));
      const remote = snap.docs.map((d) => ({ uid: d.id, ...d.data() }));
      if (remote.length > 0) allUsers = remote;
    } catch {
      // Use local mirror
    }
  }

  return allUsers
    .filter((u) => u.uid !== currentUid)
    .filter((u) => {
      if (!term) return true;
      return (
        u.displayName?.toLowerCase().includes(term) ||
        u.username?.toLowerCase().includes(term) ||
        u.email?.toLowerCase().includes(term) ||
        u.bio?.toLowerCase().includes(term)
      );
    });
}

/**
 * Blocks a user.
 */
export async function blockUser(currentUid, targetUid) {
  if (!currentUid || !targetUid) return;

  const users = localStore.getUsers();
  const idx = users.findIndex((u) => u.uid === currentUid);
  if (idx !== -1) {
    const blocked = new Set(users[idx].blockedUsers || []);
    blocked.add(targetUid);
    users[idx].blockedUsers = Array.from(blocked);
    localStore.saveUsers(users);
  }

  if (isFirebaseConfigured && db) {
    try {
      await updateDoc(doc(db, 'users', currentUid), {
        blockedUsers: arrayUnion(targetUid),
        updatedAt: serverTimestamp(),
      });
    } catch {
      // Ignore if Firestore rules pending
    }
  }
}

/**
 * Unblocks a user.
 */
export async function unblockUser(currentUid, targetUid) {
  if (!currentUid || !targetUid) return;

  const users = localStore.getUsers();
  const idx = users.findIndex((u) => u.uid === currentUid);
  if (idx !== -1) {
    users[idx].blockedUsers = (users[idx].blockedUsers || []).filter((id) => id !== targetUid);
    localStore.saveUsers(users);
  }

  if (isFirebaseConfigured && db) {
    try {
      await updateDoc(doc(db, 'users', currentUid), {
        blockedUsers: arrayRemove(targetUid),
        updatedAt: serverTimestamp(),
      });
    } catch {
      // Ignore if Firestore rules pending
    }
  }
}
