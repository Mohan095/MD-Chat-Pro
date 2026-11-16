/**
 * Local Real-Time Persistence & Multi-Tab Synchronization Engine.
 * Used automatically when Firebase environment variables (.env) are not yet configured,
 * ensuring MD Chat Pro is 100% functional out-of-the-box with cross-tab real-time sync.
 */

const STORAGE_KEYS = {
  USERS: 'mdchat_pro_users_v2',
  SESSION: 'mdchat_pro_session_v2',
  CHATS: 'mdchat_pro_chats_v2',
  MESSAGES: 'mdchat_pro_messages_v2',
  FRIEND_REQUESTS: 'mdchat_pro_friend_requests_v2',
};

const nowIso = (offsetMinutes = 0) =>
  new Date(Date.now() + offsetMinutes * 60 * 1000).toISOString();

const SEED_USERS = [
  {
    uid: 'user_alex_rivera',
    displayName: 'Alex Rivera',
    username: 'alexrivera',
    email: 'alex@mdchat.pro',
    passwordHash: 'demo123',
    photoURL: '',
    bio: 'Staff Full-Stack Engineer • Building scalable real-time distributed systems 🚀',
    statusText: '🟢 Available to chat',
    online: true,
    lastSeen: nowIso(-2),
    emailVerified: true,
    friends: ['user_sarah_chen', 'user_marcus_vance', 'user_elena_rostova', 'user_liam_patel'],
    blockedUsers: [],
    privacySettings: {
      showOnlineStatus: true,
      showLastSeen: true,
      showReadReceipts: true,
      allowFriendRequests: true,
    },
    notificationSettings: {
      desktopNotifications: true,
      soundEffects: true,
      messagePreview: true,
      groupNotifications: true,
    },
    createdAt: nowIso(-10080),
    updatedAt: nowIso(-2),
  },
  {
    uid: 'user_sarah_chen',
    displayName: 'Sarah Chen',
    username: 'sarahchen',
    email: 'sarah@mdchat.pro',
    passwordHash: 'demo123',
    photoURL: '',
    bio: 'Principal Product Designer • Obsessed with dark-mode UI, micro-interactions & design systems ✨',
    statusText: '💻 Focusing on code',
    online: true,
    lastSeen: nowIso(-1),
    emailVerified: true,
    friends: ['user_alex_rivera', 'user_marcus_vance', 'user_elena_rostova'],
    blockedUsers: [],
    privacySettings: {
      showOnlineStatus: true,
      showLastSeen: true,
      showReadReceipts: true,
      allowFriendRequests: true,
    },
    notificationSettings: {
      desktopNotifications: true,
      soundEffects: true,
      messagePreview: true,
      groupNotifications: true,
    },
    createdAt: nowIso(-8640),
    updatedAt: nowIso(-1),
  },
  {
    uid: 'user_marcus_vance',
    displayName: 'Marcus Vance',
    username: 'marcusvance',
    email: 'marcus@mdchat.pro',
    passwordHash: 'demo123',
    photoURL: '',
    bio: 'Cloud Security Architect • Firebase & Zero-Trust Infrastructure 🔒',
    statusText: '🚀 Shipping features',
    online: true,
    lastSeen: nowIso(-5),
    emailVerified: true,
    friends: ['user_alex_rivera', 'user_sarah_chen'],
    blockedUsers: [],
    privacySettings: {
      showOnlineStatus: true,
      showLastSeen: true,
      showReadReceipts: true,
      allowFriendRequests: true,
    },
    notificationSettings: {
      desktopNotifications: true,
      soundEffects: true,
      messagePreview: true,
      groupNotifications: true,
    },
    createdAt: nowIso(-7200),
    updatedAt: nowIso(-5),
  },
  {
    uid: 'user_elena_rostova',
    displayName: 'Elena Rostova',
    username: 'elenarostova',
    email: 'elena@mdchat.pro',
    passwordHash: 'demo123',
    photoURL: '',
    bio: 'AI Research Scientist & Open Source Contributor 🧠',
    statusText: '☕ Taking a coffee break',
    online: false,
    lastSeen: nowIso(-42),
    emailVerified: true,
    friends: ['user_alex_rivera', 'user_sarah_chen'],
    blockedUsers: [],
    privacySettings: {
      showOnlineStatus: true,
      showLastSeen: true,
      showReadReceipts: true,
      allowFriendRequests: true,
    },
    notificationSettings: {
      desktopNotifications: true,
      soundEffects: true,
      messagePreview: true,
      groupNotifications: true,
    },
    createdAt: nowIso(-5400),
    updatedAt: nowIso(-42),
  },
  {
    uid: 'user_liam_patel',
    displayName: 'Liam Patel',
    username: 'liampatel',
    email: 'liam@mdchat.pro',
    passwordHash: 'demo123',
    photoURL: '',
    bio: 'Frontend Performance Lead • React, WebSockets & WebGL ⚡',
    statusText: '🟢 Available to chat',
    online: true,
    lastSeen: nowIso(-3),
    emailVerified: true,
    friends: ['user_alex_rivera'],
    blockedUsers: [],
    privacySettings: {
      showOnlineStatus: true,
      showLastSeen: true,
      showReadReceipts: true,
      allowFriendRequests: true,
    },
    notificationSettings: {
      desktopNotifications: true,
      soundEffects: true,
      messagePreview: true,
      groupNotifications: true,
    },
    createdAt: nowIso(-4320),
    updatedAt: nowIso(-3),
  },
  {
    uid: 'user_nina_kapoor',
    displayName: 'Nina Kapoor',
    username: 'ninakapoor',
    email: 'nina@mdchat.pro',
    passwordHash: 'demo123',
    photoURL: '',
    bio: 'DevOps & SRE Lead • Vercel + Kubernetes enthusiast 🌐',
    statusText: '📅 In a meeting',
    online: true,
    lastSeen: nowIso(-4),
    emailVerified: true,
    friends: [],
    blockedUsers: [],
    privacySettings: {
      showOnlineStatus: true,
      showLastSeen: true,
      showReadReceipts: true,
      allowFriendRequests: true,
    },
    notificationSettings: {
      desktopNotifications: true,
      soundEffects: true,
      messagePreview: true,
      groupNotifications: true,
    },
    createdAt: nowIso(-2880),
    updatedAt: nowIso(-4),
  },
  {
    uid: 'user_david_kim',
    displayName: 'David Kim',
    username: 'davidkim',
    email: 'david@mdchat.pro',
    passwordHash: 'demo123',
    photoURL: '',
    bio: 'Mobile & Cross-Platform Developer 📱',
    statusText: '🟢 Available to chat',
    online: false,
    lastSeen: nowIso(-130),
    emailVerified: true,
    friends: [],
    blockedUsers: [],
    privacySettings: {
      showOnlineStatus: true,
      showLastSeen: true,
      showReadReceipts: true,
      allowFriendRequests: true,
    },
    notificationSettings: {
      desktopNotifications: true,
      soundEffects: true,
      messagePreview: true,
      groupNotifications: true,
    },
    createdAt: nowIso(-1440),
    updatedAt: nowIso(-130),
  },
];

