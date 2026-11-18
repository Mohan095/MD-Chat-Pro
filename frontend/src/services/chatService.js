import { localStore } from './localStore';
import { mongoGet, mongoPost, createMongoSubscription } from './mongoClient';
import { sanitizeText, messageRateLimiter } from '../utils/security';
import { toDate } from '../utils/formatters';

export function generateConversationId(uid1, uid2) {
  const a = String(uid1 || '').trim();
  const b = String(uid2 || '').trim();
  return [a, b].sort().join('_');
}

function getTimestampMs(obj) {
  if (!obj) return 0;
  if (typeof obj.createdAtMs === 'number') return obj.createdAtMs;
  if (typeof obj.updatedAtMs === 'number') return obj.updatedAtMs;
  const d = toDate(obj.createdAt || obj.updatedAt);
  return d ? d.getTime() : 0;
}

function sortAndDedupeChatsForUser(chatsList, uid) {
  const map = new Map();

  chatsList.forEach((chat) => {
    if (!chat?.id) return;
    if (!Array.isArray(chat.participants) || !chat.participants.includes(uid)) return;
    map.set(chat.id, chat);
  });

  return Array.from(map.values()).sort((a, b) => {
    const aPinned = (a.pinnedBy || []).includes(uid);
    const bPinned = (b.pinnedBy || []).includes(uid);
    if (aPinned && !bPinned) return -1;
    if (!aPinned && bPinned) return 1;
    const timeA = getTimestampMs(a.lastMessage || a);
    const timeB = getTimestampMs(b.lastMessage || b);
    return timeB - timeA;
  });
}

export function subscribeToUserChats(uid, callback) {
  if (!uid) return () => {};

  return createMongoSubscription({
    topic: `chats:${uid}`,
    intervalMs: 2000,
    fetcher: async () => {
      const res = await mongoGet('chats', { uid });
      return res.chats || [];
    },
    onData: (mongoChats) => {
      localStore.saveChats(mongoChats);
      callback(sortAndDedupeChatsForUser(mongoChats, uid));
    },
    onError: () => {
      const cached = localStore.getChats();
      if (cached.length > 0) {
        callback(sortAndDedupeChatsForUser(cached, uid));
      }
    },
  });
}

