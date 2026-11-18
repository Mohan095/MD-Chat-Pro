import 'dotenv/config';
import { MongoClient } from 'mongodb';

const DEFAULT_URI =
  'mongodb://mohantn617mca28_db_user:<db_password>@ac-exg6ui3-shard-00-00.uajeuti.mongodb.net:27017,ac-exg6ui3-shard-00-01.uajeuti.mongodb.net:27017,ac-exg6ui3-shard-00-02.uajeuti.mongodb.net:27017/?ssl=true&replicaSet=atlas-8ssukk-shard-0&authSource=admin';

let cachedClient = null;
let connectPromise = null;
let indexesEnsured = false;

export async function connectToMongoDB() {
  const uri = process.env.MONGODB_URI || DEFAULT_URI;
  if (!uri || uri.includes('<db_username>') || uri.includes('<db_password>')) {
    throw new Error(
      'MONGODB_URI is not configured. Replace <db_password> in .env with your MongoDB password.'
    );
  }
  if (!cachedClient) {
    cachedClient = new MongoClient(uri);
  }
  if (!connectPromise) {
    connectPromise = cachedClient
      .connect()
      .then(() => cachedClient)
      .catch((err) => {
        connectPromise = null;
        throw err;
      });
  }
  return connectPromise;
}

export async function disconnectFromMongoDB() {
  connectPromise = null;
  indexesEnsured = false;
  if (cachedClient) {
    await cachedClient.close();
    cachedClient = null;
  }
}

async function getDb() {
  const dbName = process.env.MONGODB_DB || 'md_chat_pro';
  await connectToMongoDB();
  const db = cachedClient.db(dbName);

  if (!indexesEnsured) {
    indexesEnsured = true;
    Promise.all([
      db.collection('users').createIndex({ uid: 1 }, { unique: true }),
      db.collection('chats').createIndex({ id: 1 }, { unique: true }),
      db.collection('chats').createIndex({ participants: 1 }),
      db.collection('messages').createIndex({ id: 1 }, { unique: true }),
      db.collection('messages').createIndex({ chatId: 1, createdAtMs: 1 }),
      db.collection('friendRequests').createIndex({ id: 1 }, { unique: true }),
      db.collection('calls').createIndex({ id: 1 }, { unique: true }),
      db.collection('calls').createIndex({ calleeUid: 1, status: 1 }),
    ]).catch(() => {});
  }

  return db;
}

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.end(JSON.stringify(payload));
}