const SEED_CHATS = [
  {
    id: 'chat_sarah_alex',
    type: 'direct',
    name: '',
    description: '',
    avatar: '',
    participants: ['user_alex_rivera', 'user_sarah_chen'],
    adminIds: [],
    createdBy: 'user_sarah_chen',
    pinnedBy: ['user_alex_rivera'],
    mutedBy: [],
    archivedBy: [],
    typing: {},
    unreadCount: {
      user_alex_rivera: 1,
      user_sarah_chen: 0,
    },
    lastMessage: {
      id: 'msg_sc_4',
      text: 'I just pushed the updated dark glassmorphism tokens and responsive layout specs! Let me know what you think 🎨✨',
      senderId: 'user_sarah_chen',
      senderName: 'Sarah Chen',
      type: 'text',
      createdAt: nowIso(-4),
      readBy: ['user_sarah_chen'],
    },
    createdAt: nowIso(-1440),
    updatedAt: nowIso(-4),
  },
  {
    id: 'chat_group_core_team',
    type: 'group',
    name: 'MD Chat Pro Core Team 🚀',
    description: 'Official engineering & design workspace for MD Chat Pro v2.0 release.',
    avatar: '',
    participants: [
      'user_alex_rivera',
      'user_sarah_chen',
      'user_marcus_vance',
      'user_elena_rostova',
      'user_liam_patel',
    ],
    adminIds: ['user_alex_rivera', 'user_sarah_chen'],
    createdBy: 'user_alex_rivera',
    pinnedBy: ['user_alex_rivera', 'user_sarah_chen'],
    mutedBy: [],
    archivedBy: [],
    typing: {},
    unreadCount: {
      user_alex_rivera: 0,
      user_sarah_chen: 0,
      user_marcus_vance: 0,
      user_elena_rostova: 1,
      user_liam_patel: 0,
    },
    lastMessage: {
      id: 'msg_grp_3',
      text: 'Firestore and Storage security rules are locked down and verified. Ready for the production Vercel deploy! 🔒✅',
      senderId: 'user_marcus_vance',
      senderName: 'Marcus Vance',
      type: 'text',
      createdAt: nowIso(-18),
      readBy: ['user_marcus_vance', 'user_alex_rivera', 'user_sarah_chen'],
    },
    createdAt: nowIso(-2880),
    updatedAt: nowIso(-18),
  },
  {
    id: 'chat_marcus_alex',
    type: 'direct',
    name: '',
    description: '',
    avatar: '',
    participants: ['user_alex_rivera', 'user_marcus_vance'],
    adminIds: [],
    createdBy: 'user_alex_rivera',
    pinnedBy: [],
    mutedBy: [],
    archivedBy: [],
    typing: {},
    unreadCount: {
      user_alex_rivera: 0,
      user_marcus_vance: 0,
    },
    lastMessage: {
      id: 'msg_mv_2',
      text: 'Checked the rate limiter and XSS sanitizer — both pass all edge cases.',
      senderId: 'user_marcus_vance',
      senderName: 'Marcus Vance',
      type: 'text',
      createdAt: nowIso(-65),
      readBy: ['user_marcus_vance', 'user_alex_rivera'],
    },
    createdAt: nowIso(-1200),
    updatedAt: nowIso(-65),
  },
  {
    id: 'chat_elena_alex',
    type: 'direct',
    name: '',
    description: '',
    avatar: '',
    participants: ['user_alex_rivera', 'user_elena_rostova'],
    adminIds: [],
    createdBy: 'user_elena_rostova',
    pinnedBy: [],
    mutedBy: [],
    archivedBy: [],
    typing: {},
    unreadCount: {
      user_alex_rivera: 0,
      user_elena_rostova: 0,
    },
    lastMessage: {
      id: 'msg_er_2',
      text: 'Talk soon! Ping me when the new markdown code blocks are live.',
      senderId: 'user_elena_rostova',
      senderName: 'Elena Rostova',
      type: 'text',
      createdAt: nowIso(-210),
      readBy: ['user_elena_rostova', 'user_alex_rivera'],
    },
    createdAt: nowIso(-1800),
    updatedAt: nowIso(-210),
  },
];

