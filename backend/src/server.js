import http from 'node:http';
import { connectToMongoDB, disconnectFromMongoDB } from './db/mongo.js';
import mongoHandler from '../../frontend/api/mongo.js';

const PORT = Number(process.env.PORT || 4000);

const server = http.createServer((req, res) => {
  if ((req.url || '').startsWith('/api/mongo')) {
    return mongoHandler(req, res);
  }
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ ok: true, service: 'md-chat-pro-backend' }));
});

connectToMongoDB()
  .then(() => {
    server.listen(PORT, () => {
      console.log(`MD Chat Pro MongoDB backend listening on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Failed to start MongoDB backend:', err.message);
    process.exit(1);
  });

const shutdown = async () => {
  await disconnectFromMongoDB();
  server.close(() => process.exit(0));
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
