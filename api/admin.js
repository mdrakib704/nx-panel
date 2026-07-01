import { v4 as uuidv4 } from 'uuid';
import { logAudit, getAuditLogs } from '../utils/audit.js';

export async function setupAdminRoutes(fastify) {
  fastify.addHook('preHandler', async (request, reply) => {
    if (request.url.startsWith('/api/admin')) {
      try {
        await request.jwtVerify();
        if (request.user.role !== 'admin') {
          reply.status(403).send({ error: 'Admin access required' });
        }
      } catch (err) {
        reply.status(401).send({ error: 'Unauthorized' });
      }
    }
  });

  fastify.get('/api/admin/users', async (request, reply) => {
    try {
      const page = parseInt(request.query.page) || 1;
      const limit = parseInt(request.query.limit) || 50;
      const offset = (page - 1) * limit;

      const users = fastify.db.prepare(`
        SELECT id, username, email, role, coins, is_active, is_suspended, created_at, last_login
        FROM users
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      `).all(limit, offset);

      const total = fastify.db.prepare('SELECT COUNT(*) as count FROM users').get();

      reply.send({
        success: true,
        users,
        pagination: { page, limit, total: total.count, pages: Math.ceil(total.count / limit) }
      });
    } catch (error) {
      fastify.log.error(error);
      reply.status(500).send({ error: 'Failed to fetch users' });
    }
  });

  fastify.post('/api/admin/users/:userId/suspend', async (request, reply) => {
    try {
      const { userId } = request.params;
      const { reason } = request.body;

      const user = fastify.db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
      if (!user) {
        return reply.status(404).send({ error: 'User not found' });
      }

      fastify.db.prepare('UPDATE users SET is_suspended = 1 WHERE id = ?').run(userId);
      await logAudit(fastify.db, request.user.userId, 'USER_SUSPENDED', 'user', userId, { reason }, request.ip, 'success');

      reply.send({ success: true, message: 'User suspended' });
    } catch (error) {
      fastify.log.error(error);
      reply.status(500).send({ error: 'Suspension failed' });
    }
  });

  fastify.post('/api/admin/users/:userId/unsuspend', async (request, reply) => {
    try {
      const { userId } = request.params;

      const user = fastify.db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
      if (!user) {
        return reply.status(404).send({ error: 'User not found' });
      }

      fastify.db.prepare('UPDATE users SET is_suspended = 0 WHERE id = ?').run(userId);
      await logAudit(fastify.db, request.user.userId, 'USER_UNSUSPENDED', 'user', userId, null, request.ip, 'success');

      reply.send({ success: true, message: 'User unsuspended' });
    } catch (error) {
      fastify.log.error(error);
      reply.status(500).send({ error: 'Unsuspension failed' });
    }
  });

  fastify.post('/api/admin/users/:userId/coins/add', async (request, reply) => {
    try {
      const { userId } = request.params;
      const { amount, reason } = request.body;

      if (!amount || amount <= 0) {
        return reply.status(400).send({ error: 'Invalid amount' });
      }

      const user = fastify.db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
      if (!user) {
        return reply.status(404).send({ error: 'User not found' });
      }

      const transactionId = uuidv4();
      fastify.db.prepare('UPDATE users SET coins = coins + ? WHERE id = ?').run(amount, userId);
      fastify.db.prepare('INSERT INTO coins (id, user_id, amount, transaction_type, description) VALUES (?, ?, ?, ?, ?)').run(transactionId, userId, amount, 'admin_gift', reason || 'Admin gift');

      await logAudit(fastify.db, request.user.userId, 'COINS_ADDED', 'user', userId, { amount, reason }, request.ip, 'success');

      reply.send({ success: true, message: `${amount} coins added to user` });
    } catch (error) {
      fastify.log.error(error);
      reply.status(500).send({ error: 'Coin addition failed' });
    }
  });

  fastify.get('/api/admin/servers', async (request, reply) => {
    try {
      const servers = fastify.db.prepare('SELECT * FROM servers ORDER BY created_at DESC').all();
      reply.send({ success: true, servers });
    } catch (error) {
      fastify.log.error(error);
      reply.status(500).send({ error: 'Failed to fetch servers' });
    }
  });

  fastify.post('/api/admin/servers/:serverId/suspend', async (request, reply) => {
    try {
      const { serverId } = request.params;
      const { reason } = request.body;

      const server = fastify.db.prepare('SELECT * FROM servers WHERE id = ?').get(serverId);
      if (!server) {
        return reply.status(404).send({ error: 'Server not found' });
      }

      fastify.db.prepare('UPDATE servers SET is_suspended = 1, is_running = 0 WHERE id = ?').run(serverId);
      await logAudit(fastify.db, request.user.userId, 'SERVER_SUSPENDED', 'server', serverId, { reason }, request.ip, 'success');

      reply.send({ success: true, message: 'Server suspended' });
    } catch (error) {
      fastify.log.error(error);
      reply.status(500).send({ error: 'Suspension failed' });
    }
  });

  fastify.get('/api/admin/audit-logs', async (request, reply) => {
    try {
      const logs = getAuditLogs(fastify.db);
      reply.send({ success: true, logs });
    } catch (error) {
      fastify.log.error(error);
      reply.status(500).send({ error: 'Failed to fetch audit logs' });
    }
  });

  fastify.post('/api/admin/promo-codes', async (request, reply) => {
    try {
      const { code, rewardCoins, maxUses, expiresIn } = request.body;

      if (!code || !rewardCoins) {
        return reply.status(400).send({ error: 'Code and reward required' });
      }

      const existing = fastify.db.prepare('SELECT id FROM promo_codes WHERE code = ?').get(code);
      if (existing) {
        return reply.status(409).send({ error: 'Promo code already exists' });
      }

      const promoId = uuidv4();
      let expiryDate = null;
      if (expiresIn) {
        expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + expiresIn);
      }

      fastify.db.prepare(`
        INSERT INTO promo_codes (id, code, reward_coins, max_uses, expires_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(promoId, code, rewardCoins, maxUses || null, expiryDate);

      await logAudit(fastify.db, request.user.userId, 'PROMO_CODE_CREATED', 'promo', promoId, { code, rewardCoins }, request.ip, 'success');

      reply.status(201).send({ success: true, promoId });
    } catch (error) {
      fastify.log.error(error);
      reply.status(500).send({ error: 'Promo code creation failed' });
    }
  });

  fastify.get('/api/admin/promo-codes', async (request, reply) => {
    try {
      const codes = fastify.db.prepare('SELECT * FROM promo_codes ORDER BY created_at DESC').all();
      reply.send({ success: true, codes });
    } catch (error) {
      fastify.log.error(error);
      reply.status(500).send({ error: 'Failed to fetch promo codes' });
    }
  });

  fastify.delete('/api/admin/promo-codes/:promoId', async (request, reply) => {
    try {
      const { promoId } = request.params;

      const promo = fastify.db.prepare('SELECT * FROM promo_codes WHERE id = ?').get(promoId);
      if (!promo) {
        return reply.status(404).send({ error: 'Promo code not found' });
      }

      fastify.db.prepare('DELETE FROM promo_codes WHERE id = ?').run(promoId);
      await logAudit(fastify.db, request.user.userId, 'PROMO_CODE_DELETED', 'promo', promoId, null, request.ip, 'success');

      reply.send({ success: true, message: 'Promo code deleted' });
    } catch (error) {
      fastify.log.error(error);
      reply.status(500).send({ error: 'Promo code deletion failed' });
    }
  });

  fastify.post('/api/admin/announcements', async (request, reply) => {
    try {
      const { title, content, priority } = request.body;

      if (!title || !content) {
        return reply.status(400).send({ error: 'Title and content required' });
      }

      const announcementId = uuidv4();
      fastify.db.prepare(`
        INSERT INTO announcements (id, title, content, priority)
        VALUES (?, ?, ?, ?)
      `).run(announcementId, title, content, priority || 'normal');

      await logAudit(fastify.db, request.user.userId, 'ANNOUNCEMENT_CREATED', 'announcement', announcementId, { title }, request.ip, 'success');

      reply.status(201).send({ success: true, announcementId });
    } catch (error) {
      fastify.log.error(error);
      reply.status(500).send({ error: 'Announcement creation failed' });
    }
  });

  fastify.get('/api/admin/announcements', async (request, reply) => {
    try {
      const announcements = fastify.db.prepare('SELECT * FROM announcements ORDER BY created_at DESC').all();
      reply.send({ success: true, announcements });
    } catch (error) {
      fastify.log.error(error);
      reply.status(500).send({ error: 'Failed to fetch announcements' });
    }
  });

  fastify.delete('/api/admin/announcements/:announcementId', async (request, reply) => {
    try {
      const { announcementId } = request.params;

      const announcement = fastify.db.prepare('SELECT * FROM announcements WHERE id = ?').get(announcementId);
      if (!announcement) {
        return reply.status(404).send({ error: 'Announcement not found' });
      }

      fastify.db.prepare('DELETE FROM announcements WHERE id = ?').run(announcementId);
      await logAudit(fastify.db, request.user.userId, 'ANNOUNCEMENT_DELETED', 'announcement', announcementId, null, request.ip, 'success');

      reply.send({ success: true, message: 'Announcement deleted' });
    } catch (error) {
      fastify.log.error(error);
      reply.status(500).send({ error: 'Announcement deletion failed' });
    }
  });

  fastify.get('/api/admin/statistics/overview', async (request, reply) => {
    try {
      const users = fastify.db.prepare('SELECT COUNT(*) as count FROM users').get();
      const servers = fastify.db.prepare('SELECT COUNT(*) as count FROM servers').get();
      const activeServers = fastify.db.prepare('SELECT COUNT(*) as count FROM servers WHERE is_running = 1').get();
      const totalCoins = fastify.db.prepare('SELECT SUM(amount) as total FROM coins').get();

      reply.send({
        success: true,
        overview: {
          totalUsers: users.count,
          totalServers: servers.count,
          activeServers: activeServers.count,
          totalCoinsDistributed: totalCoins.total || 0
        }
      });
    } catch (error) {
      fastify.log.error(error);
      reply.status(500).send({ error: 'Failed to fetch statistics' });
    }
  });
}