const SEED_MESSAGES = {
  chat_sarah_alex: [
    {
      id: 'msg_sc_1',
      chatId: 'chat_sarah_alex',
      senderId: 'user_sarah_chen',
      senderName: 'Sarah Chen',
      text: 'Hey Alex! Welcome back to **MD Chat Pro** 👋 Ready to review the new real-time messaging interface?',
      type: 'text',
      attachments: [],
      replyTo: null,
      reactions: { '🚀': ['user_alex_rivera'], '❤️': ['user_sarah_chen'] },
      readBy: ['user_sarah_chen', 'user_alex_rivera'],
      deliveredTo: ['user_sarah_chen', 'user_alex_rivera'],
      starredBy: ['user_alex_rivera'],
      edited: false,
      deleted: false,
      createdAt: nowIso(-35),
    },
    {
      id: 'msg_sc_2',
      chatId: 'chat_sarah_alex',
      senderId: 'user_alex_rivera',
      senderName: 'Alex Rivera',
      text: 'Absolutely! I love how crisp the dark theme and message bubbles look. Plus inline `code` and **markdown** formatting work seamlessly.',
      type: 'text',
      attachments: [],
      replyTo: {
        id: 'msg_sc_1',
        senderName: 'Sarah Chen',
        text: 'Hey Alex! Welcome back to MD Chat Pro 👋 Ready to review the new real-time messaging interface?',
      },
      reactions: { '🔥': ['user_sarah_chen'] },
      readBy: ['user_alex_rivera', 'user_sarah_chen'],
      deliveredTo: ['user_alex_rivera', 'user_sarah_chen'],
      starredBy: [],
      edited: false,
      deleted: false,
      createdAt: nowIso(-22),
    },
    {
      id: 'msg_sc_3',
      chatId: 'chat_sarah_alex',
      senderId: 'user_sarah_chen',
      senderName: 'Sarah Chen',
      text: 'Check out this architecture diagram preview for our real-time sync pipeline:',
      type: 'image',
      attachments: [
        {
          id: 'att_arch_svg',
          name: 'md-chat-architecture.svg',
          type: 'image/svg+xml',
          size: 4820,
          url: `data:image/svg+xml;utf8,${encodeURIComponent(
            `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="320" viewBox="0 0 640 320" fill="none">
              <rect width="640" height="320" rx="20" fill="#0f172a"/>
              <rect x="20" y="20" width="600" height="280" rx="14" stroke="#334155" stroke-width="1.5" fill="#1e293b" fill-opacity="0.45"/>
              <rect x="55" y="105" width="140" height="110" rx="14" fill="#4f46e5" fill-opacity="0.2" stroke="#6366f1" stroke-width="2"/>
              <text x="125" y="152" fill="#f8fafc" font-family="sans-serif" font-size="15" font-weight="bold" text-anchor="middle">React 18 UI</text>
              <text x="125" y="176" fill="#94a3b8" font-family="sans-serif" font-size="12" text-anchor="middle">MD Chat Pro Client</text>
              <rect x="250" y="105" width="140" height="110" rx="14" fill="#8b5cf6" fill-opacity="0.2" stroke="#a855f7" stroke-width="2"/>
              <text x="320" y="152" fill="#f8fafc" font-family="sans-serif" font-size="15" font-weight="bold" text-anchor="middle">Firebase SDK</text>
              <text x="320" y="176" fill="#94a3b8" font-family="sans-serif" font-size="12" text-anchor="middle">Auth • Firestore • RTDB</text>
              <rect x="445" y="105" width="140" height="110" rx="14" fill="#06b6d4" fill-opacity="0.2" stroke="#06b6d4" stroke-width="2"/>
              <text x="515" y="152" fill="#f8fafc" font-family="sans-serif" font-size="15" font-weight="bold" text-anchor="middle">Cloud Storage</text>
              <text x="515" y="176" fill="#94a3b8" font-family="sans-serif" font-size="12" text-anchor="middle">Media &amp; Files CDN</text>
              <path d="M195 160H250" stroke="#6366f1" stroke-width="3" stroke-dasharray="5 5"/>
              <path d="M390 160H445" stroke="#06b6d4" stroke-width="3" stroke-dasharray="5 5"/>
              <text x="320" y="58" fill="#e2e8f0" font-family="sans-serif" font-size="16" font-weight="bold" text-anchor="middle">MD Chat Pro — Real-Time Messaging Pipeline</text>
            </svg>`
          )}`,
        },
      ],
      replyTo: null,
      reactions: { '👍': ['user_alex_rivera'], '🎉': ['user_alex_rivera'] },
      readBy: ['user_sarah_chen', 'user_alex_rivera'],
      deliveredTo: ['user_sarah_chen', 'user_alex_rivera'],
      starredBy: [],
      edited: false,
      deleted: false,
      createdAt: nowIso(-10),
    },
    {
      id: 'msg_sc_4',
      chatId: 'chat_sarah_alex',
      senderId: 'user_sarah_chen',
      senderName: 'Sarah Chen',
      text: 'I just pushed the updated dark glassmorphism tokens and responsive layout specs! Let me know what you think 🎨✨',
      type: 'text',
      attachments: [],
      replyTo: null,
      reactions: {},
      readBy: ['user_sarah_chen'],
      deliveredTo: ['user_sarah_chen', 'user_alex_rivera'],
      starredBy: [],
      edited: false,
      deleted: false,
      createdAt: nowIso(-4),
    },
  ],
  chat_group_core_team: [
    {
      id: 'msg_grp_1',
      chatId: 'chat_group_core_team',
      senderId: 'user_alex_rivera',
      senderName: 'Alex Rivera',
      text: 'Team, let’s make sure all real-time features — typing indicators, read receipts, emoji reactions, replies, edits, and file uploads — are rock solid.',
      type: 'text',
      attachments: [],
      replyTo: null,
      reactions: { '💯': ['user_sarah_chen', 'user_marcus_vance', 'user_liam_patel'] },
      readBy: ['user_alex_rivera', 'user_sarah_chen', 'user_marcus_vance', 'user_liam_patel'],
      deliveredTo: ['user_alex_rivera', 'user_sarah_chen', 'user_marcus_vance', 'user_liam_patel'],
      starredBy: [],
      edited: false,
      deleted: false,
      createdAt: nowIso(-90),
    },
    {
      id: 'msg_grp_2',
      chatId: 'chat_group_core_team',
      senderId: 'user_liam_patel',
      senderName: 'Liam Patel',
      text: 'Responsive mobile navigation, message search, and customizable chat backgrounds are all tested across desktop, tablet, and mobile viewports!',
      type: 'text',
      attachments: [],
      replyTo: null,
      reactions: { '🚀': ['user_alex_rivera', 'user_sarah_chen'] },
      readBy: ['user_liam_patel', 'user_alex_rivera', 'user_sarah_chen', 'user_marcus_vance'],
      deliveredTo: ['user_liam_patel', 'user_alex_rivera', 'user_sarah_chen', 'user_marcus_vance'],
      starredBy: [],
      edited: false,
      deleted: false,
      createdAt: nowIso(-45),
    },
    {
      id: 'msg_grp_3',
      chatId: 'chat_group_core_team',
      senderId: 'user_marcus_vance',
      senderName: 'Marcus Vance',
      text: 'Firestore and Storage security rules are locked down and verified. Ready for the production Vercel deploy! 🔒✅',
      type: 'text',
      attachments: [],
      replyTo: null,
      reactions: { '🔥': ['user_alex_rivera', 'user_sarah_chen'] },
      readBy: ['user_marcus_vance', 'user_alex_rivera', 'user_sarah_chen'],
      deliveredTo: ['user_marcus_vance', 'user_alex_rivera', 'user_sarah_chen', 'user_liam_patel'],
      starredBy: ['user_alex_rivera'],
      edited: false,
      deleted: false,
      createdAt: nowIso(-18),
    },
  ],
  chat_marcus_alex: [
    {
      id: 'msg_mv_1',
      chatId: 'chat_marcus_alex',
      senderId: 'user_alex_rivera',
      senderName: 'Alex Rivera',
      text: 'Hey Marcus, did you finish auditing `firestore.rules` and `storage.rules`?',
      type: 'text',
      attachments: [],
      replyTo: null,
      reactions: {},
      readBy: ['user_alex_rivera', 'user_marcus_vance'],
      deliveredTo: ['user_alex_rivera', 'user_marcus_vance'],
      starredBy: [],
      edited: false,
      deleted: false,
      createdAt: nowIso(-80),
    },
    {
      id: 'msg_mv_2',
      chatId: 'chat_marcus_alex',
      senderId: 'user_marcus_vance',
      senderName: 'Marcus Vance',
      text: 'Checked the rate limiter and XSS sanitizer — both pass all edge cases.',
      type: 'text',
      attachments: [],
      replyTo: null,
      reactions: { '👍': ['user_alex_rivera'] },
      readBy: ['user_marcus_vance', 'user_alex_rivera'],
      deliveredTo: ['user_marcus_vance', 'user_alex_rivera'],
      starredBy: [],
      edited: false,
      deleted: false,
      createdAt: nowIso(-65),
    },
  ],
  chat_elena_alex: [
    {
      id: 'msg_er_1',
      chatId: 'chat_elena_alex',
      senderId: 'user_alex_rivera',
      senderName: 'Alex Rivera',
      text: 'Hi Elena! How is the latency benchmark looking?',
      type: 'text',
      attachments: [],
      replyTo: null,
      reactions: {},
      readBy: ['user_alex_rivera', 'user_elena_rostova'],
      deliveredTo: ['user_alex_rivera', 'user_elena_rostova'],
      starredBy: [],
      edited: false,
      deleted: false,
      createdAt: nowIso(-240),
    },
    {
      id: 'msg_er_2',
      chatId: 'chat_elena_alex',
      senderId: 'user_elena_rostova',
      senderName: 'Elena Rostova',
      text: 'Talk soon! Ping me when the new markdown code blocks are live.',
      type: 'text',
      attachments: [],
      replyTo: null,
      reactions: {},
      readBy: ['user_elena_rostova', 'user_alex_rivera'],
      deliveredTo: ['user_elena_rostova', 'user_alex_rivera'],
      starredBy: [],
      edited: false,
      deleted: false,
      createdAt: nowIso(-210),
    },
  ],
};

