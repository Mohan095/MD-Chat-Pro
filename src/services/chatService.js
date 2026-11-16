import {
  collection,
  doc,
  addDoc,
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
    if (chat.type === 'direct' && Array.isArray(chat.participants) && chat.participants.length === 2) {
      const otherUid = chat.participants.find((p) => p !== uid) || uid;
      const canonicalId = generateConversationId(uid, otherUid);
      const pairKey = `direct_pair_${canonicalId}`;
      const existing = byPairOrId.get(pairKey);

      if (!existing) {
        byPairOrId.set(pairKey, chat);
      } else {
        // Prefer canonical ID or whichever has the most recent lastMessage
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
 * Subscribes in real time to all conversations where `uid` is a participant using Firestore onSnapshot().
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
        // Keep local mirror updated with authoritative Firestore state
        if (firestoreChats.length > 0) {
          localStore.saveChats(firestoreChats);
        }
        emitMerged();
      },
      (err) => {
        console.error('[chatService] subscribeToUserChats error:', err);
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
 * Subscribes in real time to all messages in `chats/{chatId}/messages` using Firestore onSnapshot().
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
      (err) => {
        console.error('[chatService] subscribeToChatMessages error:', err);
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
 * Loads or creates the unique 1-to-1 conversation for a pair of users.
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

  if (isFirebaseConfigured && db) {
    try {
      const chatRef = doc(db, 'chats', canonicalId);
      const snap = await getDoc(chatRef);

      if (snap.exists()) {
        const existingData = { id: snap.id, ...snap.data() };
        const chats = localStore.getChats();
        const idx = chats.findIndex((c) => c.id === canonicalId);
        if (idx !== -1) chats[idx] = existingData;
        else chats.unshift(existingData);
        localStore.saveChats(chats);
        return existingData;
      }

      const newChatPayload = {
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

      await setDoc(chatRef, newChatPayload, { merge: true });

      const localObj = {
        ...newChatPayload,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      const chats = localStore.getChats().filter((c) => c.id !== canonicalId);
      chats.unshift(localObj);
      localStore.saveChats(chats);
      return localObj;
    } catch (err) {
      console.error('[chatService] getOrCreateDirectChat Firestore error:', err);
    }
  }

  const chats = localStore.getChats();
  const existingLocal = chats.find((c) => c.id === canonicalId);
  if (existingLocal) return existingLocal;

  const fallbackChat = {
    id: canonicalId,
    type: 'direct',
    name: '',
    description: '',
    avatar: '',
    participants,
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

  chats.unshift(fallbackChat);
  localStore.saveChats(chats);
  return fallbackChat;
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

  if (isFirebaseConfigured && db) {
    try {
      const groupRef = doc(collection(db, 'chats'));
      const chatId = groupRef.id;
      const msgRef = doc(collection(db, 'chats', chatId, 'messages'));

      const payload = {
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
          id: msgRef.id,
          text: systemText,
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

      await setDoc(groupRef, payload);
      await setDoc(msgRef, {
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
      });

      return payload;
    } catch (err) {
      console.error('[chatService] createGroupChat error:', err);
    }
  }

  const chatId = `group_${nowMs}_${Math.random().toString(36).slice(2, 6)}`;
  const systemMsg = {
    id: `msg_sys_${nowMs}`,
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

  const chats = localStore.getChats();
  chats.unshift(newGroup);
  localStore.saveChats(chats);
  localStore.saveChatMessages(chatId, [systemMsg]);
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

  if (isFirebaseConfigured && db) {
    try {
      await updateDoc(doc(db, 'chats', chatId), {
        ...cleanUpdates,
        updatedAtMs: Date.now(),
        updatedAt: serverTimestamp(),
      });
    } catch {
      // Fallback to local
    }
  }

  const chats = localStore.getChats();
  const idx = chats.findIndex((c) => c.id === chatId);
  if (idx !== -1) {
    chats[idx] = {
      ...chats[idx],
      ...cleanUpdates,
      updatedAtMs: Date.now(),
      updatedAt: new Date().toISOString(),
    };
    localStore.saveChats(chats);
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

  // Resolve participants list reliably using UIDs
  let participants = Array.isArray(passedParticipants) && passedParticipants.length >= 2
    ? [...passedParticipants]
    : [];

  let existingChatData = null;

  if (isFirebaseConfigured && db) {
    try {
      const chatRef = doc(db, 'chats', chatId);
      const chatSnap = await getDoc(chatRef);
      if (chatSnap.exists()) {
        existingChatData = chatSnap.data();
        if (Array.isArray(existingChatData.participants) && existingChatData.participants.length >= 2) {
          participants = existingChatData.participants;
        }
      }
    } catch {
      // Continue and derive participants if getDoc failed
    }
  }

  if (participants.length < 2) {
    const localChat = localStore.getChats().find((c) => c.id === chatId);
    if (localChat?.participants?.length >= 2) {
      participants = localChat.participants;
      existingChatData = existingChatData || localChat;
    } else if (receiverUid) {
      participants = [sender.uid, receiverUid].sort();
    } else if (chatId.includes('_')) {
      const parts = chatId.split('_').filter(Boolean);
      if (parts.length === 2) {
        participants = parts;
      }
    }
  }

  if (!participants.includes(sender.uid)) {
    participants.push(sender.uid);
  }

  const resolvedReceiverId =
    receiverUid ||
    (existingChatData?.type === 'group'
      ? 'group'
      : participants.find((id) => id !== sender.uid) || sender.uid);

  // Create a single deterministic message ID for both Firestore and optimistic state (prevents duplicates!)
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
  };

  // Compute updated unread counts for all other participants
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

  // Update local mirror immediately for 0ms sender feedback
  const localMessages = localStore.getChatMessages(chatId).filter((m) => m.id !== messageId);
  localMessages.push({ ...baseMessage, createdAt: nowIso });
  localStore.saveChatMessages(chatId, localMessages);

  const localChats = localStore.getChats();
  const lIdx = localChats.findIndex((c) => c.id === chatId);
  if (lIdx !== -1) {
    localChats[lIdx] = {
      ...localChats[lIdx],
      participants,
      lastMessage: lastMessageObj,
      unreadCount: updatedUnread,
      typing: updatedTyping,
      updatedAtMs: nowMs,
      updatedAt: nowIso,
    };
  } else {
    localChats.unshift({
      id: chatId,
      type: existingChatData?.type || 'direct',
      name: existingChatData?.name || '',
      description: existingChatData?.description || '',
      avatar: existingChatData?.avatar || '',
      participants,
      adminIds: existingChatData?.adminIds || [],
      createdBy: existingChatData?.createdBy || sender.uid,
      pinnedBy: [],
      mutedBy: [],
      archivedBy: [],
      lastMessage: lastMessageObj,
      unreadCount: updatedUnread,
      typing: updatedTyping,
      createdAtMs: nowMs,
      updatedAtMs: nowMs,
      createdAt: nowIso,
      updatedAt: nowIso,
    });
  }
  localStore.saveChats(localChats);

  // Persist to Firebase Cloud Firestore so Receiver gets instant onSnapshot update
  if (isFirebaseConfigured && db && msgRef) {
    const chatRef = doc(db, 'chats', chatId);

    // Ensure parent conversation document exists and has updated lastMessage + unreadCount
    await setDoc(
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

    // Write message document to chats/{chatId}/messages/{messageId}
    await setDoc(msgRef, {
      ...baseMessage,
      createdAt: serverTimestamp(),
    });
  }

  return { ...baseMessage, createdAt: nowIso };
}

/**
 * Marks incoming messages in a conversation as Delivered (✓✓) when the receiver's client receives them.
 */
export async function markChatAsDelivered(chatId, receiverUid) {
  if (!chatId || !receiverUid) return;

  if (isFirebaseConfigured && db) {
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
      // Ignore transient delivery update errors
    }
  }
}

/**
 * Marks all messages in a conversation as Read (✓✓ blue ticks) by `uid` and resets their unread counter to 0.
 */
export async function markChatAsRead(chatId, uid, sendReadReceipts = true) {
  if (!chatId || !uid) return;

  // Update local mirror
  const chats = localStore.getChats();
  const chatIdx = chats.findIndex((c) => c.id === chatId);
  if (chatIdx !== -1) {
    const chat = chats[chatIdx];
    chat.unreadCount = { ...(chat.unreadCount || {}), [uid]: 0 };
    if (sendReadReceipts && chat.lastMessage && chat.lastMessage.senderId !== uid) {
      const rSet = new Set(chat.lastMessage.readBy || []);
      rSet.add(uid);
      const dSet = new Set(chat.lastMessage.deliveredTo || []);
      dSet.add(uid);
      chat.lastMessage = {
        ...chat.lastMessage,
        readBy: Array.from(rSet),
        deliveredTo: Array.from(dSet),
        status: 'read',
      };
    }
    localStore.saveChats(chats);
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

  if (isFirebaseConfigured && db) {
    try {
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
    } catch (err) {
      console.error('[chatService] editMessage error:', err);
    }
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

  if (isFirebaseConfigured && db) {
    try {
      const msgRef = doc(db, 'chats', chatId, 'messages', messageId);
      await updateDoc(msgRef, {
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
    } catch (err) {
      console.error('[chatService] deleteMessage error:', err);
    }
  }
}

/**
 * Toggles an emoji reaction on a message.
 */
export async function toggleMessageReaction({ chatId, messageId, uid, emoji }) {
  if (!chatId || !messageId || !uid || !emoji) return;

  if (isFirebaseConfigured && db) {
    try {
      const msgRef = doc(db, 'chats', chatId, 'messages', messageId);
      const snap = await getDoc(msgRef);
      if (snap.exists()) {
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
        return;
      }
    } catch {
      // Fallback to local
    }
  }

  const messages = localStore.getChatMessages(chatId);
  const idx = messages.findIndex((m) => m.id === messageId);
  if (idx === -1) return;

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
  localStore.saveChatMessages(chatId, messages);
}

/**
 * Toggles starring a message.
 */
export async function toggleStarMessage({ chatId, messageId, uid }) {
  if (!chatId || !messageId || !uid) return;

  if (isFirebaseConfigured && db) {
    try {
      const msgRef = doc(db, 'chats', chatId, 'messages', messageId);
      const snap = await getDoc(msgRef);
      if (snap.exists()) {
        const starred = snap.data().starredBy || [];
        const isStarred = starred.includes(uid);
        await updateDoc(msgRef, {
          starredBy: isStarred ? arrayRemove(uid) : arrayUnion(uid),
        });
        return;
      }
    } catch {
      // Fallback to local
    }
  }

  const messages = localStore.getChatMessages(chatId);
  const idx = messages.findIndex((m) => m.id === messageId);
  if (idx === -1) return;

  const starred = new Set(messages[idx].starredBy || []);
  if (starred.has(uid)) {
    starred.delete(uid);
  } else {
    starred.add(uid);
  }
  messages[idx].starredBy = Array.from(starred);
  localStore.saveChatMessages(chatId, messages);
}

/**
 * Sets or clears typing status for a user in a chat.
 */
export async function setTypingStatus(chatId, uid, isTyping) {
  if (!chatId || !uid) return;

  if (isFirebaseConfigured && db) {
    try {
      const chatRef = doc(db, 'chats', chatId);
      await updateDoc(chatRef, {
        [`typing.${uid}`]: isTyping ? Date.now() : null,
      });
      return;
    } catch {
      // Fallback to local
    }
  }

  const chats = localStore.getChats();
  const idx = chats.findIndex((c) => c.id === chatId);
  if (idx !== -1) {
    const typing = { ...(chats[idx].typing || {}) };
    if (isTyping) {
      typing[uid] = Date.now();
    } else {
      delete typing[uid];
    }
    chats[idx].typing = typing;
    localStore.saveChats(chats);
  }
}

/**
 * Toggles pinning, muting, or archiving a chat for a specific user.
 */
export async function toggleChatFlag(chatId, uid, field = 'pinnedBy') {
  if (!chatId || !uid) return false;
  const allowedFields = ['pinnedBy', 'mutedBy', 'archivedBy'];
  if (!allowedFields.includes(field)) return false;

  if (isFirebaseConfigured && db) {
    try {
      const chatRef = doc(db, 'chats', chatId);
      const snap = await getDoc(chatRef);
      if (snap.exists()) {
        const list = snap.data()[field] || [];
        const has = list.includes(uid);
        await updateDoc(chatRef, {
          [field]: has ? arrayRemove(uid) : arrayUnion(uid),
        });
        return !has;
      }
    } catch {
      // Fallback to local
    }
  }

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
  chats[idx][field] = Array.from(set);
  localStore.saveChats(chats);
  return added;
}

/**
 * Clears all messages in a conversation.
 */
export async function clearChatMessages(chatId) {
  if (!chatId) return;

  localStore.saveChatMessages(chatId, []);
  const chats = localStore.getChats();
  const idx = chats.findIndex((c) => c.id === chatId);
  if (idx !== -1) {
    chats[idx].lastMessage = null;
    localStore.saveChats(chats);
  }

  if (isFirebaseConfigured && db) {
    try {
      const snap = await getDocs(collection(db, 'chats', chatId, 'messages'));
      await Promise.all(
        snap.docs.map((d) => deleteDoc(doc(db, 'chats', chatId, 'messages', d.id)))
      );
      await updateDoc(doc(db, 'chats', chatId), {
        lastMessage: null,
        updatedAtMs: Date.now(),
        updatedAt: serverTimestamp(),
      });
    } catch {
      // Fallback to local
    }
  }
}

/**
 * Deletes a conversation or removes user from group.
 */
export async function deleteOrLeaveChat(chatId, uid) {
  if (!chatId || !uid) return;

  const chats = localStore.getChats().filter((c) => c.id !== chatId);
  localStore.saveChats(chats);

  if (isFirebaseConfigured && db) {
    try {
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
    } catch {
      // Fallback to local
    }
  }
}
