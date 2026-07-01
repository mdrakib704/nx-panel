import Fastify from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyHelmet from '@fastify/helmet';
import fastifyJwt from '@fastify/jwt';
import fastifyStatic from '@fastify/static';
import fastifyWebsocket from '@fastify/websocket';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import Database from 'better-sqlite3';
import { initializeDatabase } from './database/init.js';
import { setupAuthRoutes } from './auth/routes.js';
import { setupApiRoutes } from './api/routes.js';
import { setupAdminRoutes } from './api/admin.js';
import { setupUserRoutes } from './api/user.js';
import { setupServerRoutes } from './api/server.js';
import { setupCoinRoutes } from './api/coin.js';
import { setupBackupRoutes } from './api/backup.js';
import { setupStatisticsRoutes } from './api/statistics.js';
import { setupWebsocketRoutes } from './websocket/routes.js';
import { rateLimitMiddleware } from './utils/rateLimit.js';
import { requestLogger } from './utils/logger.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONFIG = JSON.parse(
  (await import('fs')).readFileSync(path.join(__dirname, 'config.json'), 'utf-8')
);

const fastify = Fastify({
  logger: true,
  bodyLimit: 104857600
});

await fastify.register(fastifyHelmet, {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      mediaSrc: ["'self'"],
      connectSrc: ["'self'", 'ws:', 'wss:']
    }
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
});

await fastify.register(fastifyCors, {
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
});

await fastify.register(fastifyJwt, {
  secret: CONFIG.jwtSecret,
  sign: {
    expiresIn: '24h'
  }
});

await fastify.register(fastifyWebsocket);

await fastify.register(fastifyStatic, {
  root: path.join(__dirname, 'public'),
  prefix: '/'
});

fastify.addHook('preHandler', async (request, reply) => {
  if (request.url !== '/api/auth/login' && 
      request.url !== '/api/auth/register' && 
      request.url !== '/api/auth/refresh' &&
      request.url.startsWith('/api/')) {
    try {
      await request.jwtVerify();
    } catch (err) {
      reply.send(err);
    }
  }
});

fastify.addHook('preHandler', rateLimitMiddleware);
fastify.addHook('onResponse', requestLogger);

try {
  const db = new Database(path.join(__dirname, 'database', 'panel.db'));
  await initializeDatabase(db);
  fastify.decorate('db', db);
  
  await setupAuthRoutes(fastify);
  await setupApiRoutes(fastify);
  await setupAdminRoutes(fastify);
  await setupUserRoutes(fastify);
  await setupServerRoutes(fastify);
  await setupCoinRoutes(fastify);
  await setupBackupRoutes(fastify);
  await setupStatisticsRoutes(fastify);
  await setupWebsocketRoutes(fastify);
  
  fastify.get('/', async (request, reply) => {
    reply.sendFile('index.html');
  });
  
  await fastify.listen({ port: CONFIG.port, host: '0.0.0.0' });
  console.log(`NX Panel running on http://0.0.0.0:${CONFIG.port}`);
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}