const SEED_FRIEND_REQUESTS = [
  {
    id: 'freq_nina_to_alex',
    fromUid: 'user_nina_kapoor',
    fromUser: {
      uid: 'user_nina_kapoor',
      displayName: 'Nina Kapoor',
      username: 'ninakapoor',
      email: 'nina@mdchat.pro',
      photoURL: '',
      bio: 'DevOps & SRE Lead • Vercel + Kubernetes enthusiast 🌐',
    },
    toUid: 'user_alex_rivera',
    toUser: {
      uid: 'user_alex_rivera',
      displayName: 'Alex Rivera',
      username: 'alexrivera',
      email: 'alex@mdchat.pro',
      photoURL: '',
    },
    status: 'pending',
    createdAt: nowIso(-25),
    updatedAt: nowIso(-25),
  },
];

class LocalRealtimeStore {
  constructor() {
    this.listeners = new Set();
    this.channel = null;
    this.ensureSeeded();
    this.initBroadcastChannel();
  }

  ensureSeeded() {
    try {
      if (!localStorage.getItem(STORAGE_KEYS.USERS)) {
        localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(SEED_USERS));
      }
      if (!localStorage.getItem(STORAGE_KEYS.CHATS)) {
        localStorage.setItem(STORAGE_KEYS.CHATS, JSON.stringify(SEED_CHATS));
      }
      if (!localStorage.getItem(STORAGE_KEYS.MESSAGES)) {
        localStorage.setItem(STORAGE_KEYS.MESSAGES, JSON.stringify(SEED_MESSAGES));
      }
      if (!localStorage.getItem(STORAGE_KEYS.FRIEND_REQUESTS)) {
        localStorage.setItem(
          STORAGE_KEYS.FRIEND_REQUESTS,
          JSON.stringify(SEED_FRIEND_REQUESTS)
        );
      }
    } catch (err) {
      console.error('[LocalRealtimeStore] Seed error:', err);
    }
  }

  initBroadcastChannel() {
    if (typeof window === 'undefined') return;
    if ('BroadcastChannel' in window) {
      this.channel = new BroadcastChannel('md_chat_pro_realtime_channel');
      this.channel.onmessage = () => {
        this.notifyListeners();
      };
    }
    window.addEventListener('storage', () => {
      this.notifyListeners();
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

  getUsers() {
    return this.readJson(STORAGE_KEYS.USERS, SEED_USERS);
  }

  saveUsers(users) {
    this.writeJson(STORAGE_KEYS.USERS, users);
  }

  getSessionUid() {
    return localStorage.getItem(STORAGE_KEYS.SESSION) || null;
  }

  setSessionUid(uid) {
    if (uid) {
      localStorage.setItem(STORAGE_KEYS.SESSION, uid);
    } else {
      localStorage.removeItem(STORAGE_KEYS.SESSION);
    }
    this.notifyListeners(true);
  }

  getChats() {
    return this.readJson(STORAGE_KEYS.CHATS, SEED_CHATS);
  }

  saveChats(chats) {
    this.writeJson(STORAGE_KEYS.CHATS, chats);
  }

  getAllMessages() {
    return this.readJson(STORAGE_KEYS.MESSAGES, SEED_MESSAGES);
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
    return this.readJson(STORAGE_KEYS.FRIEND_REQUESTS, SEED_FRIEND_REQUESTS);
  }

  saveFriendRequests(requests) {
    this.writeJson(STORAGE_KEYS.FRIEND_REQUESTS, requests);
  }
}

export const localStore = new LocalRealtimeStore();
