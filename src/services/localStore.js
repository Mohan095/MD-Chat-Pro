/**
 * Real-Time Multi-Tab & Cross-Browser / Mobile-to-Desktop Synchronization Store.
 * - Uses per-tab sessionStorage for active user session so User 1 (Tab 1) and User 2 (Tab 2)
 *   can stay signed in simultaneously without overwriting each other.
 * - Syncs state via BroadcastChannel + localStorage (0ms same-browser) AND /api/realtime
 *   (cross-browser, Incognito, Android, iPhone, Tablet & Desktop).
 */

const OLD_NPC_KEYS = [
  'mdchat_pro_users_v2',
  'mdchat_pro_session_v2',
  'mdchat_pro_chats_v2',
  'mdchat_pro_messages_v2',
  'mdchat_pro_friend_requests_v2',
];

const STORAGE_KEYS = {
  USERS: 'mdchat_real_users_v4',
  TAB_SESSION: 'mdchat_tab_session_uid_v4',
  TAB_LOGGED_OUT: 'mdchat_tab_logged_out_v4',
  LAST_SESSION: 'mdchat_last_session_uid_v4',
  CHATS: 'mdchat_real_chats_v4',
  MESSAGES: 'mdchat_real_messages_v4',
  FRIEND_REQUESTS: 'mdchat_real_friend_requests_v4',
};

function mergeArrayByKey(existing = [], incoming = [], keyField = 'id') {
  const map = new Map();
  existing.forEach((item) => {
    if (item && item[keyField]) map.set(item[keyField], item);
  });
  incoming.forEach((item) => {
    if (item && item[keyField]) {
      const prev = map.get(item[keyField]) || {};
      map.set(item[keyField], { ...prev, ...item });
    }
  });
  return Array.from(map.values());
}

