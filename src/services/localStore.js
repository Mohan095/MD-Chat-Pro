/**
 * Real-Time Local Mirror Store (No NPC or Fake Seed Users).
 * Only stores real authenticated users, real chats, and real messages.
 */

const OLD_NPC_KEYS = [
  'mdchat_pro_users_v2',
  'mdchat_pro_session_v2',
  'mdchat_pro_chats_v2',
  'mdchat_pro_messages_v2',
  'mdchat_pro_friend_requests_v2',
];

const STORAGE_KEYS = {
  USERS: 'mdchat_real_users_v3',
  SESSION: 'mdchat_real_session_uid_v3',
  CHATS: 'mdchat_real_chats_v3',
  MESSAGES: 'mdchat_real_messages_v3',
  FRIEND_REQUESTS: 'mdchat_real_friend_requests_v3',
};

class LocalRealtimeStore {
  constructor() {
    this.listeners = new Set();
    this.channel = null;
    this.purgeLegacyNpcData();
    this.initBroadcastChannel();
  }

  purgeLegacyNpcData() {
    if (typeof window === 'undefined') return;
    try {
      OLD_NPC_KEYS.forEach((key) => localStorage.removeItem(key));
    } catch {
      // Ignore storage error
    }
  }

  initBroadcastChannel() {
    if (typeof window === 'undefined') return;
    if ('BroadcastChannel' in window) {
      this.channel = new BroadcastChannel('md_chat_pro_realtime_v3');
      this.channel.onmessage = () => {
        this.notifyListeners(false);
      };
    }
    window.addEventListener('storage', () => {
      this.notifyListeners(false);
    });
  }

  subscribe(callback) {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  notifyListeners(broadcast = false) {
    this.listeners.forEach((cb) => {
      try {
        cb();
      } catch (err) {
        console.error('[LocalRealtimeStore] Listener error:', err);
      }
    });
    if (broadcast && this.channel) {
      try {
        this.channel.postMessage({ type: 'SYNC', timestamp: Date.now() });
      } catch {
        // Ignore broadcast error
      }
    }
  }

  readJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  writeJson(key, value, broadcast = true) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      this.notifyListeners(broadcast);
    } catch (err) {
      console.error('[LocalRealtimeStore] Write error:', err);
    }
  }

  getSessionUid() {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(STORAGE_KEYS.SESSION) || null;
  }

  setSessionUid(uid) {
    if (typeof window === 'undefined') return;
    if (uid) {
      localStorage.setItem(STORAGE_KEYS.SESSION, uid);
    } else {
      localStorage.removeItem(STORAGE_KEYS.SESSION);
    }
    this.notifyListeners(true);
  }

  getUsers() {
    return this.readJson(STORAGE_KEYS.USERS, []);
  }

  saveUsers(users) {
    this.writeJson(STORAGE_KEYS.USERS, users);
  }

  upsertUser(userObj) {
    if (!userObj?.uid) return;
    const users = this.getUsers();
    const idx = users.findIndex((u) => u.uid === userObj.uid);
    if (idx !== -1) {
      users[idx] = { ...users[idx], ...userObj };
    } else {
      users.push(userObj);
    }
    this.saveUsers(users);
  }

  getChats() {
    return this.readJson(STORAGE_KEYS.CHATS, []);
  }

  saveChats(chats) {
    this.writeJson(STORAGE_KEYS.CHATS, chats);
  }

  getAllMessages() {
    return this.readJson(STORAGE_KEYS.MESSAGES, {});
  }

  getChatMessages(chatId) {
    const all = this.getAllMessages();
    return all[chatId] || [];
  }

  saveChatMessages(chatId, messages) {
    const all = this.getAllMessages();
    all[chatId] = messages;
    this.writeJson(STORAGE_KEYS.MESSAGES, all);
  }

  getFriendRequests() {
    return this.readJson(STORAGE_KEYS.FRIEND_REQUESTS, []);
  }

  saveFriendRequests(requests) {
    this.writeJson(STORAGE_KEYS.FRIEND_REQUESTS, requests);
  }
}

export const localStore = new LocalRealtimeStore();
