import 'dotenv/config';
import { MongoClient } from 'mongodb';

const DEFAULT_URI =
  'mongodb+srv://<db_username>:<db_password>@cluster0.uajeuti.mongodb.net/';

const uri = process.env.MONGODB_URI || DEFAULT_URI;
const dbName = process.env.MONGODB_DB || 'md_chat_pro';

const client = new MongoClient(uri);
let connectPromise = null;
let indexesEnsured = false;

export async function connectToMongoDB() {
  if (!uri || uri.includes('<db_username>') || uri.includes('<db_password>')) {
    throw new Error(
      'MONGODB_URI is not configured. Set MONGODB_URI in .env with your MongoDB username and password.'
    );
  }

  if (!connectPromise) {
    connectPromise = client
      .connect()
      .then(() => {
        console.log('You successfully connected to MongoDB!');
        return client;
      })
      .catch((err) => {
        connectPromise = null;
        console.dir(err);
        throw err;
      });
  }

  return connectPromise;
}

export async function getMongoDb() {
  await connectToMongoDB();
  const db = client.db(dbName);

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

// Call this only when your application terminates
export async function disconnectFromMongoDB() {
  connectPromise = null;
  indexesEnsured = false;
  await client.close();
}
