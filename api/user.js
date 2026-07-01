import { v4 as uuidv4 } from 'uuid';
import { logAudit } from '../utils/audit.js';

export async function setupUserRoutes(fastify) {
  fastify.get('/api/users/:userId', async (request, reply) => {
    try {
      await request.jwtVerify();
      const { userId } = request.params;

      if (request.user.role !== 'admin' && request.user.userId !== userId) {
        return reply.status(403).send({ error: 'Unauthorized' });
      }

      const user = fastify.db.prepare('SELECT id, username, email, role, coins, is_active, is_suspended, created_at FROM users WHERE id = ?').get(userId);

      if (!user) {
        return reply.status(404).send({ error: 'User not found' });
      }

      reply.send({ success: true, user });
    } catch (error) {
      fastify.log.error(error);
      reply.status(500).send({ error: 'Failed to fetch user' });
    }
  });

  fastify.put('/api/users/:userId', async (request, reply) => {
    try {
      await request.jwtVerify();
      const { userId } = request.params;
      const { email } = request.body;

      if (request.user.role !== 'admin' && request.user.userId !== userId) {
        return reply.status(403).send({ error: 'Unauthorized' });
      }

      const user = fastify.db.prepare('SELECT * FROM users WHERE id = ?').get(userId);

      if (!user) {
        return reply.status(404).send({ error: 'User not found' });
      }

      if (email) {
        const emailExists = fastify.db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(email, userId);
        if (emailExists) {
          return reply.status(409).send({ error: 'Email already in use' });
        }
        fastify.db.prepare('UPDATE users SET email = ? WHERE id = ?').run(email, userId);
      }

      await logAudit(fastify.db, request.user.userId, 'USER_UPDATED', 'user', userId, { email }, request.ip, 'success');

      reply.send({ success: true, message: 'User updated' });
    } catch (error) {
      fastify.log.error(error);
      reply.status(500).send({ error: 'User update failed' });
    }
  });

  fastify.get('/api/users/:userId/profile', async (request, reply) => {
    try {
      await request.jwtVerify();
      const { userId } = request.params;

      if (request.user.role !== 'admin' && request.user.userId !== userId) {
        return reply.status(403).send({ error: 'Unauthorized' });
      }

      const user = fastify.db.prepare('SELECT id, username, email, coins, role, created_at FROM users WHERE id = ?').get(userId);
      const serverCount = fastify.db.prepare('SELECT COUNT(*) as count FROM servers WHERE user_id = ?').get(userId);
      const coinHistory = fastify.db.prepare('SELECT * FROM coins WHERE user_id = ? ORDER BY created_at DESC LIMIT 20').all(userId);

      reply.send({
        success: true,
        profile: {
          ...user,
          serverCount: serverCount.count,
          recentTransactions: coinHistory
        }
      });
    } catch (error) {
      fastify.log.error(error);
      reply.status(500).send({ error: 'Failed to fetch profile' });
    }
  });

  fastify.get('/api/users/:userId/stats', async (request, reply) => {
    try {
      await request.jwtVerify();
      const { userId } = request.params;

      if (request.user.role !== 'admin' && request.user.userId !== userId) {
        return reply.status(403).send({ error: 'Unauthorized' });
      }

      const servers = fastify.db.prepare('SELECT COUNT(*) as count FROM servers WHERE user_id = ?').get(userId);
      const totalCoins = fastify.db.prepare('SELECT SUM(amount) as total FROM coins WHERE user_id = ?').get(userId);
      const totalSpent = fastify.db.prepare('SELECT SUM(total_cost) as total FROM user_purchases WHERE user_id = ?').get(userId);

      reply.send({
        success: true,
        stats: {
          servers: servers.count,
          totalCoinsEarned: totalCoins.total || 0,
          totalCoinsSpent: totalSpent.total || 0
        }
      });
    } catch (error) {
      fastify.log.error(error);
      reply.status(500).send({ error: 'Failed to fetch stats' });
    }
  });
}
