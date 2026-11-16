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
} from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../firebase/config';
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

/**
 * Non-blocking Firestore helper with timeout so quota exhaustion or offline network
 * never blocks instant real-time message delivery.
 */
async function withFirestoreTimeout(promise, ms = 1800) {
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve(null), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Extracts a numeric timestamp (ms) from a message or chat object for deterministic sorting.
 */
function getTimestampMs(item) {
  if (!item) return 0;
  if (typeof item.createdAtMs === 'number') return item.createdAtMs;
  if (typeof item.updatedAtMs === 'number') return item.updatedAtMs;
  const raw = item.updatedAt || item.createdAt || item.createdAtIso;
  if (!raw) return 0;
  return toDate(raw).getTime();
}

/**
 * Sorts conversations for a user: pinned chats first, then newest activity first.
 * Also deduplicates direct conversations for the same user pair so both users always
 * see one unified conversation thread.
 */
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
 * Subscribes in real time to all conversations where `uid` is a participant.
 */
export function subscribeToUserChats(uid, callback) {
  if (!uid) return () => {};

  let firestoreChats = [];

  const emitMerged = () => {
    const map = new Map();
    const localChats = localStore
      .getChats()
      .filter((c) => (c.participants || []).includes(uid));
    localChats.forEach((c) => {
      if (c?.id) map.set(c.id, c);
    });
    firestoreChats.forEach((c) => {
      if (c?.id) map.set(c.id, { ...(map.get(c.id) || {}), ...c });
    });
    callback(sortAndDedupeChatsForUser(Array.from(map.values()), uid));
  };

  const unsubLocal = localStore.subscribe(emitMerged);

  if (isFirebaseConfigured && db) {
    const q = query(
      collection(db, 'chats'),
      where('participants', 'array-contains', uid)
    );

    const unsubFirestore = onSnapshot(
      q,
      { includeMetadataChanges: true },
      (snap) => {
        firestoreChats = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        if (firestoreChats.length > 0) {
          localStore.saveChats(firestoreChats);
        }
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
 * Subscribes in real time to all messages in `chats/{chatId}/messages`.
 * Deduplicates by message ID and sorts chronologically.
 */
export function subscribeToChatMessages(chatId, callback) {
  if (!chatId) {
    callback([]);
    return () => {};
  }

  let firestoreMsgs = [];

  const emitMerged = () => {
    const map = new Map();
    localStore.getChatMessages(chatId).forEach((m) => {
      if (m?.id) map.set(m.id, m);
    });
    firestoreMsgs.forEach((m) => {
      if (m?.id) map.set(m.id, { ...(map.get(m.id) || {}), ...m });
    });

    const sorted = Array.from(map.values()).sort((a, b) => {
      const timeA = getTimestampMs(a);
      const timeB = getTimestampMs(b);
      if (timeA !== timeB) return timeA - timeB;
      return String(a.id).localeCompare(String(b.id));
    });

    callback(sorted);
  };

  const unsubLocal = localStore.subscribe(emitMerged);

  if (isFirebaseConfigured && db) {
    const msgsCollectionRef = collection(db, 'chats', chatId, 'messages');

    const unsubFirestore = onSnapshot(
      msgsCollectionRef,
      { includeMetadataChanges: true },
      (snap) => {
        firestoreMsgs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        if (firestoreMsgs.length > 0) {
          localStore.saveChatMessages(chatId, firestoreMsgs);
        }
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
 * Loads or creates the unique 1-to-1 conversation for a pair of users immediately.
 * Always uses the canonical conversation ID: generateConversationId(currentUser.uid, targetUser.uid).
 */
export async function getOrCreateDirectChat(currentUser, targetUser) {
  if (!currentUser?.uid || !targetUser?.uid) {
    throw new Error('Both participants are required to start a chat.');
  }

  await localStore.pullFromServer();

  const canonicalId = generateConversationId(currentUser.uid, targetUser.uid);
  const participants = [currentUser.uid, targetUser.uid].sort();
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();

  const existingLocal = localStore.getChats().find((c) => c.id === canonicalId);
  if (existingLocal) {
    return existingLocal;
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
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  // Save immediately to real-time store (0ms response + pushes to /api/realtime)
  localStore.upsertChat(newChatObj);

  // Sync to Firestore in background without blocking
  if (isFirebaseConfigured && db) {
    withFirestoreTimeout(
      (async () => {
        const chatRef = doc(db, 'chats', canonicalId);
        const snap = await getDoc(chatRef);
        if (!snap.exists()) {
          await setDoc(
            chatRef,
            {
              ...newChatObj,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            },
            { merge: true }
          );
        } else {
          localStore.upsertChat({ id: snap.id, ...snap.data() });
        }
      })()
    );
  }

  return newChatObj;
}

/**
 * Creates a new group conversation with multiple members.
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

  const groupRef =
    isFirebaseConfigured && db ? doc(collection(db, 'chats')) : null;
  const chatId =
    groupRef?.id || `group_${nowMs}_${Math.random().toString(36).slice(2, 6)}`;
  const msgRef =
    isFirebaseConfigured && db
      ? doc(collection(db, 'chats', chatId, 'messages'))
      : null;
  const sysMsgId = msgRef?.id || `msg_sys_${nowMs}`;

  const systemMsg = {
    id: sysMsgId,
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
    createdAt: nowIso,
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
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  localStore.upsertChat(newGroup);
  localStore.saveChatMessages(chatId, [systemMsg]);

  if (isFirebaseConfigured && db && groupRef && msgRef) {
    withFirestoreTimeout(
      Promise.all([
        setDoc(groupRef, {
          ...newGroup,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }),
        setDoc(msgRef, {
          ...systemMsg,
          createdAt: serverTimestamp(),
        }),
      ])
    );
  }

  return newGroup;
}

/**
 * Updates group details (name, description, avatar, participants).
 */
export async function updateGroupDetails(chatId, updates) {
  if (!chatId) return;
  const cleanUpdates = { ...updates };
  if (typeof cleanUpdates.name === 'string') {
    cleanUpdates.name = sanitizeText(cleanUpdates.name, 60);
  }
  if (typeof cleanUpdates.description === 'string') {
    cleanUpdates.description = sanitizeText(cleanUpdates.description, 240);
  }

  const chats = localStore.getChats();
  const idx = chats.findIndex((c) => c.id === chatId);
  if (idx !== -1) {
    const updated = {
      ...chats[idx],
      ...cleanUpdates,
      updatedAtMs: Date.now(),
      updatedAt: new Date().toISOString(),
    };
    localStore.upsertChat(updated);
  }

  if (isFirebaseConfigured && db) {
    withFirestoreTimeout(
      updateDoc(doc(db, 'chats', chatId), {
        ...cleanUpdates,
        updatedAtMs: Date.now(),
        updatedAt: serverTimestamp(),
      })
    );
  }
}

/**
 * Sends a real-time message in a conversation.
 * Stores senderId (UID), receiverId (UID), participants, text, timestamp, and status ('sent').
 */
export async function sendMessage({
  chatId,
  sender,
  receiverUid = '',
  participants: passedParticipants = [],
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

  const existingLocalChat = localStore.getChats().find((c) => c.id === chatId);
  let participants =
    Array.isArray(passedParticipants) && passedParticipants.length >= 2
      ? [...passedParticipants]
      : Array.isArray(existingLocalChat?.participants) &&
        existingLocalChat.participants.length >= 2
      ? [...existingLocalChat.participants]
      : [];

  if (participants.length < 2 && receiverUid) {
    participants = [sender.uid, receiverUid].sort();
  }

  if (!participants.includes(sender.uid)) {
    participants.push(sender.uid);
  }

  const resolvedReceiverId =
    receiverUid ||
    (existingLocalChat?.type === 'group'
      ? 'group'
      : participants.find((id) => id !== sender.uid) || sender.uid);

  const msgRef =
    isFirebaseConfigured && db
      ? doc(collection(db, 'chats', chatId, 'messages'))
      : null;
  const messageId =
    msgRef?.id || `msg_${nowMs}_${Math.random().toString(36).slice(2, 7)}`;

  const baseMessage = {
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
    createdAt: nowIso,
  };

  const baseUnread = existingLocalChat?.unreadCount || {};
  const updatedUnread = { ...baseUnread };
  participants.forEach((uid) => {
    if (uid !== sender.uid) {
      updatedUnread[uid] = (Number(updatedUnread[uid]) || 0) + 1;
    } else {
      updatedUnread[uid] = 0;
    }
  });

  const updatedTyping = { ...(existingLocalChat?.typing || {}) };
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

  // 1. Update real-time store & push to /api/realtime + BroadcastChannel in 0ms
  const localMessages = localStore
    .getChatMessages(chatId)
    .filter((m) => m.id !== messageId);
  localMessages.push(baseMessage);
  localStore.saveChatMessages(chatId, localMessages);

  const updatedChatObj = {
    ...(existingLocalChat || {
      id: chatId,
      type: 'direct',
      name: '',
      description: '',
      avatar: '',
      adminIds: [],
      createdBy: sender.uid,
      pinnedBy: [],
      mutedBy: [],
      archivedBy: [],
      createdAtMs: nowMs,
      createdAt: nowIso,
    }),
    id: chatId,
    participants,
    lastMessage: lastMessageObj,
    unreadCount: updatedUnread,
    typing: updatedTyping,
    updatedAtMs: nowMs,
    updatedAt: nowIso,
  };
  localStore.upsertChat(updatedChatObj);

  // 2. Persist to Firebase Cloud Firestore in parallel
  if (isFirebaseConfigured && db && msgRef) {
    const chatRef = doc(db, 'chats', chatId);
    withFirestoreTimeout(
      Promise.all([
        setDoc(
          chatRef,
          {
            ...updatedChatObj,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        ),
        setDoc(msgRef, {
          ...baseMessage,
          createdAt: serverTimestamp(),
        }),
      ])
    );
  }

  return baseMessage;
}

/**
 * Marks incoming messages in a conversation as Delivered (✓✓) when the receiver's client receives them.
 */
export async function markChatAsDelivered(chatId, receiverUid) {
  if (!chatId || !receiverUid) return;

  const chats = localStore.getChats();
  const chatIdx = chats.findIndex((c) => c.id === chatId);
  if (chatIdx !== -1) {
    const chat = chats[chatIdx];
    const lastMsg = chat.lastMessage;
    if (
      lastMsg &&
      lastMsg.senderId !== receiverUid &&
      !(lastMsg.deliveredTo || []).includes(receiverUid)
    ) {
      const dSet = new Set(lastMsg.deliveredTo || []);
      dSet.add(receiverUid);
      chat.lastMessage = {
        ...lastMsg,
        deliveredTo: Array.from(dSet),
        status: lastMsg.status === 'read' ? 'read' : 'delivered',
      };
      localStore.upsertChat(chat);
    }
  }

  const messages = localStore.getChatMessages(chatId);
  let msgsChanged = false;
  messages.forEach((m) => {
    if (
      m.senderId !== receiverUid &&
      !(m.deliveredTo || []).includes(receiverUid)
    ) {
      const dSet = new Set(m.deliveredTo || []);
      dSet.add(receiverUid);
      m.deliveredTo = Array.from(dSet);
      if (m.status !== 'read') m.status = 'delivered';
      msgsChanged = true;
    }
  });
  if (msgsChanged) {
    localStore.saveChatMessages(chatId, messages);
  }

  if (isFirebaseConfigured && db) {
    withFirestoreTimeout(
      (async () => {
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
      })()
    );
  }
}

/**
 * Marks all messages in a conversation as Read (✓✓ blue ticks) by `uid` and resets their unread counter to 0.
 */
export async function markChatAsRead(chatId, uid, sendReadReceipts = true) {
  if (!chatId || !uid) return;

  const chats = localStore.getChats();
  const chatIdx = chats.findIndex((c) => c.id === chatId);
  if (chatIdx !== -1) {
    const chat = { ...chats[chatIdx] };
    let chatModified = false;

    if ((chat.unreadCount?.[uid] || 0) > 0) {
      chat.unreadCount = { ...(chat.unreadCount || {}), [uid]: 0 };
      chatModified = true;
    }

    if (sendReadReceipts && chat.lastMessage && chat.lastMessage.senderId !== uid) {
      const rSet = new Set(chat.lastMessage.readBy || []);
      const dSet = new Set(chat.lastMessage.deliveredTo || []);
      if (!rSet.has(uid) || chat.lastMessage.status !== 'read') {
        rSet.add(uid);
        dSet.add(uid);
        chat.lastMessage = {
          ...chat.lastMessage,
          readBy: Array.from(rSet),
          deliveredTo: Array.from(dSet),
          status: 'read',
        };
        chatModified = true;
      }
    }

    if (chatModified) {
      localStore.upsertChat(chat);
    }
  }

  if (sendReadReceipts) {
    const messages = localStore.getChatMessages(chatId);
    let changed = false;
    messages.forEach((m) => {
      if (m.senderId !== uid && (!(m.readBy || []).includes(uid) || m.status !== 'read')) {
        const rSet = new Set(m.readBy || []);
        rSet.add(uid);
        const dSet = new Set(m.deliveredTo || []);
        dSet.add(uid);
        m.readBy = Array.from(rSet);
        m.deliveredTo = Array.from(dSet);
        m.status = 'read';
        changed = true;
      }
    });
    if (changed) {
      localStore.saveChatMessages(chatId, messages);
    }
  }

  if (isFirebaseConfigured && db) {
    withFirestoreTimeout(
      (async () => {
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
      })()
    );
  }
}

/**
 * Edits an existing message (supports editing text, replacing/removing image attachments, or both).
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

  const messages = localStore.getChatMessages(chatId);
  const idx = messages.findIndex((m) => m.id === messageId);
  if (idx !== -1) {
    messages[idx] = {
      ...messages[idx],
      text: cleanText,
      ...(newAttachments !== undefined
        ? { attachments: newAttachments, type: nextType }
        : {}),
      edited: true,
      editedAt: new Date().toISOString(),
    };
    localStore.saveChatMessages(chatId, messages);
  }

  const chats = localStore.getChats();
  const chatIdx = chats.findIndex((c) => c.id === chatId);
  if (chatIdx !== -1 && chats[chatIdx].lastMessage?.id === messageId) {
    const updatedChat = {
      ...chats[chatIdx],
      lastMessage: {
        ...chats[chatIdx].lastMessage,
        text: previewText,
        type: nextType,
      },
    };
    localStore.upsertChat(updatedChat);
  }

  if (isFirebaseConfigured && db) {
    withFirestoreTimeout(
      (async () => {
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
      })()
    );
  }
}

/**
 * Deletes a message (text and/or image).
 */
export async function deleteMessage({ chatId, messageId }) {
  if (!chatId || !messageId) return;

  const messages = localStore.getChatMessages(chatId);
  const idx = messages.findIndex((m) => m.id === messageId);
  if (idx !== -1) {
    messages[idx] = {
      ...messages[idx],
      text: 'This message was deleted',
      attachments: [],
      deleted: true,
      deletedAt: new Date().toISOString(),
    };
    localStore.saveChatMessages(chatId, messages);
  }

  const chats = localStore.getChats();
  const chatIdx = chats.findIndex((c) => c.id === chatId);
  if (chatIdx !== -1 && chats[chatIdx].lastMessage?.id === messageId) {
    localStore.upsertChat({
      ...chats[chatIdx],
      lastMessage: {
        ...chats[chatIdx].lastMessage,
        text: '🚫 This message was deleted',
      },
    });
  }

  if (isFirebaseConfigured && db) {
    withFirestoreTimeout(
      updateDoc(doc(db, 'chats', chatId, 'messages', messageId), {
        text: 'This message was deleted',
        attachments: [],
        deleted: true,
        deletedAt: serverTimestamp(),
      })
    );
  }
}

/**
 * Toggles an emoji reaction on a message.
 */
export async function toggleMessageReaction({ chatId, messageId, uid, emoji }) {
  if (!chatId || !messageId || !uid || !emoji) return;

  const messages = localStore.getChatMessages(chatId);
  const idx = messages.findIndex((m) => m.id === messageId);
  let nextReactions = {};

  if (idx !== -1) {
    const currentReactions = { ...(messages[idx].reactions || {}) };
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

    messages[idx].reactions = currentReactions;
    nextReactions = currentReactions;
    localStore.saveChatMessages(chatId, messages);
  }

  if (isFirebaseConfigured && db) {
    withFirestoreTimeout(
      updateDoc(doc(db, 'chats', chatId, 'messages', messageId), {
        reactions: nextReactions,
      })
    );
  }
}

/**
 * Toggles starring a message.
 */
export async function toggleStarMessage({ chatId, messageId, uid }) {
  if (!chatId || !messageId || !uid) return;

  const messages = localStore.getChatMessages(chatId);
  const idx = messages.findIndex((m) => m.id === messageId);
  let isNowStarred = false;

  if (idx !== -1) {
    const starred = new Set(messages[idx].starredBy || []);
    if (starred.has(uid)) {
      starred.delete(uid);
      isNowStarred = false;
    } else {
      starred.add(uid);
      isNowStarred = true;
    }
    messages[idx].starredBy = Array.from(starred);
    localStore.saveChatMessages(chatId, messages);
  }

  if (isFirebaseConfigured && db) {
    withFirestoreTimeout(
      updateDoc(doc(db, 'chats', chatId, 'messages', messageId), {
        starredBy: isNowStarred ? arrayUnion(uid) : arrayRemove(uid),
      })
    );
  }
}

/**
 * Sets or clears typing status for a user in a chat.
 */
export async function setTypingStatus(chatId, uid, isTyping) {
  if (!chatId || !uid) return;

  const chats = localStore.getChats();
  const idx = chats.findIndex((c) => c.id === chatId);
  if (idx !== -1) {
    const typing = { ...(chats[idx].typing || {}) };
    if (isTyping) {
      typing[uid] = Date.now();
    } else {
      delete typing[uid];
    }
    localStore.upsertChat({ ...chats[idx], typing });
  }

  if (isFirebaseConfigured && db) {
    withFirestoreTimeout(
      updateDoc(doc(db, 'chats', chatId), {
        [`typing.${uid}`]: isTyping ? Date.now() : null,
      })
    );
  }
}

/**
 * Toggles pinning, muting, or archiving a chat for a specific user.
 */
export async function toggleChatFlag(chatId, uid, field = 'pinnedBy') {
  if (!chatId || !uid) return false;
  const allowedFields = ['pinnedBy', 'mutedBy', 'archivedBy'];
  if (!allowedFields.includes(field)) return false;

  const chats = localStore.getChats();
  const idx = chats.findIndex((c) => c.id === chatId);
  if (idx === -1) return false;

  const set = new Set(chats[idx][field] || []);
  let added = false;
  if (set.has(uid)) {
    set.delete(uid);
  } else {
    set.add(uid);
    added = true;
  }
  const updated = { ...chats[idx], [field]: Array.from(set) };
  localStore.upsertChat(updated);

  if (isFirebaseConfigured && db) {
    withFirestoreTimeout(
      updateDoc(doc(db, 'chats', chatId), {
        [field]: added ? arrayUnion(uid) : arrayRemove(uid),
      })
    );
  }

  return added;
}

/**
 * Clears all messages in a conversation.
 */
export async function clearChatMessages(chatId) {
  if (!chatId) return;

  localStore.saveChatMessages(chatId, []);
  localStore.pushToServer({ clearChatId: chatId });

  const chats = localStore.getChats();
  const idx = chats.findIndex((c) => c.id === chatId);
  if (idx !== -1) {
    localStore.upsertChat({ ...chats[idx], lastMessage: null });
  }

  if (isFirebaseConfigured && db) {
    withFirestoreTimeout(
      (async () => {
        const snap = await getDocs(collection(db, 'chats', chatId, 'messages'));
        await Promise.all(
          snap.docs.map((d) => deleteDoc(doc(db, 'chats', chatId, 'messages', d.id)))
        );
        await updateDoc(doc(db, 'chats', chatId), {
          lastMessage: null,
          updatedAtMs: Date.now(),
          updatedAt: serverTimestamp(),
        });
      })()
    );
  }
}

/**
 * Deletes a conversation or removes user from group.
 */
export async function deleteOrLeaveChat(chatId, uid) {
  if (!chatId || !uid) return;

  const chats = localStore.getChats().filter((c) => c.id !== chatId);
  localStore.saveChats(chats);
  localStore.pushToServer({ deleteChatId: chatId });

  if (isFirebaseConfigured && db) {
    withFirestoreTimeout(
      (async () => {
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
      })()
    );
  }
}