async function readRequestBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function stripMongoId(doc) {
  if (!doc) return doc;
  const { _id, ...rest } = doc;
  return rest;
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    return sendJson(res, 204, {});
  }

  try {
    const urlObj = new URL(req.url || '/api/mongo', 'http://localhost');
    const queryParams = req.query || Object.fromEntries(urlObj.searchParams.entries());

    if (req.method === 'GET') {
      const action = queryParams.action || 'health';
      const db = await getDb();

      if (action === 'health') {
        await db.command({ ping: 1 });
        return sendJson(res, 200, { ok: true, database: db.databaseName });
      }

      if (action === 'users') {
        const users = await db
          .collection('users')
          .find({}, { projection: { _id: 0, passwordHash: 0 } })
          .toArray();
        return sendJson(res, 200, { users });
      }

      if (action === 'user') {
        const { uid, email } = queryParams;
        const filter = uid
          ? { uid }
          : email
          ? { email: String(email).toLowerCase().trim() }
          : null;
        if (!filter) return sendJson(res, 400, { error: 'uid or email is required.' });
        const user = await db
          .collection('users')
          .findOne(filter, { projection: { _id: 0, passwordHash: 0 } });
        return sendJson(res, 200, { user: user || null });
      }

      if (action === 'chats') {
        const { uid } = queryParams;
        if (!uid) return sendJson(res, 400, { error: 'uid is required.' });
        const chats = await db
          .collection('chats')
          .find({ participants: uid }, { projection: { _id: 0 } })
          .toArray();
        return sendJson(res, 200, { chats });
      }

      if (action === 'chat') {
        const { chatId } = queryParams;
        if (!chatId) return sendJson(res, 400, { error: 'chatId is required.' });
        const chat = await db
          .collection('chats')
          .findOne({ id: chatId }, { projection: { _id: 0 } });
        return sendJson(res, 200, { chat: chat || null });
      }

      if (action === 'messages') {
        const { chatId } = queryParams;
        if (!chatId) return sendJson(res, 400, { error: 'chatId is required.' });
        const messages = await db
          .collection('messages')
          .find({ chatId }, { projection: { _id: 0 } })
          .sort({ createdAtMs: 1, id: 1 })
          .toArray();
        return sendJson(res, 200, { messages });
      }

      if (action === 'friendRequests') {
        const { uid } = queryParams;
        if (!uid) return sendJson(res, 400, { error: 'uid is required.' });
        const requests = await db
          .collection('friendRequests')
          .find(
            { $or: [{ toUid: uid }, { fromUid: uid }] },
            { projection: { _id: 0 } }
          )
          .toArray();
        return sendJson(res, 200, { requests });
      }

      if (action === 'incomingCall') {
        const { uid } = queryParams;
        if (!uid) return sendJson(res, 400, { error: 'uid is required.' });
        const minCreatedAt = Date.now() - 90000;
        const call = await db.collection('calls').findOne(
          {
            calleeUid: uid,
            status: 'ringing',
            createdAtMs: { $gte: minCreatedAt },
          },
          { projection: { _id: 0 }, sort: { createdAtMs: -1 } }
        );
        return sendJson(res, 200, { call: call || null });
      }

      if (action === 'call') {
        const { callId } = queryParams;
        if (!callId) return sendJson(res, 400, { error: 'callId is required.' });
        const call = await db
          .collection('calls')
          .findOne({ id: callId }, { projection: { _id: 0 } });
        return sendJson(res, 200, { call: call || null });
      }

      return sendJson(res, 400, { error: `Unknown GET action: ${action}` });
    }

    if (req.method === 'POST') {
      const body = await readRequestBody(req);
      const { action } = body;
      const db = await getDb();

      // ---- USERS ----
      if (action === 'upsertUser') {
        const { user } = body;
        if (!user?.uid) return sendJson(res, 400, { error: 'user.uid is required.' });
        const cleanUser = stripMongoId(user);
        await db.collection('users').updateOne(
          { uid: cleanUser.uid },
          { $set: { ...cleanUser, updatedAt: new Date().toISOString() } },
          { upsert: true }
        );
        const saved = await db
          .collection('users')
          .findOne({ uid: cleanUser.uid }, { projection: { _id: 0, passwordHash: 0 } });
        return sendJson(res, 200, { user: saved });
      }

      if (action === 'updateUser') {
        const { uid, updates } = body;
        if (!uid || !updates) return sendJson(res, 400, { error: 'uid and updates required.' });
        const cleanUpdates = stripMongoId(updates);
        await db.collection('users').updateOne(
          { uid },
          { $set: { ...cleanUpdates, updatedAt: new Date().toISOString() } },
          { upsert: true }
        );
        const saved = await db
          .collection('users')
          .findOne({ uid }, { projection: { _id: 0, passwordHash: 0 } });
        return sendJson(res, 200, { user: saved });
      }

      if (action === 'blockUser') {
        const { currentUid, targetUid } = body;
        await db.collection('users').updateOne(
          { uid: currentUid },
          {
            $addToSet: { blockedUsers: targetUid },
            $set: { updatedAt: new Date().toISOString() },
          }
        );
        return sendJson(res, 200, { ok: true });
      }

      if (action === 'unblockUser') {
        const { currentUid, targetUid } = body;
        await db.collection('users').updateOne(
          { uid: currentUid },
          {
            $pull: { blockedUsers: targetUid },
            $set: { updatedAt: new Date().toISOString() },
          }
        );
        return sendJson(res, 200, { ok: true });
      }

      if (action === 'setPresence') {
        const { uid, online } = body;
        if (!uid) return sendJson(res, 400, { error: 'uid is required.' });
        await db.collection('users').updateOne(
          { uid },
          {
            $set: {
              online: Boolean(online),
              lastSeen: new Date().toISOString(),
            },
          }
        );
        return sendJson(res, 200, { ok: true });
      }

      // ---- CHATS ----
      if (action === 'upsertChat') {
        const { chat } = body;
        if (!chat?.id) return sendJson(res, 400, { error: 'chat.id is required.' });
        const cleanChat = stripMongoId(chat);
        await db.collection('chats').updateOne(
          { id: cleanChat.id },
          { $set: cleanChat },
          { upsert: true }
        );
        const saved = await db
          .collection('chats')
          .findOne({ id: cleanChat.id }, { projection: { _id: 0 } });
        return sendJson(res, 200, { chat: saved });
      }

      if (action === 'updateGroupDetails') {
        const { chatId, updates } = body;
        await db.collection('chats').updateOne(
          { id: chatId },
          { $set: { ...stripMongoId(updates), updatedAtMs: Date.now(), updatedAt: new Date().toISOString() } }
        );
        return sendJson(res, 200, { ok: true });
      }

      if (action === 'toggleChatFlag') {
        const { chatId, field, uid, add } = body;
        const allowedFields = ['pinnedBy', 'mutedBy', 'archivedBy'];
        if (!allowedFields.includes(field)) {
          return sendJson(res, 400, { error: 'Invalid flag field.' });
        }
        await db.collection('chats').updateOne(
          { id: chatId },
          add ? { $addToSet: { [field]: uid } } : { $pull: { [field]: uid } }
        );
        return sendJson(res, 200, { ok: true });
      }

      if (action === 'setTyping') {
        const { chatId, uid, isTyping } = body;
        if (!chatId || !uid) return sendJson(res, 400, { error: 'chatId and uid required.' });
        await db.collection('chats').updateOne(
          { id: chatId },
          isTyping
            ? { $set: { [`typing.${uid}`]: Date.now() } }
            : { $unset: { [`typing.${uid}`]: '' } }
        );
        return sendJson(res, 200, { ok: true });
      }

      if (action === 'clearChatMessages') {
        const { chatId } = body;
        await db.collection('messages').deleteMany({ chatId });
        await db.collection('chats').updateOne(
          { id: chatId },
          { $set: { lastMessage: null, updatedAtMs: Date.now() } }
        );
        return sendJson(res, 200, { ok: true });
      }

      if (action === 'deleteOrLeaveChat') {
        const { chatId, uid } = body;
        const chat = await db.collection('chats').findOne({ id: chatId });
        if (!chat) return sendJson(res, 200, { ok: true });

        if (chat.type === 'group') {
          const remaining = (chat.participants || []).filter((id) => id !== uid);
          if (remaining.length === 0) {
            await db.collection('messages').deleteMany({ chatId });
            await db.collection('chats').deleteOne({ id: chatId });
          } else {
            await db.collection('chats').updateOne(
              { id: chatId },
              {
                $pull: { participants: uid, admins: uid },
                $set: { updatedAtMs: Date.now() },
              }
            );
          }
        } else {
          await db.collection('messages').deleteMany({ chatId });
          await db.collection('chats').deleteOne({ id: chatId });
        }
        return sendJson(res, 200, { ok: true });
      }

      // ---- MESSAGES ----
      if (action === 'sendMessage') {
        const { message, chatUpdate } = body;
        if (!message?.id || !message?.chatId) {
          return sendJson(res, 400, { error: 'message.id and message.chatId required.' });
        }
        await db.collection('messages').updateOne(
          { id: message.id },
          { $set: stripMongoId(message) },
          { upsert: true }
        );
        if (chatUpdate?.id) {
          const existingChat = await db.collection('chats').findOne({ id: chatUpdate.id });
          const baseUnread = existingChat?.unreadCount || {};
          const updatedUnread = { ...baseUnread };
          (chatUpdate.participants || []).forEach((uid) => {
            if (uid !== message.senderId) {
              updatedUnread[uid] = (Number(updatedUnread[uid]) || 0) + 1;
            } else {
              updatedUnread[uid] = 0;
            }
          });
          await db.collection('chats').updateOne(
            { id: chatUpdate.id },
            {
              $set: {
                ...stripMongoId(chatUpdate),
                unreadCount: updatedUnread,
              },
              $unset: { [`typing.${message.senderId}`]: '' },
            },
            { upsert: true }
          );
        }
        return sendJson(res, 200, { ok: true, message });
      }

      if (action === 'editMessage') {
        const { chatId, messageId, newText, newAttachments } = body;
        const nowIso = new Date().toISOString();
        await db.collection('messages').updateOne(
          { id: messageId, chatId },
          {
            $set: {
              text: newText,
              attachments: newAttachments || [],
              edited: true,
              editedAt: nowIso,
            },
          }
        );
        return sendJson(res, 200, { ok: true });
      }

      if (action === 'deleteMessage') {
        const { chatId, messageId } = body;
        await db.collection('messages').updateOne(
          { id: messageId, chatId },
          {
            $set: {
              text: 'This message was deleted',
              attachments: [],
              deleted: true,
              deletedAt: new Date().toISOString(),
            },
          }
        );
        return sendJson(res, 200, { ok: true });
      }

      if (action === 'toggleReaction') {
        const { chatId, messageId, emoji, uid } = body;
        const msg = await db.collection('messages').findOne({ id: messageId, chatId });
        if (!msg) return sendJson(res, 404, { error: 'Message not found.' });
        const reactions = { ...(msg.reactions || {}) };
        const currentList = Array.isArray(reactions[emoji]) ? [...reactions[emoji]] : [];
        if (currentList.includes(uid)) {
          reactions[emoji] = currentList.filter((id) => id !== uid);
          if (reactions[emoji].length === 0) delete reactions[emoji];
        } else {
          reactions[emoji] = [...currentList, uid];
        }
        await db.collection('messages').updateOne(
          { id: messageId, chatId },
          { $set: { reactions } }
        );
        return sendJson(res, 200, { ok: true, reactions });
      }

      if (action === 'toggleStar') {
        const { chatId, messageId, uid } = body;
        const msg = await db.collection('messages').findOne({ id: messageId, chatId });
        if (!msg) return sendJson(res, 404, { error: 'Message not found.' });
        const starred = (msg.starredBy || []).includes(uid);
        await db.collection('messages').updateOne(
          { id: messageId, chatId },
          starred ? { $pull: { starredBy: uid } } : { $addToSet: { starredBy: uid } }
        );
        return sendJson(res, 200, { ok: true });
      }

      if (action === 'markDelivered') {
        const { chatId, uid } = body;
        await db.collection('messages').updateMany(
          {
            chatId,
            senderId: { $ne: uid },
            deliveredTo: { $ne: uid },
          },
          {
            $addToSet: { deliveredTo: uid },
            $set: { status: 'delivered' },
          }
        );
        const chat = await db.collection('chats').findOne({ id: chatId });
        if (chat?.lastMessage && chat.lastMessage.senderId !== uid) {
          const deliveredTo = Array.isArray(chat.lastMessage.deliveredTo)
            ? chat.lastMessage.deliveredTo
            : [];
          if (!deliveredTo.includes(uid)) {
            await db.collection('chats').updateOne(
              { id: chatId },
              {
                $set: {
                  'lastMessage.deliveredTo': [...deliveredTo, uid],
                  'lastMessage.status':
                    chat.lastMessage.status === 'read' ? 'read' : 'delivered',
                },
              }
            );
          }
        }
        return sendJson(res, 200, { ok: true });
      }

      if (action === 'markRead') {
        const { chatId, uid, sendReadReceipt } = body;
        await db.collection('chats').updateOne(
          { id: chatId },
          { $set: { [`unreadCount.${uid}`]: 0 } }
        );
        if (sendReadReceipt) {
          await db.collection('messages').updateMany(
            {
              chatId,
              senderId: { $ne: uid },
              readBy: { $ne: uid },
            },
            {
              $addToSet: { readBy: uid, deliveredTo: uid },
              $set: { status: 'read' },
            }
          );
          const chat = await db.collection('chats').findOne({ id: chatId });
          if (chat?.lastMessage && chat.lastMessage.senderId !== uid) {
            const readBy = Array.isArray(chat.lastMessage.readBy)
              ? chat.lastMessage.readBy
              : [];
            const deliveredTo = Array.isArray(chat.lastMessage.deliveredTo)
              ? chat.lastMessage.deliveredTo
              : [];
            await db.collection('chats').updateOne(
              { id: chatId },
              {
                $set: {
                  'lastMessage.readBy': readBy.includes(uid) ? readBy : [...readBy, uid],
                  'lastMessage.deliveredTo': deliveredTo.includes(uid)
                    ? deliveredTo
                    : [...deliveredTo, uid],
                  'lastMessage.status': 'read',
                },
              }
            );
          }
        }
        return sendJson(res, 200, { ok: true });
      }

      // ---- FRIEND REQUESTS ----
      if (action === 'sendFriendRequest') {
        const { request } = body;
        if (!request?.fromUid || !request?.toUid) {
          return sendJson(res, 400, { error: 'fromUid and toUid required.' });
        }
        const existing = await db.collection('friendRequests').findOne({
          $or: [
            { fromUid: request.fromUid, toUid: request.toUid, status: 'pending' },
            { fromUid: request.toUid, toUid: request.fromUid, status: 'pending' },
          ],
        });
        if (existing) {
          return sendJson(res, 409, {
            error: 'A friend request already exists between you and this user.',
          });
        }
        await db.collection('friendRequests').insertOne(stripMongoId(request));
        return sendJson(res, 200, { ok: true, request });
      }

      if (action === 'acceptFriendRequest') {
        const { requestId, fromUid, toUid } = body;
        await db.collection('friendRequests').updateOne(
          { id: requestId },
          { $set: { status: 'accepted', updatedAt: new Date().toISOString() } }
        );
        await db.collection('users').updateOne(
          { uid: fromUid },
          { $addToSet: { friends: toUid }, $set: { updatedAt: new Date().toISOString() } }
        );
        await db.collection('users').updateOne(
          { uid: toUid },
          { $addToSet: { friends: fromUid }, $set: { updatedAt: new Date().toISOString() } }
        );
        return sendJson(res, 200, { ok: true });
      }

      if (action === 'rejectFriendRequest') {
        const { requestId } = body;
        await db.collection('friendRequests').deleteOne({ id: requestId });
        return sendJson(res, 200, { ok: true });
      }

      if (action === 'removeFriend') {
        const { currentUid, targetUid } = body;
        await db.collection('users').updateOne(
          { uid: currentUid },
          { $pull: { friends: targetUid }, $set: { updatedAt: new Date().toISOString() } }
        );
        await db.collection('users').updateOne(
          { uid: targetUid },
          { $pull: { friends: currentUid }, $set: { updatedAt: new Date().toISOString() } }
        );
        return sendJson(res, 200, { ok: true });
      }

      // ---- WEBRTC CALLS ----
      if (action === 'createCall') {
        const { call } = body;
        if (!call?.id) return sendJson(res, 400, { error: 'call.id is required.' });
        await db.collection('calls').insertOne({
          ...stripMongoId(call),
          offerCandidates: [],
          answerCandidates: [],
        });
        return sendJson(res, 200, { ok: true, call });
      }

      if (action === 'answerCall') {
        const { callId, answer } = body;
        await db.collection('calls').updateOne(
          { id: callId },
          { $set: { status: 'connected', answer, answeredAtMs: Date.now() } }
        );
        return sendJson(res, 200, { ok: true });
      }

      if (action === 'addIceCandidate') {
        const { callId, role, candidate } = body;
        const field = role === 'caller' ? 'offerCandidates' : 'answerCandidates';
        await db.collection('calls').updateOne(
          { id: callId },
          { $push: { [field]: candidate } }
        );
        return sendJson(res, 200, { ok: true });
      }

      if (action === 'updateCallStatus') {
        const { callId, status } = body;
        await db.collection('calls').updateOne(
          { id: callId },
          { $set: { status, endedAtMs: Date.now() } }
        );
        return sendJson(res, 200, { ok: true });
      }

      return sendJson(res, 400, { error: `Unknown POST action: ${action}` });
    }

    return sendJson(res, 405, { error: 'Method not allowed' });
  } catch (err) {
    console.error('[api/mongo] Error:', err);
    return sendJson(res, 500, { error: err?.message || 'MongoDB server error' });
  }
}