class LocalRealtimeStore {
  constructor() {
    this.listeners = new Set();
    this.channel = null;
    this.lastServerUpdatedAt = 0;
    this.isSyncingFromServer = false;
    this.purgeLegacyNpcData();
    this.initBroadcastChannel();
    this.initServerSyncLoop();
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
      this.channel = new BroadcastChannel('md_chat_pro_realtime_v4');
      this.channel.onmessage = () => {
        this.notifyListeners(false);
      };
    }
    window.addEventListener('storage', (e) => {
      // Ignore LAST_SESSION changes from other tabs so each tab keeps its own logged-in user!
      if (e.key === STORAGE_KEYS.LAST_SESSION) return;
      this.notifyListeners(false);
    });
  }

  initServerSyncLoop() {
    if (typeof window === 'undefined' || typeof fetch === 'undefined') return;

    // Initial pull + push of any local data
    this.syncWithServer();

    // Poll every 750ms for cross-browser / Incognito / Mobile-to-Desktop real-time sync
    setInterval(() => {
      this.pullFromServer();
    }, 750);
  }

  async syncWithServer() {
    if (typeof window === 'undefined' || typeof fetch === 'undefined') return;
    try {
      const localUsers = this.getUsers();
      const localChats = this.getChats();
      const localMessages = this.getAllMessages();
      const localReqs = this.getFriendRequests();

      const res = await fetch('/api/realtime', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          users: localUsers,
          chats: localChats,
          allMessages: localMessages,
          friendRequests: localReqs,
        }),
      });
      if (!res.ok) return;
      const serverData = await res.json();
      this.applyServerSnapshot(serverData);
    } catch {
      // Offline or static host without /api/realtime
    }
  }

  async pullFromServer() {
    if (typeof window === 'undefined' || typeof fetch === 'undefined') return;
    if (this.isSyncingFromServer) return;
    try {
      this.isSyncingFromServer = true;
      const res = await fetch('/api/realtime', {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) return;
      const serverData = await res.json();
      if (serverData && serverData.updatedAt && serverData.updatedAt !== this.lastServerUpdatedAt) {
        this.lastServerUpdatedAt = serverData.updatedAt;
        this.applyServerSnapshot(serverData);
      }
    } catch {
      // Ignore network poll error
    } finally {
      this.isSyncingFromServer = false;
    }
  }

  async pushToServer(partialPayload) {
    if (typeof window === 'undefined' || typeof fetch === 'undefined') return;
    try {
      const res = await fetch('/api/realtime', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(partialPayload),
      });
      if (!res.ok) return;
      const serverData = await res.json();
      if (serverData && serverData.updatedAt) {
        this.lastServerUpdatedAt = serverData.updatedAt;
        this.applyServerSnapshot(serverData);
      }
    } catch {
      // Ignore push error
    }
  }

  applyServerSnapshot(serverData) {
    if (!serverData || typeof window === 'undefined') return;
    let changed = false;

    if (Array.isArray(serverData.users)) {
      const currentUsers = this.getUsers();
      const mergedUsers = mergeArrayByKey(currentUsers, serverData.users, 'uid');
      if (JSON.stringify(mergedUsers) !== JSON.stringify(currentUsers)) {
        localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(mergedUsers));
        changed = true;
      }
    }

    if (Array.isArray(serverData.chats)) {
      const currentChats = this.getChats();
      const mergedChats = mergeArrayByKey(currentChats, serverData.chats, 'id');
      if (JSON.stringify(mergedChats) !== JSON.stringify(currentChats)) {
        localStorage.setItem(STORAGE_KEYS.CHATS, JSON.stringify(mergedChats));
        changed = true;
      }
    }

    if (serverData.messages && typeof serverData.messages === 'object') {
      const currentAllMsgs = this.getAllMessages();
      const nextAllMsgs = { ...currentAllMsgs };
      let msgsChanged = false;

      Object.entries(serverData.messages).forEach(([chatId, srvMsgs]) => {
        if (!Array.isArray(srvMsgs)) return;
        const localChatMsgs = nextAllMsgs[chatId] || [];
        const mergedMsgs = mergeArrayByKey(localChatMsgs, srvMsgs, 'id');
        if (JSON.stringify(mergedMsgs) !== JSON.stringify(localChatMsgs)) {
          nextAllMsgs[chatId] = mergedMsgs;
          msgsChanged = true;
        }
      });

      if (msgsChanged) {
        localStorage.setItem(STORAGE_KEYS.MESSAGES, JSON.stringify(nextAllMsgs));
        changed = true;
      }
    }

    if (Array.isArray(serverData.friendRequests)) {
      const currentReqs = this.getFriendRequests();
      const mergedReqs = mergeArrayByKey(currentReqs, serverData.friendRequests, 'id');
      if (JSON.stringify(mergedReqs) !== JSON.stringify(currentReqs)) {
        localStorage.setItem(STORAGE_KEYS.FRIEND_REQUESTS, JSON.stringify(mergedReqs));
        changed = true;
      }
    }

    if (changed) {
      this.notifyListeners(false);
    }
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
   * Per-tab session UID isolation so Tab 1 (User 1) and Tab 2 (User 2) never collide!
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
      // Ignore storage access error
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
    // Notify ONLY this tab's listeners (do not broadcast session changes to other tabs!)
    this.notifyListeners(false);
  }

  getUsers() {
    return this.readJson(STORAGE_KEYS.USERS, []);
  }

  saveUsers(users) {
    this.writeJson(STORAGE_KEYS.USERS, users, true);
    this.pushToServer({ users });
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
    this.pushToServer({ upsertUser: userObj });
  }

  getChats() {
    return this.readJson(STORAGE_KEYS.CHATS, []);
  }

  saveChats(chats) {
    this.writeJson(STORAGE_KEYS.CHATS, chats, true);
    this.pushToServer({ chats });
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
    this.pushToServer({ upsertChat: chatObj });
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
    this.pushToServer({ chatMessages: { chatId, messages } });
  }

  getFriendRequests() {
    return this.readJson(STORAGE_KEYS.FRIEND_REQUESTS, []);
  }

  saveFriendRequests(requests) {
    this.writeJson(STORAGE_KEYS.FRIEND_REQUESTS, requests, true);
    this.pushToServer({ friendRequests: requests });
  }
}

export const localStore = new LocalRealtimeStore();
