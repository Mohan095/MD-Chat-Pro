import { updateProfile as updateFirebaseAuthProfile } from 'firebase/auth';
import { auth } from '../firebase/config';
import { localStore } from './localStore';
import { mongoGet, mongoPost, createMongoSubscription } from './mongoClient';
import { sanitizeText } from '../utils/security';

export function subscribeToUserProfile(uid, callback) {
  if (!uid) return () => {};

  return createMongoSubscription({
    topic: `user:${uid}`,
    intervalMs: 3000,
    fetcher: async () => {
      const res = await mongoGet('user', { uid });
      return res.user || null;
    },
    onData: (user) => {
      if (user) {
        localStore.upsertUser(user);
        callback(user);
      } else {
        const found = localStore.getUsers().find((u) => u.uid === uid) || null;
        callback(found);
      }
    },
    onError: () => {
      const found = localStore.getUsers().find((u) => u.uid === uid) || null;
      if (found) callback(found);
    },
  });
}

export function subscribeToAllUsers(callback) {
  return createMongoSubscription({
    topic: 'users',
    intervalMs: 3000,
    fetcher: async () => {
      const res = await mongoGet('users');
      return res.users || [];
    },
    onData: (users) => {
      localStore.saveUsers(users);
      callback(users);
    },
    onError: () => {
      const cached = localStore.getUsers();
      if (cached.length > 0) callback(cached);
    },
  });
}

export async function getUserById(uid) {
  if (!uid) return null;
  try {
    const res = await mongoGet('user', { uid });
    return res.user || null;
  } catch {
    return localStore.getUsers().find((u) => u.uid === uid) || null;
  }
}

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

  const existing = localStore.getUsers().find((u) => u.uid === uid) || { uid };
  const merged = { ...existing, ...cleanUpdates, updatedAt: new Date().toISOString() };
  localStore.upsertUser(merged);

  if (auth?.currentUser && auth.currentUser.uid === uid) {
    const authPatch = {};
    if (cleanUpdates.displayName) authPatch.displayName = cleanUpdates.displayName;
    if (cleanUpdates.photoURL) authPatch.photoURL = cleanUpdates.photoURL;
    if (Object.keys(authPatch).length > 0) {
      updateFirebaseAuthProfile(auth.currentUser, authPatch).catch(() => {});
    }
  }

  await mongoPost(
    'updateUser',
    { uid, updates: cleanUpdates },
    ['users', `user:${uid}`]
  );

  return merged;
}

export async function searchUsers(searchTerm, currentUid) {
  const term = (searchTerm || '').trim().toLowerCase();
  if (!term) return [];

  let users = localStore.getUsers();
  try {
    const res = await mongoGet('users');
    if (Array.isArray(res.users)) {
      users = res.users;
      localStore.saveUsers(users);
    }
  } catch {
    // Use local cache if offline
  }

  return users.filter(
    (u) =>
      u.uid !== currentUid &&
      (u.displayName?.toLowerCase().includes(term) ||
        u.username?.toLowerCase().includes(term) ||
        u.email?.toLowerCase().includes(term))
  );
}

export async function blockUser(currentUid, targetUid) {
  if (!currentUid || !targetUid) return;
  await mongoPost(
    'blockUser',
    { currentUid, targetUid },
    ['users', `user:${currentUid}`]
  );
}

export async function unblockUser(currentUid, targetUid) {
  if (!currentUid || !targetUid) return;
  await mongoPost(
    'unblockUser',
    { currentUid, targetUid },
    ['users', `user:${currentUid}`]
  );
}
