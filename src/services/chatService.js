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
  orderBy,
  onSnapshot,
  serverTimestamp,
  arrayUnion,
  arrayRemove,
} from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../firebase/config';
import { localStore } from './localStore';
import { isLocalDemoUid } from './authService';
import { sanitizeText, messageRateLimiter } from '../utils/security';
import { toDate } from '../utils/formatters';

function sortChatsForUser(chats, uid) {
  return [...chats].sort((a, b) => {
    const aPinned = (a.pinnedBy || []).includes(uid);
    const bPinned = (b.pinnedBy || []).includes(uid);
    if (aPinned && !bPinned) return -1;
    if (!aPinned && bPinned) return 1;
    const timeA = toDate(a.updatedAt || a.createdAt).getTime();
    const timeB = toDate(b.updatedAt || b.createdAt).getTime();
    return timeB - timeA;
  });
}

function isLocalChatId() {
  return false;
}

/**
 * Subscribes to all conversations where the user is a participant (merges Firestore & local mirror).
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
    callback(sortChatsForUser(Array.from(map.values()), uid));
  };

  const unsubLocal = localStore.subscribe(emitMerged);

  if (isFirebaseConfigured && db) {
    const q = query(
      collection(db, 'chats'),
      where('participants', 'array-contains', uid)
    );

    const unsubFirestore = onSnapshot(
      q,
      (snap) => {
        firestoreChats = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
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
 * Subscribes to real-time messages for a specific chat (merges Firestore & local mirror).
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
    const sorted = Array.from(map.values()).sort(
      (a, b) => toDate(a.createdAt).getTime() - toDate(b.createdAt).getTime()
    );
    callback(sorted);
  };

  const unsubLocal = localStore.subscribe(emitMerged);

  if (isFirebaseConfigured && db) {
    const q = query(
      collection(db, 'chats', chatId, 'messages'),
      orderBy('createdAt', 'asc')
    );

    const unsubFirestore = onSnapshot(
      q,
      (snap) => {
        firestoreMsgs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
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
 * Finds an existing 1-to-1 chat between two users or creates one immediately.
 */
