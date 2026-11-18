/**
 * Real-Time Local Mirror & Per-Tab Session Store for mdchatpro.
 * Automatically purges all legacy storage keys from old Firebase projects.
 */

const LEGACY_KEYS = [
  'mdchat_pro_users_v2',
  'mdchat_pro_session_v2',
  'mdchat_pro_chats_v2',
  'mdchat_pro_messages_v2',
  'mdchat_pro_friend_requests_v2',
  'mdchat_real_users_v3',
  'mdchat_real_session_uid_v3',
  'mdchat_real_chats_v3',
  'mdchat_real_messages_v3',
  'mdchat_real_friend_requests_v3',
  'mdchat_real_users_v4',
  'mdchat_tab_session_uid_v4',
  'mdchat_tab_logged_out_v4',
  'mdchat_last_session_uid_v4',
  'mdchat_real_chats_v4',
  'mdchat_real_messages_v4',
  'mdchat_real_friend_requests_v4',
];

const STORAGE_KEYS = {
  USERS: 'mdchatpro_v5_users',
  TAB_SESSION: 'mdchatpro_v5_tab_session_uid',
  TAB_LOGGED_OUT: 'mdchatpro_v5_tab_logged_out',
  LAST_SESSION: 'mdchatpro_v5_last_session_uid',
  CHATS: 'mdchatpro_v5_chats',
  MESSAGES: 'mdchatpro_v5_messages',
  FRIEND_REQUESTS: 'mdchatpro_v5_friend_requests',
};

class LocalRealtimeStore {
  constructor() {
    this.listeners = new Set();
    this.channel = null;
    this.purgeLegacyData();
    this.initBroadcastChannel();
  }

  purgeLegacyData() {
    if (typeof window === 'undefined') return;
    try {
      LEGACY_KEYS.forEach((key) => {
        localStorage.removeItem(key);
        sessionStorage.removeItem(key);
      });
    } catch {
      // Ignore storage error
    }
  }

  initBroadcastChannel() {
    if (typeof window === 'undefined') return;
    if ('BroadcastChannel' in window) {
      this.channel = new BroadcastChannel('mdchatpro_v5_realtime_channel');
      this.channel.onmessage = () => {
        this.notifyListeners(false);
      };
    }
    window.addEventListener('storage', (e) => {
      if (e.key === STORAGE_KEYS.LAST_SESSION) return;
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

  /**
   * Per-tab session UID isolation so Tab 1 (User 1) and Tab 2 (User 2) never overwrite each other.
   */
  getSessionUid() {
    if (typeof window === 'undefined') return null;
    try {
      if (sessionStorage.getItem(STORAGE_KEYS.TAB_LOGGED_OUT) === '1') {
        return null;
      }
      const tabUid = sessionStorage.getItem(STORAGE_KEYS.TAB_SESSION);
      if (tabUid) return tabUid;

      const lastUid = localStorage.getItem(STORAGE_KEYS.LAST_SESSION);
      if (lastUid) {
        sessionStorage.setItem(STORAGE_KEYS.TAB_SESSION, lastUid);
        return lastUid;
      }
    } catch {
      // Ignore storage error
    }
    return null;
  }

  setSessionUid(uid) {
    if (typeof window === 'undefined') return;
    try {
      if (uid) {
        sessionStorage.removeItem(STORAGE_KEYS.TAB_LOGGED_OUT);
        sessionStorage.setItem(STORAGE_KEYS.TAB_SESSION, uid);
        localStorage.setItem(STORAGE_KEYS.LAST_SESSION, uid);
      } else {
        sessionStorage.setItem(STORAGE_KEYS.TAB_LOGGED_OUT, '1');
        sessionStorage.removeItem(STORAGE_KEYS.TAB_SESSION);
        localStorage.removeItem(STORAGE_KEYS.LAST_SESSION);
      }
    } catch {
      // Ignore storage error
    }
    this.notifyListeners(false);
  }

  getUsers() {
    return this.readJson(STORAGE_KEYS.USERS, []);
  }

  saveUsers(users) {
    this.writeJson(STORAGE_KEYS.USERS, users, true);
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
    this.writeJson(STORAGE_KEYS.USERS, users, true);
  }

  getChats() {
    return this.readJson(STORAGE_KEYS.CHATS, []);
  }

  saveChats(chats) {
    this.writeJson(STORAGE_KEYS.CHATS, chats, true);
  }

  upsertChat(chatObj) {
    if (!chatObj?.id) return;
    const chats = this.getChats();
    const idx = chats.findIndex((c) => c.id === chatObj.id);
    if (idx !== -1) {
      chats[idx] = { ...chats[idx], ...chatObj };
    } else {
      chats.unshift(chatObj);
    }
    this.writeJson(STORAGE_KEYS.CHATS, chats, true);
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
    this.writeJson(STORAGE_KEYS.MESSAGES, all, true);
  }

  getFriendRequests() {
    return this.readJson(STORAGE_KEYS.FRIEND_REQUESTS, []);
  }

  saveFriendRequests(requests) {
    this.writeJson(STORAGE_KEYS.FRIEND_REQUESTS, requests, true);
  }
}

export const localStore = new LocalRealtimeStore();
