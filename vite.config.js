import { defineConfig, transformWithEsbuild } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';
import mongoHandler from './api/mongo.js';

const DB_FILE = path.resolve(process.cwd(), '.realtime-db.json');

function loadRealtimeDb() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      return {
        users: Array.isArray(parsed.users) ? parsed.users : [],
        chats: Array.isArray(parsed.chats) ? parsed.chats : [],
        messages: parsed.messages && typeof parsed.messages === 'object' ? parsed.messages : {},
        friendRequests: Array.isArray(parsed.friendRequests) ? parsed.friendRequests : [],
        updatedAt: parsed.updatedAt || Date.now(),
      };
    }
  } catch {
    // Fallback to empty state
  }
  return {
    users: [],
    chats: [],
    messages: {},
    friendRequests: [],
    updatedAt: Date.now(),
  };
}

function saveRealtimeDb(data) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch {
    // Ignore write error
  }
}

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

function realtimeSyncPlugin() {
  return {
    name: 'md-chat-pro-realtime-sync',
    configureServer(server) {
      server.middlewares.use('/api/mongo', (req, res) => {
        mongoHandler(req, res);
      });

      server.middlewares.use('/api/realtime', (req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        if (req.method === 'OPTIONS') {
          res.statusCode = 204;
          res.end();
          return;
        }

        if (req.method === 'GET') {
          const db = loadRealtimeDb();
          res.statusCode = 200;
          res.end(JSON.stringify(db));
          return;
        }

        if (req.method === 'POST') {
          let body = '';
          req.on('data', (chunk) => {
            body += chunk;
          });
          req.on('end', () => {
            try {
              const payload = JSON.parse(body || '{}');
              const db = loadRealtimeDb();

              if (Array.isArray(payload.users)) {
                db.users = mergeById(db.users, payload.users, 'uid');
              }
              if (payload.upsertUser && payload.upsertUser.uid) {
                db.users = mergeById(db.users, [payload.upsertUser], 'uid');
              }
              if (Array.isArray(payload.chats)) {
                db.chats = mergeById(db.chats, payload.chats, 'id');
              }
              if (payload.upsertChat && payload.upsertChat.id) {
                db.chats = mergeById(db.chats, [payload.upsertChat], 'id');
              }
              if (payload.deleteChatId) {
                db.chats = db.chats.filter((c) => c.id !== payload.deleteChatId);
                delete db.messages[payload.deleteChatId];
              }
              if (payload.clearChatId) {
                db.messages[payload.clearChatId] = [];
              }
              if (payload.chatMessages && payload.chatMessages.chatId) {
                const { chatId, messages } = payload.chatMessages;
                const existingMsgs = db.messages[chatId] || [];
                db.messages[chatId] = mergeById(existingMsgs, messages || [], 'id');
              }
              if (payload. allMessages && typeof payload.allMessages === 'object') {
                Object.entries(payload.allMessages).forEach(([cid, msgs]) => {
                  const existingMsgs = db.messages[cid] || [];
                  db.messages[cid] = mergeById(existingMsgs, msgs || [], 'id');
                });
              }
              if (Array.isArray(payload.friendRequests)) {
                db.friendRequests = mergeById(db.friendRequests, payload.friendRequests, 'id');
              }

              db.updatedAt = Date.now();
              saveRealtimeDb(db);

              res.statusCode = 200;
              res.end(JSON.stringify(db));
            } catch (err) {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: err.message }));
            }
          });
          return;
        }

        res.statusCode = 405;
        res.end(JSON.stringify({ error: 'Method not allowed' }));
      });
    },
  };
}

export default defineConfig({
  plugins: [
    realtimeSyncPlugin(),
    {
      name: 'treat-js-files-as-jsx',
      async transform(code, id) {
        if (!id.match(/src\/.*\.js$/)) return null;
        return transformWithEsbuild(code, id, {
          loader: 'jsx',
          jsx: 'automatic',
        });
      },
    },
    react(),
  ],
  envPrefix: ['VITE_', 'REACT_APP_'],
  optimizeDeps: {
    force: true,
    esbuildOptions: {
      loader: {
        '.js': 'jsx',
      },
    },
  },
  server: {
    port: 3000,
    host: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'firebase-vendor': [
            'firebase/app',
            'firebase/auth',
          ],
          'icons-vendor': ['lucide-react'],
        },
      },
    },
  },
});
