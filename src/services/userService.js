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
import { auth, db } from '../firebase/config';
import { localStore } from './localStore';
import { sanitizeText } from '../utils/security';

/**
 * Subscribes to a single user profile document in mdchatpro Cloud Firestore in real time.
 */
export function subscribeToUserProfile(uid, callback) {
  if (!uid || !db) return () => {};

  return onSnapshot(
    doc(db, 'users', uid),
    (snap) => {
      if (snap.exists()) {
        const data = { uid: snap.id, ...snap.data() };
        localStore.upsertUser(data);
        callback(data);
      } else {
        const found = localStore.getUsers().find((u) => u.uid === uid) || null;
        callback(found);
      }
    },
    (err) => {
      console.error('[userService] subscribeToUserProfile error:', err);
    }
  );
}

/**
 * Subscribes to all registered users in mdchatpro Cloud Firestore in real time.
 */
export function subscribeToAllUsers(callback) {
  if (!db) return () => {};

  return onSnapshot(
    collection(db, 'users'),
    (snap) => {
      const firestoreUsers = snap.docs.map((d) => ({ uid: d.id, ...d.data() }));
      localStore.saveUsers(firestoreUsers);
      callback(firestoreUsers);
    },
    (err) => {
      console.error('[userService] subscribeToAllUsers error:', err);
    }
  );
}

/**
 * Fetches a user profile by UID from mdchatpro Cloud Firestore.
 */
export async function getUserById(uid) {
  if (!uid || !db) return null;
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? { uid: snap.id, ...snap.data() } : null;
}

/**
 * Updates user profile fields in mdchatpro Cloud Firestore.
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

  if (db) {
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
  }

  if (auth?.currentUser && auth.currentUser.uid === uid) {
    const authProfilePatch = {};
    if (cleanUpdates.displayName) authProfilePatch.displayName = cleanUpdates.displayName;
    if (cleanUpdates.photoURL !== undefined) authProfilePatch.photoURL = cleanUpdates.photoURL;
    if (Object.keys(authProfilePatch).length > 0) {
      await updateFirebaseAuthProfile(auth.currentUser, authProfilePatch).catch(() => {});
    }
  }

  return cleanUpdates;
}

/**
 * Searches registered users in mdchatpro Cloud Firestore.
 */
export async function searchUsers(searchTerm, currentUid) {
  const term = (searchTerm || '').trim().toLowerCase();
  if (!db) return [];

  const snap = await getDocs(collection(db, 'users'));
  const allUsers = snap.docs.map((d) => ({ uid: d.id, ...d.data() }));

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
 * Blocks a user in mdchatpro Cloud Firestore.
 */
export async function blockUser(currentUid, targetUid) {
  if (!currentUid || !targetUid || !db) return;

  await updateDoc(doc(db, 'users', currentUid), {
    blockedUsers: arrayUnion(targetUid),
    updatedAt: serverTimestamp(),
  });
}

/**
 * Unblocks a user in mdchatpro Cloud Firestore.
 */
export async function unblockUser(currentUid, targetUid) {
  if (!currentUid || !targetUid || !db) return;

  await updateDoc(doc(db, 'users', currentUid), {
    blockedUsers: arrayRemove(targetUid),
    updatedAt: serverTimestamp(),
  });
}
