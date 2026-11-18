import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  where,
  onSnapshot,
  serverTimestamp,
  arrayUnion,
  arrayRemove,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { localStore } from './localStore';
import { sanitizeText, messageRateLimiter } from '../utils/security';
import { toDate } from '../utils/formatters';

/**
 * Generates one canonical, deterministic conversation ID for any pair of user UIDs.
 * Both User 1 and User 2 always generate the exact same ID: `${sortedUid1}_${sortedUid2}`.
 */
export function generateConversationId(uid1, uid2) {
  const a = String(uid1 || '').trim();
  const b = String(uid2 || '').trim();
  return [a, b].sort().join('_');
}

function getTimestampMs(item) {
  if (!item) return 0;
  if (typeof item.createdAtMs === 'number') return item.createdAtMs;
  if (typeof item.updatedAtMs === 'number') return item.updatedAtMs;
  const raw = item.updatedAt || item.createdAt || item.createdAtIso;
  if (!raw) return 0;
  return toDate(raw).getTime();
}

function sortAndDedupeChatsForUser(chats, uid) {
  const byPairOrId = new Map();

  chats.forEach((chat) => {
    if (!chat?.id) return;
    if (
      chat.type === 'direct' &&
      Array.isArray(chat.participants) &&
      chat.participants.length === 2
    ) {
      const otherUid = chat.participants.find((p) => p !== uid) || uid;
      const canonicalId = generateConversationId(uid, otherUid);
      const pairKey = `direct_pair_${canonicalId}`;
      const existing = byPairOrId.get(pairKey);

      if (!existing) {
        byPairOrId.set(pairKey, chat);
      } else {
        const existingTime = getTimestampMs(existing.lastMessage || existing);
        const candidateTime = getTimestampMs(chat.lastMessage || chat);
        if (chat.id === canonicalId && candidateTime >= existingTime) {
          byPairOrId.set(pairKey, chat);
        } else if (candidateTime > existingTime) {
          byPairOrId.set(pairKey, chat);
        }
      }
    } else {
      byPairOrId.set(chat.id, chat);
    }
  });

  return Array.from(byPairOrId.values()).sort((a, b) => {
    const aPinned = (a.pinnedBy || []).includes(uid);
    const bPinned = (b.pinnedBy || []).includes(uid);
    if (aPinned && !bPinned) return -1;
    if (!aPinned && bPinned) return 1;
    const timeA = getTimestampMs(a.lastMessage || a);
    const timeB = getTimestampMs(b.lastMessage || b);
    return timeB - timeA;
  });
}

/**
 * Subscribes in real time to all conversations where `uid` is a participant in mdchatpro Firestore.
 */
export function subscribeToUserChats(uid, callback) {
  if (!uid || !db) return () => {};

  const q = query(
    collection(db, 'chats'),
    where('participants', 'array-contains', uid)
  );

  return onSnapshot(
    q,
    { includeMetadataChanges: true },
    (snap) => {
      const firestoreChats = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      localStore.saveChats(firestoreChats);
      callback(sortAndDedupeChatsForUser(firestoreChats, uid));
    },
    (err) => {
      console.error('[chatService] subscribeToUserChats error:', err);
    }
  );
}

/**
 * Subscribes in real time to all messages in `chats/{chatId}/messages` in mdchatpro Firestore.
 * Deduplicates by message ID and sorts chronologically.
 */
export function subscribeToChatMessages(chatId, callback) {
  if (!chatId || !db) {
    callback([]);
    return () => {};
  }

  const msgsCollectionRef = collection(db, 'chats', chatId, 'messages');

  return onSnapshot(
    msgsCollectionRef,
    { includeMetadataChanges: true },
    (snap) => {
      const map = new Map();
      snap.docs.forEach((d) => {
        map.set(d.id, { id: d.id, ...d.data() });
      });

      const sorted = Array.from(map.values()).sort((a, b) => {
        const timeA = getTimestampMs(a);
        const timeB = getTimestampMs(b);
        if (timeA !== timeB) return timeA - timeB;
        return String(a.id).localeCompare(String(b.id));
      });

      localStore.saveChatMessages(chatId, sorted);
      callback(sorted);
    },
    (err) => {
      console.error('[chatService] subscribeToChatMessages error:', err);
    }
  );
}

/**
 * Loads or creates the unique 1-to-1 conversation in mdchatpro Firestore.
 * Always uses the canonical conversation ID: generateConversationId(currentUser.uid, targetUser.uid).
 */