export async function getOrCreateDirectChat(currentUser, targetUser) {
  if (!currentUser?.uid || !targetUser?.uid) {
    throw new Error('Both participants are required to start a chat.');
  }

  const sortedPair = [currentUser.uid, targetUser.uid].sort();
  const deterministicId = `direct_${sortedPair[0]}_${sortedPair[1]}`;

  const chats = localStore.getChats();
  const existingLocal = chats.find(
    (c) =>
      c.id === deterministicId ||
      (c.type === 'direct' &&
        c.participants?.length === 2 &&
        c.participants.includes(currentUser.uid) &&
        c.participants.includes(targetUser.uid))
  );

  const now = new Date().toISOString();
  const chatObj = existingLocal || {
    id: deterministicId,
    type: 'direct',
    name: '',
    description: '',
    avatar: '',
    participants: [currentUser.uid, targetUser.uid],
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
    createdAt: now,
    updatedAt: now,
  };

  if (!existingLocal) {
    chats.unshift(chatObj);
    localStore.saveChats(chats);
  }

  if (isFirebaseConfigured && db) {
    setDoc(
      doc(db, 'chats', chatObj.id),
      {
        ...chatObj,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    ).catch(() => {});
  }

  return chatObj;
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

  if (isFirebaseConfigured && db && !isLocalDemoUid(creator.uid)) {
    try {
      const systemText = `${creator.displayName} created group "${cleanName}"`;
      const payload = {
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
          id: `sys_${Date.now()}`,
          text: systemText,
          senderId: creator.uid,
          senderName: creator.displayName,
          type: 'system',
          createdAt: new Date().toISOString(),
          readBy: [creator.uid],
        },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      const docRef = await addDoc(collection(db, 'chats'), payload);
      await addDoc(collection(db, 'chats', docRef.id, 'messages'), {
        chatId: docRef.id,
        senderId: creator.uid,
        senderName: creator.displayName,
        text: systemText,
        type: 'system',
        attachments: [],
        replyTo: null,
        reactions: {},
        readBy: [creator.uid],
        deliveredTo: participants,
        starredBy: [],
        edited: false,
        deleted: false,
        createdAt: serverTimestamp(),
      });

      return { id: docRef.id, ...payload };
    } catch {
      // Fallback to local
    }
  }

  const now = new Date().toISOString();
  const chatId = `group_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const systemMsg = {
    id: `msg_sys_${Date.now()}`,
    chatId,
    senderId: creator.uid,
    senderName: creator.displayName,
    text: `${creator.displayName} created group "${cleanName}"`,
    type: 'system',
    attachments: [],
    replyTo: null,
    reactions: {},
    readBy: [creator.uid],
    deliveredTo: participants,
    starredBy: [],
    edited: false,
    deleted: false,
    createdAt: now,
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
      senderName: creator.displayName,
      type: 'system',
      createdAt: now,
      readBy: [creator.uid],
    },
    createdAt: now,
    updatedAt: now,
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

  if (isFirebaseConfigured && db && !isLocalChatId(chatId)) {
    try {
      await updateDoc(doc(db, 'chats', chatId), {
        ...cleanUpdates,
        updatedAt: serverTimestamp(),
      });
      return;
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
      updatedAt: new Date().toISOString(),
    };
    localStore.saveChats(chats);
  }
}

/**
 * Sends a text, image, or file message in a chat room.
 */
export async function sendMessage({
  chatId,
  sender,
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
      ? '📷 Sent an image'
      : attachments.length > 0
      ? `📎 ${attachments[0].name}`
      : 'New message');

  if (isFirebaseConfigured && db && !isLocalChatId(chatId)) {
    try {
      const chatRef = doc(db, 'chats', chatId);
      const chatSnap = await getDoc(chatRef);
      if (!chatSnap.exists()) throw new Error('Conversation no longer exists.');

      const chatData = chatSnap.data();
      const participants = chatData.participants || [];

      const messagePayload = {
        chatId,
        senderId: sender.uid,
        senderName: sender.displayName || 'User',
        senderAvatar: sender.photoURL || '',
        text: cleanText,
        type,
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
        deliveredTo: participants,
        starredBy: [],
        edited: false,
        deleted: false,
        createdAt: serverTimestamp(),
      };

      const msgRef = await addDoc(
        collection(db, 'chats', chatId, 'messages'),
        messagePayload
      );

      const updatedUnread = { ...(chatData.unreadCount || {}) };
      participants.forEach((uid) => {
        if (uid !== sender.uid) {
          updatedUnread[uid] = (updatedUnread[uid] || 0) + 1;
        } else {
          updatedUnread[uid] = 0;
        }
      });

      const updatedTyping = { ...(chatData.typing || {}) };
      delete updatedTyping[sender.uid];

      await updateDoc(chatRef, {
        lastMessage: {
          id: msgRef.id,
          text: previewText,
          senderId: sender.uid,
          senderName: sender.displayName || 'User',
          type,
          createdAt: new Date().toISOString(),
          readBy: [sender.uid],
        },
        unreadCount: updatedUnread,
        typing: updatedTyping,
        updatedAt: serverTimestamp(),
      });

      return { id: msgRef.id, ...messagePayload };
    } catch {
      // Fallback to local
    }
  }

  const now = new Date().toISOString();
  const chats = localStore.getChats();
  const chatIdx = chats.findIndex((c) => c.id === chatId);
  if (chatIdx === -1) throw new Error('Conversation not found.');

  const chat = chats[chatIdx];
  const participants = chat.participants || [];

  const newMessage = {
    id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    chatId,
    senderId: sender.uid,
    senderName: sender.displayName || 'User',
    senderAvatar: sender.photoURL || '',
    text: cleanText,
    type,
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
    deliveredTo: participants,
    starredBy: [],
    edited: false,
    deleted: false,
    createdAt: now,
  };

  const messages = localStore.getChatMessages(chatId);
  messages.push(newMessage);
  localStore.saveChatMessages(chatId, messages);

  const updatedUnread = { ...(chat.unreadCount || {}) };
  participants.forEach((uid) => {
    if (uid !== sender.uid) {
      updatedUnread[uid] = (updatedUnread[uid] || 0) + 1;
    } else {
      updatedUnread[uid] = 0;
    }
  });

  const updatedTyping = { ...(chat.typing || {}) };
  delete updatedTyping[sender.uid];

  chats[chatIdx] = {
    ...chat,
    lastMessage: {
      id: newMessage.id,
      text: previewText,
      senderId: sender.uid,
      senderName: sender.displayName || 'User',
      type,
      createdAt: now,
      readBy: [sender.uid],
    },
    unreadCount: updatedUnread,
    typing: updatedTyping,
    updatedAt: now,
  };

  localStore.saveChats(chats);
  return newMessage;
}

/**
 * Edits an existing message (supports editing text, replacing/removing image attachments, or both).
 */
export async function editMessage({
  chatId,
  messageId,
  senderId,
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
      ? '📷 Sent an image'
      : hasAttachments
      ? `📎 ${newAttachments[0].name}`
      : 'Edited message');

  if (isFirebaseConfigured && db && !isLocalChatId(chatId)) {
    try {
      const msgRef = doc(db, 'chats', chatId, 'messages', messageId);
      const snap = await getDoc(msgRef);
      if (!snap.exists()) throw new Error('Message not found.');

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
      return;
    } catch {
      // Fallback to local
    }
  }

  const messages = localStore.getChatMessages(chatId);
  const idx = messages.findIndex((m) => m.id === messageId);
  if (idx === -1) throw new Error('Message not found.');

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

  const chats = localStore.getChats();
  const chatIdx = chats.findIndex((c) => c.id === chatId);
  if (chatIdx !== -1 && chats[chatIdx].lastMessage?.id === messageId) {
    chats[chatIdx].lastMessage = {
      ...chats[chatIdx].lastMessage,
      text: previewText,
      type: nextType,
    };
    localStore.saveChats(chats);
  }
}

/**
 * Deletes a message (text and/or image).
 */
export async function deleteMessage({ chatId, messageId }) {
  if (!chatId || !messageId) return;

  if (isFirebaseConfigured && db && !isLocalChatId(chatId)) {
    try {
      const msgRef = doc(db, 'chats', chatId, 'messages', messageId);
      const snap = await getDoc(msgRef);
      if (!snap.exists()) return;

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
      return;
    } catch {
      // Fallback to local
    }
  }

  const messages = localStore.getChatMessages(chatId);
  const idx = messages.findIndex((m) => m.id === messageId);
  if (idx === -1) return;

  messages[idx] = {
    ...messages[idx],
    text: 'This message was deleted',
    attachments: [],
    deleted: true,
    deletedAt: new Date().toISOString(),
  };
  localStore.saveChatMessages(chatId, messages);

  const chats = localStore.getChats();
  const chatIdx = chats.findIndex((c) => c.id === chatId);
  if (chatIdx !== -1 && chats[chatIdx].lastMessage?.id === messageId) {
    chats[chatIdx].lastMessage = {
      ...chats[chatIdx].lastMessage,
      text: '🚫 This message was deleted',
    };
    localStore.saveChats(chats);
  }
}

/**
 * Toggles an emoji reaction on a message.
 */
export async function toggleMessageReaction({ chatId, messageId, uid, emoji }) {
  if (!chatId || !messageId || !uid || !emoji) return;

  if (isFirebaseConfigured && db && !isLocalChatId(chatId)) {
    try {
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
      return;
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

  if (isFirebaseConfigured && db && !isLocalChatId(chatId)) {
    try {
      const msgRef = doc(db, 'chats', chatId, 'messages', messageId);
      const snap = await getDoc(msgRef);
      if (!snap.exists()) return;
      const starred = snap.data().starredBy || [];
      const isStarred = starred.includes(uid);
      await updateDoc(msgRef, {
        starredBy: isStarred ? arrayRemove(uid) : arrayUnion(uid),
      });
      return;
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
 * Marks all messages in a conversation as read by the user and clears their unread counter.
 */
export async function markChatAsRead(chatId, uid, sendReadReceipts = true) {
  if (!chatId || !uid) return;

  if (isFirebaseConfigured && db && !isLocalChatId(chatId)) {
    try {
      const chatRef = doc(db, 'chats', chatId);
      const chatSnap = await getDoc(chatRef);
      if (!chatSnap.exists()) return;

      const chatData = chatSnap.data();
      const currentUnread = chatData.unreadCount?.[uid] || 0;
      const lastReadBy = chatData.lastMessage?.readBy || [];

      const chatUpdates = {};
      if (currentUnread > 0) {
        chatUpdates[`unreadCount.${uid}`] = 0;
      }
      if (sendReadReceipts && chatData.lastMessage && !lastReadBy.includes(uid)) {
        chatUpdates['lastMessage.readBy'] = arrayUnion(uid);
      }

      if (Object.keys(chatUpdates).length > 0) {
        await updateDoc(chatRef, chatUpdates);
      }

      if (sendReadReceipts) {
        const msgsSnap = await getDocs(collection(db, 'chats', chatId, 'messages'));
        const batchPromises = [];
        msgsSnap.docs.forEach((d) => {
          const data = d.data();
          if (!(data.readBy || []).includes(uid)) {
            batchPromises.push(
              updateDoc(doc(db, 'chats', chatId, 'messages', d.id), {
                readBy: arrayUnion(uid),
              })
            );
          }
        });
        if (batchPromises.length > 0) {
          await Promise.all(batchPromises);
        }
      }
      return;
    } catch {
      // Fallback to local
    }
  }

  const chats = localStore.getChats();
  const chatIdx = chats.findIndex((c) => c.id === chatId);
  let chatsChanged = false;

  if (chatIdx !== -1) {
    const chat = chats[chatIdx];
    if ((chat.unreadCount?.[uid] || 0) > 0) {
      chat.unreadCount = { ...(chat.unreadCount || {}), [uid]: 0 };
      chatsChanged = true;
    }
    if (sendReadReceipts && chat.lastMessage) {
      const readSet = new Set(chat.lastMessage.readBy || []);
      if (!readSet.has(uid)) {
        readSet.add(uid);
        chat.lastMessage.readBy = Array.from(readSet);
        chatsChanged = true;
      }
    }
  }

  if (chatsChanged) {
    localStore.saveChats(chats);
  }

  if (sendReadReceipts) {
    const messages = localStore.getChatMessages(chatId);
    let msgsChanged = false;
    messages.forEach((m) => {
      const rSet = new Set(m.readBy || []);
      if (!rSet.has(uid)) {
        rSet.add(uid);
        m.readBy = Array.from(rSet);
        msgsChanged = true;
      }
    });
    if (msgsChanged) {
      localStore.saveChatMessages(chatId, messages);
    }
  }
}

/**
 * Sets or clears typing status for a user in a chat.
 */
export async function setTypingStatus(chatId, uid, isTyping) {
  if (!chatId || !uid) return;

  if (isFirebaseConfigured && db && !isLocalChatId(chatId)) {
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

  if (isFirebaseConfigured && db && !isLocalChatId(chatId)) {
    try {
      const chatRef = doc(db, 'chats', chatId);
      const snap = await getDoc(chatRef);
      if (!snap.exists()) return false;
      const list = snap.data()[field] || [];
      const has = list.includes(uid);
      await updateDoc(chatRef, {
        [field]: has ? arrayRemove(uid) : arrayUnion(uid),
      });
      return !has;
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

  if (isFirebaseConfigured && db && !isLocalChatId(chatId)) {
    try {
      const snap = await getDocs(collection(db, 'chats', chatId, 'messages'));
      await Promise.all(
        snap.docs.map((d) => deleteDoc(doc(db, 'chats', chatId, 'messages', d.id)))
      );
      await updateDoc(doc(db, 'chats', chatId), {
        lastMessage: null,
        updatedAt: serverTimestamp(),
      });
      return;
    } catch {
      // Fallback to local
    }
  }

  localStore.saveChatMessages(chatId, []);
  const chats = localStore.getChats();
  const idx = chats.findIndex((c) => c.id === chatId);
  if (idx !== -1) {
    chats[idx].lastMessage = null;
    localStore.saveChats(chats);
  }
}

/**
 * Deletes a conversation or removes user from group.
 */
export async function deleteOrLeaveChat(chatId, uid) {
  if (!chatId || !uid) return;

  if (isFirebaseConfigured && db && !isLocalChatId(chatId)) {
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
      return;
    } catch {
      // Fallback to local
    }
  }

  const chats = localStore.getChats();
  const idx = chats.findIndex((c) => c.id === chatId);
  if (idx === -1) return;

  if (chats[idx].type === 'group' && (chats[idx].participants || []).length > 2) {
    chats[idx].participants = chats[idx].participants.filter((id) => id !== uid);
    chats[idx].adminIds = (chats[idx].adminIds || []).filter((id) => id !== uid);
    localStore.saveChats(chats);
  } else {
    const filtered = chats.filter((c) => c.id !== chatId);
    localStore.saveChats(filtered);
  }
}
