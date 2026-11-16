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
import { isLocalDemoUid } from './authService';
import { sanitizeText } from '../utils/security';

/**
 * Subscribes to a single user profile document in real time.
 */
export function subscribeToUserProfile(uid, callback) {
  if (!uid) return () => {};

  const emitLocal = () => {
    const users = localStore.getUsers();
    const found = users.find((u) => u.uid === uid) || null;
    callback(found ? { ...found } : null);
  };

  if (isFirebaseConfigured && db && !isLocalDemoUid(uid)) {
    return onSnapshot(
      doc(db, 'users', uid),
      (snap) => {
        if (snap.exists()) {
          callback({ uid: snap.id, ...snap.data() });
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
 * Subscribes to all users in real time (merges Firestore users with built-in contacts if needed).
 */
export function subscribeToAllUsers(callback) {
  const emitLocal = () => {
    const users = localStore.getUsers().map(({ passwordHash, ...safeUser }) => safeUser);
    callback(users);
  };

  if (isFirebaseConfigured && db && !isLocalDemoUid()) {
    return onSnapshot(
      collection(db, 'users'),
      (snap) => {
        const firestoreUsers = snap.docs.map((d) => ({ uid: d.id, ...d.data() }));
        if (firestoreUsers.length > 0) {
          callback(firestoreUsers);
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
 * Fetches a user profile by UID.
 */
export async function getUserById(uid) {
  if (!uid) return null;
  if (isFirebaseConfigured && db && !isLocalDemoUid(uid)) {
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
 * Updates user profile fields (displayName, username, bio, statusText, photoURL, privacySettings, notificationSettings).
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

  if (isFirebaseConfigured && db && !isLocalDemoUid(uid)) {
    try {
      const userRef = doc(db, 'users', uid);
      await setDoc(
        userRef,
        {
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
      return cleanUpdates;
    } catch (err) {
      console.warn('[userService] Firestore update fallback to localStore:', err);
    }
  }

  const users = localStore.getUsers();
  const idx = users.findIndex((u) => u.uid === uid);
  if (idx !== -1) {
    users[idx] = {
      ...users[idx],
      ...cleanUpdates,
      updatedAt: new Date().toISOString(),
    };
  } else {
    users.push({
      uid,
      ...cleanUpdates,
      updatedAt: new Date().toISOString(),
    });
  }
  localStore.saveUsers(users);
  return cleanUpdates;
}

/**
 * Searches users by displayName, username, or email.
 */
export async function searchUsers(searchTerm, currentUid) {
  const term = (searchTerm || '').trim().toLowerCase();

  let allUsers = [];
  if (isFirebaseConfigured && db && !isLocalDemoUid(currentUid)) {
    try {
      const snap = await getDocs(collection(db, 'users'));
      allUsers = snap.docs.map((d) => ({ uid: d.id, ...d.data() }));
    } catch {
      allUsers = localStore.getUsers();
    }
  } else {
    allUsers = localStore.getUsers();
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
 * Blocks a user so they cannot message or interact with the current user.
 */
export async function blockUser(currentUid, targetUid) {
  if (!currentUid || !targetUid) return;

  if (isFirebaseConfigured && db && !isLocalDemoUid(currentUid)) {
    try {
      await updateDoc(doc(db, 'users', currentUid), {
        blockedUsers: arrayUnion(targetUid),
        updatedAt: serverTimestamp(),
      });
      return;
    } catch {
      // Fallback to localStore
    }
  }

  const users = localStore.getUsers();
  const idx = users.findIndex((u) => u.uid === currentUid);
  if (idx !== -1) {
    const blocked = new Set(users[idx].blockedUsers || []);
    blocked.add(targetUid);
    users[idx].blockedUsers = Array.from(blocked);
    localStore.saveUsers(users);
  }
}

/**
 * Unblocks a previously blocked user.
 */
export async function unblockUser(currentUid, targetUid) {
  if (!currentUid || !targetUid) return;

  if (isFirebaseConfigured && db && !isLocalDemoUid(currentUid)) {
    try {
      await updateDoc(doc(db, 'users', currentUid), {
        blockedUsers: arrayRemove(targetUid),
        updatedAt: serverTimestamp(),
      });
      return;
    } catch {
      // Fallback to localStore
    }
  }

  const users = localStore.getUsers();
  const idx = users.findIndex((u) => u.uid === currentUid);
  if (idx !== -1) {
    users[idx].blockedUsers = (users[idx].blockedUsers || []).filter((id) => id !== targetUid);
    localStore.saveUsers(users);
  }
}
