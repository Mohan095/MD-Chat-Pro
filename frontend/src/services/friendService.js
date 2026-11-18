import { localStore } from './localStore';
import { mongoGet, mongoPost, createMongoSubscription } from './mongoClient';

export function subscribeToFriendRequests(uid, callback) {
  if (!uid) return () => {};

  return createMongoSubscription({
    topic: `friendRequests:${uid}`,
    intervalMs: 3000,
    fetcher: async () => {
      const res = await mongoGet('friendRequests', { uid });
      return res.requests || [];
    },
    onData: (all) => {
      localStore.saveFriendRequests(all);
      const incoming = all.filter((r) => r.toUid === uid && r.status === 'pending');
      const outgoing = all.filter((r) => r.fromUid === uid && r.status === 'pending');
      callback({ incoming, outgoing, all });
    },
    onError: () => {
      const all = localStore.getFriendRequests();
      const incoming = all.filter((r) => r.toUid === uid && r.status === 'pending');
      const outgoing = all.filter((r) => r.fromUid === uid && r.status === 'pending');
      callback({ incoming, outgoing, all });
    },
  });
}

export async function sendFriendRequest(fromUser, toUser) {
  if (!fromUser?.uid || !toUser?.uid) {
    throw new Error('Invalid user information.');
  }
  if (fromUser.uid === toUser.uid) {
    throw new Error('You cannot send a friend request to yourself.');
  }

  const reqObj = {
    id: `fr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    fromUid: fromUser.uid,
    fromName: fromUser.displayName || 'User',
    fromEmail: fromUser.email || '',
    fromAvatar: fromUser.photoURL || '',
    toUid: toUser.uid,
    toName: toUser.displayName || 'User',
    toEmail: toUser.email || '',
    toAvatar: toUser.photoURL || '',
    status: 'pending',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await mongoPost(
    'sendFriendRequest',
    { request: reqObj },
    [`friendRequests:${fromUser.uid}`, `friendRequests:${toUser.uid}`]
  );

  return reqObj;
}

export async function acceptFriendRequest(request) {
  if (!request?.id || !request.fromUid || !request.toUid) return;

  await mongoPost(
    'acceptFriendRequest',
    {
      requestId: request.id,
      fromUid: request.fromUid,
      toUid: request.toUid,
    },
    [
      `friendRequests:${request.fromUid}`,
      `friendRequests:${request.toUid}`,
      'users',
      `user:${request.fromUid}`,
      `user:${request.toUid}`,
    ]
  );
}

export async function rejectFriendRequest(requestId) {
  if (!requestId) return;
  await mongoPost('rejectFriendRequest', { requestId }, ['friendRequests']);
}

export async function removeFriend(currentUid, targetUid) {
  if (!currentUid || !targetUid) return;
  await mongoPost(
    'removeFriend',
    { currentUid, targetUid },
    ['users', `user:${currentUid}`, `user:${targetUid}`]
  );
}