export function subscribeToChatMessages(chatId, callback) {
  if (!chatId) {
    callback([]);
    return () => {};
  }

  return createMongoSubscription({
    topic: `messages:${chatId}`,
    intervalMs: 1200,
    fetcher: async () => {
      const res = await mongoGet('messages', { chatId });
      return res.messages || [];
    },
    onData: (msgs) => {
      const map = new Map();
      msgs.forEach((m) => {
        if (m?.id) map.set(m.id, m);
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
    onError: () => {
      const cached = localStore.getChatMessages(chatId);
      if (cached.length > 0) callback(cached);
    },
  });
}

export async function getOrCreateDirectChat(currentUser, targetUser) {
  if (!currentUser?.uid || !targetUser?.uid) {
    throw new Error('Both participants are required to start a chat.');
  }

  const canonicalId = generateConversationId(currentUser.uid, targetUser.uid);

  try {
    const res = await mongoGet('chat', { chatId: canonicalId });
    if (res.chat) {
      localStore.upsertChat(res.chat);
      return res.chat;
    }
  } catch {
    // Proceed to create
  }

  const participants = [currentUser.uid, targetUser.uid].sort();
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();

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
    admins: [],
    createdBy: currentUser.uid,
    createdAt: nowIso,
    updatedAt: nowIso,
    updatedAtMs: nowMs,
    lastMessage: null,
    unreadCount: {
      [currentUser.uid]: 0,
      [targetUser.uid]: 0,
    },
    typing: {},
    pinnedBy: [],
    mutedBy: [],
    archivedBy: [],
  };

  localStore.upsertChat(newChatObj);
  await mongoPost(
    'upsertChat',
    { chat: newChatObj },
    [`chats:${currentUser.uid}`, `chats:${targetUser.uid}`]
  );

  return newChatObj;
}

export async function createGroupChat({
  name,
  description = '',
  avatar = '',
  creator,
  memberUids = [],
}) {
  if (!creator?.uid) throw new Error('Creator is required.');
  const cleanName = sanitizeText(name, 60);
  if (!cleanName) throw new Error('Group name is required.');

  const participants = Array.from(new Set([creator.uid, ...memberUids]));
  if (participants.length < 2) {
    throw new Error('Select at least 1 other user to create a group.');
  }

  const groupId = `grp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const unreadCount = {};
  participants.forEach((uid) => {
    unreadCount[uid] = 0;
  });

  const systemMsgId = `sys_${nowMs}`;
  const systemMessage = {
    id: systemMsgId,
    chatId: groupId,
    senderId: 'system',
    receiverId: 'group',
    participants,
    senderName: 'System',
    text: `${creator.displayName || 'Someone'} created the group "${cleanName}"`,
    type: 'system',
    status: 'read',
    attachments: [],
    reactions: {},
    readBy: participants,
    deliveredTo: participants,
    starredBy: [],
    edited: false,
    deleted: false,
    createdAt: nowIso,
    createdAtMs: nowMs,
  };

  const groupChat = {
    id: groupId,
    type: 'group',
    name: cleanName,
    description: sanitizeText(description, 200),
    avatar: avatar || '',
    participants,
    admins: [creator.uid],
    createdBy: creator.uid,
    createdAt: nowIso,
    updatedAt: nowIso,
    updatedAtMs: nowMs,
    lastMessage: {
      id: systemMsgId,
      text: systemMessage.text,
      senderId: 'system',
      senderName: 'System',
      type: 'system',
      status: 'read',
      createdAt: nowIso,
      createdAtMs: nowMs,
    },
    unreadCount,
    typing: {},
    pinnedBy: [],
    mutedBy: [],
    archivedBy: [],
  };

  localStore.upsertChat(groupChat);
  localStore.saveChatMessages(groupId, [systemMessage]);

  await mongoPost(
    'sendMessage',
    {
      message: systemMessage,
      chatUpdate: groupChat,
    },
    participants.map((u) => `chats:${u}`)
  );

  return groupChat;
}

export async function updateGroupDetails(chatId, updates) {
  const cleanUpdates = { ...updates };
  if (typeof cleanUpdates.name === 'string') {
    cleanUpdates.name = sanitizeText(cleanUpdates.name, 60);
  }
  if (typeof cleanUpdates.description === 'string') {
    cleanUpdates.description = sanitizeText(cleanUpdates.description, 200);
  }
  await mongoPost('updateGroupDetails', { chatId, updates: cleanUpdates }, ['chats:']);
}

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

  let participants =
    Array.isArray(existingChat?.participants) && existingChat.participants.length >= 2
      ? [...existingChat.participants]
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
    (existingChat?.type === 'group'
      ? 'group'
      : participants.find((id) => id !== sender.uid) || sender.uid);

  const messageId = `msg_${nowMs}_${Math.random().toString(36).slice(2, 8)}`;

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
    status: 'sent',
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

  const existingLocalMsgs = localStore.getChatMessages(chatId);
  localStore.saveChatMessages(chatId, [...existingLocalMsgs, messagePayload]);

  if (onOptimistic) {
    onOptimistic(messagePayload, lastMessageObj);
  }

  await mongoPost(
    'sendMessage',
    {
      message: messagePayload,
      chatUpdate: {
        id: chatId,
        type: existingChat?.type || 'direct',
        participants,
        lastMessage: lastMessageObj,
        updatedAtMs: nowMs,
        updatedAt: nowIso,
      },
    },
    [`messages:${chatId}`, ...participants.map((u) => `chats:${u}`)]
  );

  return messagePayload;
}

export async function markChatAsDelivered(chatId, uid) {
  if (!chatId || !uid) return;
  try {
    await mongoPost('markDelivered', { chatId, uid });
  } catch {
    // Ignore errors
  }
}

export async function markChatAsRead(chatId, uid, sendReadReceipt = true) {
  if (!chatId || !uid) return;
  try {
    await mongoPost('markRead', { chatId, uid, sendReadReceipt }, [
      `messages:${chatId}`,
      `chats:${uid}`,
    ]);
  } catch {
    // Ignore errors
  }
}

export async function editMessage({
  chatId,
  messageId,
  newText,
  newAttachments = [],
}) {
  if (!chatId || !messageId) return;
  const cleanText = sanitizeText(newText, 4000);
  if (!cleanText && (!newAttachments || newAttachments.length === 0)) {
    throw new Error('Message cannot be empty.');
  }

  await mongoPost(
    'editMessage',
    { chatId, messageId, newText: cleanText, newAttachments },
    [`messages:${chatId}`, 'chats:']
  );
}

export async function deleteMessage({ chatId, messageId }) {
  if (!chatId || !messageId) return;
  await mongoPost('deleteMessage', { chatId, messageId }, [
    `messages:${chatId}`,
    'chats:',
  ]);
}

export async function toggleMessageReaction({ chatId, messageId, emoji, uid }) {
  if (!chatId || !messageId || !emoji || !uid) return;
  await mongoPost('toggleReaction', { chatId, messageId, emoji, uid }, [
    `messages:${chatId}`,
  ]);
}

export async function toggleStarMessage({ chatId, messageId, uid }) {
  if (!chatId || !messageId || !uid) return;
  await mongoPost('toggleStar', { chatId, messageId, uid }, [
    `messages:${chatId}`,
  ]);
}

export async function setTypingStatus(chatId, uid, isTyping) {
  if (!chatId || !uid) return;
  try {
    await mongoPost('setTyping', { chatId, uid, isTyping });
  } catch {
    // Ignore transient typing errors
  }
}

export async function toggleChatFlag(chatId, field, uid, currentArray = []) {
  if (!chatId || !field || !uid) return;
  const exists = currentArray.includes(uid);
  await mongoPost(
    'toggleChatFlag',
    { chatId, field, uid, add: !exists },
    [`chats:${uid}`]
  );
}

export async function clearChatMessages(chatId) {
  if (!chatId) return;
  localStore.saveChatMessages(chatId, []);
  await mongoPost('clearChatMessages', { chatId }, [
    `messages:${chatId}`,
    'chats:',
  ]);
}

export async function deleteOrLeaveChat(chatId, uid) {
  if (!chatId || !uid) return;
  await mongoPost('deleteOrLeaveChat', { chatId, uid }, [
    `chats:${uid}`,
    `messages:${chatId}`,
  ]);
}
