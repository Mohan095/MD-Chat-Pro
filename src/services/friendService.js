import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  onSnapshot,
  serverTimestamp,
  arrayUnion,
  arrayRemove,
} from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../firebase/config';
import { localStore } from './localStore';
import { isLocalDemoUid } from './authService';

/**
 * Subscribes to incoming and outgoing friend requests for a user.
 */
export function subscribeToFriendRequests(uid, callback) {
  if (!uid) return () => {};

  const emitLocal = () => {
    const all = localStore.getFriendRequests();
    const incoming = all.filter((r) => r.toUid === uid && r.status === 'pending');
    const outgoing = all.filter((r) => r.fromUid === uid && r.status === 'pending');
    callback({ incoming, outgoing, all });
  };

  if (isFirebaseConfigured && db && !isLocalDemoUid(uid)) {
    const incomingQuery = query(
      collection(db, 'friendRequests'),
      where('toUid', '==', uid)
    );
    const outgoingQuery = query(
      collection(db, 'friendRequests'),
      where('fromUid', '==', uid)
    );

    let incoming = [];
    let outgoing = [];

    const emit = () => {
      callback({
        incoming: incoming.filter((r) => r.status === 'pending'),
        outgoing: outgoing.filter((r) => r.status === 'pending'),
        all: [...incoming, ...outgoing],
      });
    };

    const unsubIn = onSnapshot(
      incomingQuery,
      (snap) => {
        incoming = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        emit();
      },
      () => emitLocal()
    );

    const unsubOut = onSnapshot(
      outgoingQuery,
      (snap) => {
        outgoing = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        emit();
      },
      () => emitLocal()
    );

    return () => {
      unsubIn();
      unsubOut();
    };
  }

  emitLocal();
  return localStore.subscribe(emitLocal);
}

/**
 * Sends a friend request from fromUser to toUser.
 */
export async function sendFriendRequest(fromUser, toUser) {
  if (!fromUser?.uid || !toUser?.uid) {
    throw new Error('Invalid user information.');
  }
  if (fromUser.uid === toUser.uid) {
    throw new Error('You cannot send a friend request to yourself.');
  }

  if ((fromUser.friends || []).includes(toUser.uid)) {
    throw new Error('You are already friends with this user.');
  }

  if (isFirebaseConfigured && db && !isLocalDemoUid(fromUser.uid)) {
    try {
      const payload = {
        fromUid: fromUser.uid,
        fromUser: {
          uid: fromUser.uid,
          displayName: fromUser.displayName,
          username: fromUser.username || '',
          email: fromUser.email || '',
          photoURL: fromUser.photoURL || '',
          bio: fromUser.bio || '',
        },
        toUid: toUser.uid,
        toUser: {
          uid: toUser.uid,
          displayName: toUser.displayName,
          username: toUser.username || '',
          email: toUser.email || '',
          photoURL: toUser.photoURL || '',
        },
        status: 'pending',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      const docRef = await addDoc(collection(db, 'friendRequests'), payload);
      return { id: docRef.id, ...payload };
    } catch {
      // Fallback to local
    }
  }

  const requests = localStore.getFriendRequests();
  const existing = requests.find(
    (r) =>
      r.status === 'pending' &&
      ((r.fromUid === fromUser.uid && r.toUid === toUser.uid) ||
        (r.fromUid === toUser.uid && r.toUid === fromUser.uid))
  );

  if (existing) {
    throw new Error('A pending friend request already exists between you and this user.');
  }

  const now = new Date().toISOString();
  const newReq = {
    id: `freq_${Date.now()}`,
    fromUid: fromUser.uid,
    fromUser: {
      uid: fromUser.uid,
      displayName: fromUser.displayName,
      username: fromUser.username || '',
      email: fromUser.email || '',
      photoURL: fromUser.photoURL || '',
      bio: fromUser.bio || '',
    },
    toUid: toUser.uid,
    toUser: {
      uid: toUser.uid,
      displayName: toUser.displayName,
      username: toUser.username || '',
      email: toUser.email || '',
      photoURL: toUser.photoURL || '',
    },
    status: 'pending',
    createdAt: now,
    updatedAt: now,
  };

  requests.unshift(newReq);
  localStore.saveFriendRequests(requests);
  return newReq;
}

/**
 * Accepts a pending friend request and adds both users to each other's friends list.
 */
export async function acceptFriendRequest(request) {
  if (!request?.id) throw new Error('Invalid friend request.');

  if (isFirebaseConfigured && db && !isLocalDemoUid(request.toUid)) {
    try {
      await updateDoc(doc(db, 'friendRequests', request.id), {
        status: 'accepted',
        updatedAt: serverTimestamp(),
      });

      await updateDoc(doc(db, 'users', request.toUid), {
        friends: arrayUnion(request.fromUid),
        updatedAt: serverTimestamp(),
      });

      await updateDoc(doc(db, 'users', request.fromUid), {
        friends: arrayUnion(request.toUid),
        updatedAt: serverTimestamp(),
      });
      return;
    } catch {
      // Fallback to local
    }
  }

  const requests = localStore.getFriendRequests();
  const reqIdx = requests.findIndex((r) => r.id === request.id);
  if (reqIdx !== -1) {
    requests[reqIdx].status = 'accepted';
    requests[reqIdx].updatedAt = new Date().toISOString();
    localStore.saveFriendRequests(requests);
  }

  const users = localStore.getUsers();
  users.forEach((u) => {
    if (u.uid === request.fromUid) {
      u.friends = Array.from(new Set([...(u.friends || []), request.toUid]));
    }
    if (u.uid === request.toUid) {
      u.friends = Array.from(new Set([...(u.friends || []), request.fromUid]));
    }
  });
  localStore.saveUsers(users);
}

/**
 * Rejects or cancels a friend request.
 */
export async function rejectFriendRequest(requestId) {
  if (!requestId) return;

  if (isFirebaseConfigured && db && !requestId.startsWith('freq_')) {
    try {
      await deleteDoc(doc(db, 'friendRequests', requestId));
      return;
    } catch {
      // Fallback to local
    }
  }

  const requests = localStore.getFriendRequests().filter((r) => r.id !== requestId);
  localStore.saveFriendRequests(requests);
}

/**
 * Removes a user from friends list.
 */
export async function removeFriend(currentUid, friendUid) {
  if (!currentUid || !friendUid) return;

  if (isFirebaseConfigured && db && !isLocalDemoUid(currentUid)) {
    try {
      await updateDoc(doc(db, 'users', currentUid), {
        friends: arrayRemove(friendUid),
        updatedAt: serverTimestamp(),
      });
      await updateDoc(doc(db, 'users', friendUid), {
        friends: arrayRemove(currentUid),
        updatedAt: serverTimestamp(),
      });
      return;
    } catch {
      // Fallback to local
    }
  }

  const users = localStore.getUsers();
  users.forEach((u) => {
    if (u.uid === currentUid) {
      u.friends = (u.friends || []).filter((id) => id !== friendUid);
    }
    if (u.uid === friendUid) {
      u.friends = (u.friends || []).filter((id) => id !== currentUid);
    }
  });
  localStore.saveUsers(users);
}