export async function getOrCreateDirectChat(currentUser, targetUser) {
  if (!currentUser?.uid || !targetUser?.uid) {
    throw new Error('Both participants are required to start a chat.');
  }

  const canonicalId = generateConversationId(currentUser.uid, targetUser.uid);
  const participants = [currentUser.uid, targetUser.uid].sort();
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();

  const chatRef = doc(db, 'chats', canonicalId);
  const snap = await getDoc(chatRef);

  if (snap.exists()) {
    const existing = { id: snap.id, ...snap.data() };
    localStore.upsertChat(existing);
    return existing;
  }

  const newChatObj = {
    id: canonicalId,
    type: 'direct',
    name: '',
    description: '',
    avatar: '',
    participants,
    participantDetails: {
      [currentUser.uid]: {
        uid: currentUser.uid,
        displayName: currentUser.displayName || 'User',
        email: currentUser.email || '',
        photoURL: currentUser.photoURL || '',
      },
      [targetUser.uid]: {
        uid: targetUser.uid,
        displayName: targetUser.displayName || 'User',
        email: targetUser.email || '',
        photoURL: targetUser.photoURL || '',
      },
    },
    adminIds: [],
    createdBy: currentUser.uid,
    pinnedBy: [],
    mutedBy: [],
    archivedBy: [],
    typing: {},
    unreadCount: {
      [currentUser.uid]: 0,
      [targetUser.uid]: 0,
    },
    lastMessage: null,
    createdAtMs: nowMs,
    updatedAtMs: nowMs,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  await setDoc(chatRef, newChatObj, { merge: true });

  const localObj = { ...newChatObj, createdAt: nowIso, updatedAt: nowIso };
  localStore.upsertChat(localObj);
  return localObj;
}

/**
 * Creates a new group conversation in mdchatpro Firestore.
 */
export async function createGroupChat({
  name,
  description = '',
  avatar = '',
  creator,
  memberUids = [],
}) {
  const cleanName = sanitizeText(name, 60);
  if (!cleanName) {
    throw new Error('Group name is required.');
  }

  const participants = Array.from(new Set([creator.uid, ...memberUids]));
  if (participants.length < 2) {
    throw new Error('Please select at least 1 other member for the group.');
  }

  const unreadCount = {};
  participants.forEach((uid) => {
    unreadCount[uid] = 0;
  });

  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const systemText = `${creator.displayName} created group "${cleanName}"`;

  const groupRef = doc(collection(db, 'chats'));
  const chatId = groupRef.id;
  const msgRef = doc(collection(db, 'chats', chatId, 'messages'));

  const systemMsg = {
    id: msgRef.id,
    chatId,
    senderId: creator.uid,
    receiverId: 'group',
    participants,
    senderName: creator.displayName,
    text: systemText,
    type: 'system',
    status: 'read',
    attachments: [],
    replyTo: null,
    reactions: {},
    readBy: [creator.uid],
    deliveredTo: participants,
    starredBy: [],
    edited: false,
    deleted: false,
    createdAtMs: nowMs,
    createdAtIso: nowIso,
    createdAt: serverTimestamp(),
  };

  const newGroup = {
    id: chatId,
    type: 'group',
    name: cleanName,
    description: sanitizeText(description, 200),
    avatar: avatar || '',
    participants,
    adminIds: [creator.uid],
    createdBy: creator.uid,
    pinnedBy: [],
    mutedBy: [],
    archivedBy: [],
    typing: {},
    unreadCount,
    lastMessage: {
      id: systemMsg.id,
      text: systemMsg.text,
      senderId: creator.uid,
      receiverId: 'group',
      senderName: creator.displayName,
      type: 'system',
      status: 'read',
      createdAt: nowIso,
      createdAtMs: nowMs,
      deliveredTo: participants,
      readBy: [creator.uid],
    },
    createdAtMs: nowMs,
    updatedAtMs: nowMs,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  await setDoc(groupRef, newGroup);
  await setDoc(msgRef, systemMsg);

  return newGroup;
}

/**
 * Updates group details (name, description, avatar, participants) in mdchatpro Firestore.
 */
export async function updateGroupDetails(chatId, updates) {
  if (!chatId || !db) return;
  const cleanUpdates = { ...updates };
  if (typeof cleanUpdates.name === 'string') {
    cleanUpdates.name = sanitizeText(cleanUpdates.name, 60);
  }
  if (typeof cleanUpdates.description === 'string') {
    cleanUpdates.description = sanitizeText(cleanUpdates.description, 240);
  }

  await updateDoc(doc(db, 'chats', chatId), {
    ...cleanUpdates,
    updatedAtMs: Date.now(),
    updatedAt: serverTimestamp(),
  });
}

/**
 * Sends a real-time message in a conversation in mdchatpro Firestore.
 * Stores senderId (UID), receiverId (UID), participants, text, timestamp, and status ('sent').
 */
export async function sendMessage({
  chatId,
  sender,
  receiverUid = '',
  participants: passedParticipants = [],
  existingChat = null,
  onOptimistic = null,
  text = '',
  type = 'text',
  attachments = [],
  replyTo = null,
}) {
  if (!chatId || !sender?.uid) {
    throw new Error('Invalid conversation or sender.');
  }

  const rateCheck = messageRateLimiter.check(sender.uid);
  if (!rateCheck.allowed) {
    throw new Error(
      `Slow down! You are sending messages too quickly. Please wait ${rateCheck.retryAfterSeconds}s.`
    );
  }

  const cleanText = sanitizeText(text, 4000);
  if (!cleanText && (!attachments || attachments.length === 0)) {
    throw new Error('Cannot send an empty message.');
  }

  const previewText =
    cleanText ||
    (type === 'image'
      ? '📷 Photo'
      : attachments.length > 0
      ? `📎 ${attachments[0].name}`
      : 'Message');

  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();

  const chatRef = doc(db, 'chats', chatId);
  let existingChatData = existingChat;
  if (!existingChatData) {
    try {
      const chatSnap = await getDoc(chatRef);
      existingChatData = chatSnap.exists() ? chatSnap.data() : null;
    } catch {
      existingChatData = null;
    }
  }

  let participants =
    Array.isArray(existingChatData?.participants) &&
    existingChatData.participants.length >= 2
      ? [...existingChatData.participants]
      : Array.isArray(passedParticipants) && passedParticipants.length >= 2
      ? [...passedParticipants]
      : [];

  if (participants.length < 2 && receiverUid) {
    participants = [sender.uid, receiverUid].sort();
  }

  if (!participants.includes(sender.uid)) {
    participants.push(sender.uid);
  }

  const resolvedReceiverId =
    receiverUid ||
    (existingChatData?.type === 'group'
      ? 'group'
      : participants.find((id) => id !== sender.uid) || sender.uid);

  const msgRef = doc(collection(db, 'chats', chatId, 'messages'));
  const messageId = msgRef.id;

  const messagePayload = {
    id: messageId,
    chatId,
    senderId: sender.uid,
    receiverId: resolvedReceiverId,
    participants,
    senderName: sender.displayName || sender.email?.split('@')[0] || 'User',
    senderAvatar: sender.photoURL || '',
    text: cleanText,
    type,
    status: 'sent', // Initial status: Sent ✓
    attachments: attachments || [],
    replyTo: replyTo
      ? {
          id: replyTo.id,
          senderName: replyTo.senderName,
          text: sanitizeText(replyTo.text || 'Attachment', 180),
        }
      : null,
    reactions: {},
    readBy: [sender.uid],
    deliveredTo: [sender.uid],
    starredBy: [],
    edited: false,
    deleted: false,
    createdAtMs: nowMs,
    createdAtIso: nowIso,
    createdAt: serverTimestamp(),
  };

  const baseUnread = existingChatData?.unreadCount || {};
  const updatedUnread = { ...baseUnread };
  participants.forEach((uid) => {
    if (uid !== sender.uid) {
      updatedUnread[uid] = (Number(updatedUnread[uid]) || 0) + 1;
    } else {
      updatedUnread[uid] = 0;
    }
  });

  const updatedTyping = { ...(existingChatData?.typing || {}) };
  delete updatedTyping[sender.uid];

  const lastMessageObj = {
    id: messageId,
    text: previewText,
    senderId: sender.uid,
    receiverId: resolvedReceiverId,
    senderName: sender.displayName || 'User',
    type,
    status: 'sent',
    createdAt: nowIso,
    createdAtMs: nowMs,
    deliveredTo: [sender.uid],
    readBy: [sender.uid],
  };

  const optimisticMsg = { ...messagePayload, createdAt: nowIso };
  const existingLocalMsgs = localStore.getChatMessages(chatId);
  localStore.saveChatMessages(chatId, [...existingLocalMsgs, optimisticMsg]);

  if (onOptimistic) {
    onOptimistic(optimisticMsg, lastMessageObj);
  }

  const batch = writeBatch(db);
  batch.set(msgRef, messagePayload);
  batch.set(
    chatRef,
    {
      id: chatId,
      type: existingChatData?.type || 'direct',
      participants,
      lastMessage: lastMessageObj,
      unreadCount: updatedUnread,
      typing: updatedTyping,
      updatedAtMs: nowMs,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  await batch.commit();

  return optimisticMsg;
}

/**
 * Marks incoming messages in a conversation as Delivered (✓✓) in mdchatpro Firestore.
 */
export async function markChatAsDelivered(chatId, receiverUid) {
  if (!chatId || !receiverUid || !db) return;

  try {
    const chatRef = doc(db, 'chats', chatId);
    const chatSnap = await getDoc(chatRef);
    if (chatSnap.exists()) {
      const data = chatSnap.data();
      const lastMsg = data.lastMessage;
      if (
        lastMsg &&
        lastMsg.senderId !== receiverUid &&
        !(lastMsg.deliveredTo || []).includes(receiverUid)
      ) {
        const nextStatus = lastMsg.status === 'read' ? 'read' : 'delivered';
        await updateDoc(chatRef, {
          'lastMessage.deliveredTo': arrayUnion(receiverUid),
          'lastMessage.status': nextStatus,
        });
      }
    }

    const msgsSnap = await getDocs(collection(db, 'chats', chatId, 'messages'));
    const updates = [];
    msgsSnap.docs.forEach((d) => {
      const m = d.data();
      if (
        m.senderId !== receiverUid &&
        !(m.deliveredTo || []).includes(receiverUid)
      ) {
        const nextStatus = m.status === 'read' ? 'read' : 'delivered';
        updates.push(
          updateDoc(doc(db, 'chats', chatId, 'messages', d.id), {
            deliveredTo: arrayUnion(receiverUid),
            status: nextStatus,
          })
        );
      }
    });
    if (updates.length > 0) {
      await Promise.all(updates);
    }
  } catch {
    // Ignore transient delivery update error
  }
}

/**
 * Marks all messages in a conversation as Read (✓✓ blue ticks) in mdchatpro Firestore.
 */
export async function markChatAsRead(chatId, uid, sendReadReceipts = true) {
  if (!chatId || !uid || !db) return;

  try {
    const chatRef = doc(db, 'chats', chatId);
    const chatSnap = await getDoc(chatRef);
    if (chatSnap.exists()) {
      const chatData = chatSnap.data();
      const chatUpdates = {
        [`unreadCount.${uid}`]: 0,
      };
      if (
        sendReadReceipts &&
        chatData.lastMessage &&
        chatData.lastMessage.senderId !== uid
      ) {
        chatUpdates['lastMessage.readBy'] = arrayUnion(uid);
        chatUpdates['lastMessage.deliveredTo'] = arrayUnion(uid);
        chatUpdates['lastMessage.status'] = 'read';
      }
      await updateDoc(chatRef, chatUpdates);
    }

    if (sendReadReceipts) {
      const msgsSnap = await getDocs(collection(db, 'chats', chatId, 'messages'));
      const batchPromises = [];
      msgsSnap.docs.forEach((d) => {
        const data = d.data();
        if (
          data.senderId !== uid &&
          (!(data.readBy || []).includes(uid) || data.status !== 'read')
        ) {
          batchPromises.push(
            updateDoc(doc(db, 'chats', chatId, 'messages', d.id), {
              readBy: arrayUnion(uid),
              deliveredTo: arrayUnion(uid),
              status: 'read',
            })
          );
        }
      });
      if (batchPromises.length > 0) {
        await Promise.all(batchPromises);
      }
    }
  } catch (err) {
    console.error('[chatService] markChatAsRead error:', err);
  }
}

/**
 * Edits an existing message in mdchatpro Firestore.
 */
export async function editMessage({
  chatId,
  messageId,
  newText = '',
  newAttachments,
}) {
  const cleanText = sanitizeText(newText, 4000);
  const hasAttachments = Array.isArray(newAttachments) && newAttachments.length > 0;

  if (!cleanText && !hasAttachments) {
    throw new Error('Edited message must contain text or an image/file.');
  }

  const nextType = hasAttachments
    ? (newAttachments[0].type || '').startsWith('image/')
      ? 'image'
      : 'file'
    : 'text';

  const previewText =
    cleanText ||
    (nextType === 'image'
      ? '📷 Photo'
      : hasAttachments
      ? `📎 ${newAttachments[0].name}`
      : 'Edited message');

  const msgRef = doc(db, 'chats', chatId, 'messages', messageId);
  const updatePayload = {
    text: cleanText,
    edited: true,
    editedAt: serverTimestamp(),
  };
  if (newAttachments !== undefined) {
    updatePayload.attachments = newAttachments;
    updatePayload.type = nextType;
  }
  await updateDoc(msgRef, updatePayload);

  const chatRef = doc(db, 'chats', chatId);
  const chatSnap = await getDoc(chatRef);
  if (chatSnap.exists() && chatSnap.data().lastMessage?.id === messageId) {
    await updateDoc(chatRef, {
      'lastMessage.text': previewText,
      'lastMessage.type': nextType,
    });
  }
}

/**
 * Deletes a message in mdchatpro Firestore.
 */
export async function deleteMessage({ chatId, messageId }) {
  if (!chatId || !messageId || !db) return;

  await updateDoc(doc(db, 'chats', chatId, 'messages', messageId), {
    text: 'This message was deleted',
    attachments: [],
    deleted: true,
    deletedAt: serverTimestamp(),
  });

  const chatRef = doc(db, 'chats', chatId);
  const chatSnap = await getDoc(chatRef);
  if (chatSnap.exists() && chatSnap.data().lastMessage?.id === messageId) {
    await updateDoc(chatRef, {
      'lastMessage.text': '🚫 This message was deleted',
    });
  }
}

/**
 * Toggles an emoji reaction on a message in mdchatpro Firestore.
 */
export async function toggleMessageReaction({ chatId, messageId, uid, emoji }) {
  if (!chatId || !messageId || !uid || !emoji || !db) return;

  const msgRef = doc(db, 'chats', chatId, 'messages', messageId);
  const snap = await getDoc(msgRef);
  if (!snap.exists()) return;

  const currentReactions = { ...(snap.data().reactions || {}) };
  const usersForEmoji = new Set(currentReactions[emoji] || []);

  if (usersForEmoji.has(uid)) {
    usersForEmoji.delete(uid);
  } else {
    usersForEmoji.add(uid);
  }

  if (usersForEmoji.size === 0) {
    delete currentReactions[emoji];
  } else {
    currentReactions[emoji] = Array.from(usersForEmoji);
  }

  await updateDoc(msgRef, { reactions: currentReactions });
}

/**
 * Toggles starring a message in mdchatpro Firestore.
 */
export async function toggleStarMessage({ chatId, messageId, uid }) {
  if (!chatId || !messageId || !uid || !db) return;

  const msgRef = doc(db, 'chats', chatId, 'messages', messageId);
  const snap = await getDoc(msgRef);
  if (!snap.exists()) return;
  const starred = snap.data().starredBy || [];
  const isStarred = starred.includes(uid);
  await updateDoc(msgRef, {
    starredBy: isStarred ? arrayRemove(uid) : arrayUnion(uid),
  });
}

/**
 * Sets or clears typing status for a user in a chat in mdchatpro Firestore.
 */
export async function setTypingStatus(chatId, uid, isTyping) {
  if (!chatId || !uid || !db) return;

  const chatRef = doc(db, 'chats', chatId);
  await updateDoc(chatRef, {
    [`typing.${uid}`]: isTyping ? Date.now() : null,
  }).catch(() => {});
}

/**
 * Toggles pinning, muting, or archiving a chat for a specific user in mdchatpro Firestore.
 */
export async function toggleChatFlag(chatId, uid, field = 'pinnedBy') {
  if (!chatId || !uid || !db) return false;
  const allowedFields = ['pinnedBy', 'mutedBy', 'archivedBy'];
  if (!allowedFields.includes(field)) return false;

  const chatRef = doc(db, 'chats', chatId);
  const snap = await getDoc(chatRef);
  if (!snap.exists()) return false;
  const list = snap.data()[field] || [];
  const has = list.includes(uid);
  await updateDoc(chatRef, {
    [field]: has ? arrayRemove(uid) : arrayUnion(uid),
  });
  return !has;
}

/**
 * Clears all messages in a conversation in mdchatpro Firestore.
 */
export async function clearChatMessages(chatId) {
  if (!chatId || !db) return;

  const snap = await getDocs(collection(db, 'chats', chatId, 'messages'));
  await Promise.all(
    snap.docs.map((d) => deleteDoc(doc(db, 'chats', chatId, 'messages', d.id)))
  );
  await updateDoc(doc(db, 'chats', chatId), {
    lastMessage: null,
    updatedAtMs: Date.now(),
    updatedAt: serverTimestamp(),
  });
}

/**
 * Deletes a conversation or removes user from group in mdchatpro Firestore.
 */
export async function deleteOrLeaveChat(chatId, uid) {
  if (!chatId || !uid || !db) return;

  const chatRef = doc(db, 'chats', chatId);
  const snap = await getDoc(chatRef);
  if (!snap.exists()) return;
  const data = snap.data();

  if (data.type === 'group' && (data.participants || []).length > 2) {
    await updateDoc(chatRef, {
      participants: arrayRemove(uid),
      adminIds: arrayRemove(uid),
    });
  } else {
    await deleteDoc(chatRef);
  }
}
