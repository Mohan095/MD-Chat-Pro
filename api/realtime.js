// Vercel Serverless Real-Time State Synchronization Endpoint (/api/realtime)
let memoryStore = {
  users: [],
  chats: [],
  messages: {},
  friendRequests: [],
  updatedAt: Date.now(),
};

function mergeById(existingList = [], incomingList = [], keyField = 'id') {
  const map = new Map();
  existingList.forEach((item) => {
    if (item && item[keyField]) map.set(item[keyField], item);
  });
  incomingList.forEach((item) => {
    if (item && item[keyField]) {
      const prev = map.get(item[keyField]) || {};
      map.set(item[keyField], { ...prev, ...item });
    }
  });
  return Array.from(map.values());
}

export default function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method === 'GET') {
    return res.status(200).json(memoryStore);
  }

  if (req.method === 'POST') {
    try {
      const payload = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};

      if (Array.isArray(payload.users)) {
        memoryStore.users = mergeById(memoryStore.users, payload.users, 'uid');
      }
      if (payload.upsertUser && payload.upsertUser.uid) {
        memoryStore.users = mergeById(memoryStore.users, [payload.upsertUser], 'uid');
      }
      if (Array.isArray(payload.chats)) {
        memoryStore.chats = mergeById(memoryStore.chats, payload.chats, 'id');
      }
      if (payload.upsertChat && payload.upsertChat.id) {
        memoryStore.chats = mergeById(memoryStore.chats, [payload.upsertChat], 'id');
      }
      if (payload.deleteChatId) {
        memoryStore.chats = memoryStore.chats.filter((c) => c.id !== payload.deleteChatId);
        delete memoryStore.messages[payload.deleteChatId];
      }
      if (payload.clearChatId) {
        memoryStore.messages[payload.clearChatId] = [];
      }
      if (payload.chatMessages && payload.chatMessages.chatId) {
        const { chatId, messages } = payload.chatMessages;
        const existingMsgs = memoryStore.messages[chatId] || [];
        memoryStore.messages[chatId] = mergeById(existingMsgs, messages || [], 'id');
      }
      if (payload.allMessages && typeof payload.allMessages === 'object') {
        Object.entries(payload.allMessages).forEach(([cid, msgs]) => {
          const existingMsgs = memoryStore.messages[cid] || [];
          memoryStore.messages[cid] = mergeById(existingMsgs, msgs || [], 'id');
        });
      }
      if (Array.isArray(payload.friendRequests)) {
        memoryStore.friendRequests = mergeById(
          memoryStore.friendRequests,
          payload.friendRequests,
          'id'
        );
      }

      memoryStore.updatedAt = Date.now();
      return res.status(200).json(memoryStore);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
