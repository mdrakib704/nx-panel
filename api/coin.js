import { v4 as uuidv4 } from 'uuid';
import { logAudit } from '../utils/audit.js';

export async function setupCoinRoutes(fastify) {
  fastify.get('/api/coins/balance', async (request, reply) => {
    try {
      await request.jwtVerify();
      const user = fastify.db.prepare('SELECT coins FROM users WHERE id = ?').get(request.user.userId);
      reply.send({ success: true, balance: user.coins });
    } catch (error) {
      fastify.log.error(error);
      reply.status(500).send({ error: 'Failed to fetch balance' });
    }
  });

  fastify.get('/api/coins/history', async (request, reply) => {
    try {
      await request.jwtVerify();
      const history = fastify.db.prepare('SELECT * FROM coins WHERE user_id = ? ORDER BY created_at DESC LIMIT 50').all(request.user.userId);
      reply.send({ success: true, history });
    } catch (error) {
      fastify.log.error(error);
      reply.status(500).send({ error: 'Failed to fetch history' });
    }
  });

  fastify.get('/api/coins/leaderboard', async (request, reply) => {
    try {
      const leaderboard = fastify.db.prepare('SELECT username, coins FROM users WHERE is_active = 1 ORDER BY coins DESC LIMIT 100').all();
      reply.send({ success: true, leaderboard });
    } catch (error) {
      fastify.log.error(error);
      reply.status(500).send({ error: 'Failed to fetch leaderboard' });
    }
  });

  fastify.post('/api/coins/redeem-promo', async (request, reply) => {
    try {
      await request.jwtVerify();
      const { code } = request.body;

      if (!code) {
        return reply.status(400).send({ error: 'Promo code required' });
      }

      const promo = fastify.db.prepare('SELECT * FROM promo_codes WHERE code = ?').get(code);

      if (!promo) {
        return reply.status(404).send({ error: 'Promo code not found' });
      }

      if (!promo.is_active) {
        return reply.status(400).send({ error: 'Promo code is inactive' });
      }

      if (promo.expires_at && new Date(promo.expires_at) < new Date()) {
        return reply.status(400).send({ error: 'Promo code expired' });
      }

      if (promo.max_uses && promo.current_uses >= promo.max_uses) {
        return reply.status(400).send({ error: 'Promo code usage limit reached' });
      }

      const alreadyUsed = fastify.db.prepare('SELECT id FROM user_promo_uses WHERE user_id = ? AND promo_code_id = ?').get(request.user.userId, promo.id);

      if (alreadyUsed) {
        return reply.status(400).send({ error: 'You have already used this promo code' });
      }

      const transactionId = uuidv4();
      fastify.db.prepare('UPDATE users SET coins = coins + ? WHERE id = ?').run(promo.reward_coins, request.user.userId);
      fastify.db.prepare('INSERT INTO coins (id, user_id, amount, transaction_type, description, reference_id) VALUES (?, ?, ?, ?, ?, ?)').run(transactionId, request.user.userId, promo.reward_coins, 'promo', `Promo code: ${code}`, promo.id);
      fastify.db.prepare('INSERT INTO user_promo_uses (id, user_id, promo_code_id) VALUES (?, ?, ?)').run(uuidv4(), request.user.userId, promo.id);
      fastify.db.prepare('UPDATE promo_codes SET current_uses = current_uses + 1 WHERE id = ?').run(promo.id);

      await logAudit(fastify.db, request.user.userId, 'PROMO_REDEEMED', 'promo', promo.id, { code, reward: promo.reward_coins }, request.ip, 'success');

      reply.send({ success: true, message: `${promo.reward_coins} coins added!` });
    } catch (error) {
      fastify.log.error(error);
      reply.status(500).send({ error: 'Promo redemption failed' });
    }
  });

  fastify.get('/api/coins/daily-reward', async (request, reply) => {
    try {
      await request.jwtVerify();
      const config = JSON.parse((await import('fs')).readFileSync('./config.json', 'utf-8'));
      const user = fastify.db.prepare('SELECT * FROM users WHERE id = ?').get(request.user.userId);
      const lastReward = fastify.db.prepare('SELECT * FROM coins WHERE user_id = ? AND transaction_type = ? ORDER BY created_at DESC LIMIT 1').get(request.user.userId, 'daily');

      if (lastReward) {
        const lastRewardDate = new Date(lastReward.created_at).toDateString();
        const todayDate = new Date().toDateString();
        
        if (lastRewardDate === todayDate) {
          return reply.status(400).send({ error: 'Daily reward already claimed' });
        }
      }

      const transactionId = uuidv4();
      fastify.db.prepare('UPDATE users SET coins = coins + ? WHERE id = ?').run(config.dailyRewardCoins, request.user.userId);
      fastify.db.prepare('INSERT INTO coins (id, user_id, amount, transaction_type, description) VALUES (?, ?, ?, ?, ?)').run(transactionId, request.user.userId, config.dailyRewardCoins, 'daily', 'Daily reward');

      await logAudit(fastify.db, request.user.userId, 'DAILY_REWARD_CLAIMED', 'user', request.user.userId, { coins: config.dailyRewardCoins }, request.ip, 'success');

      reply.send({ success: true, message: `${config.dailyRewardCoins} coins added!` });
    } catch (error) {
      fastify.log.error(error);
      reply.status(500).send({ error: 'Daily reward claim failed' });
    }
  });

  fastify.get('/api/shop/items', async (request, reply) => {
    try {
      const items = fastify.db.prepare('SELECT * FROM shop_items WHERE is_active = 1').all();
      reply.send({ success: true, items });
    } catch (error) {
      fastify.log.error(error);
      reply.status(500).send({ error: 'Failed to fetch shop items' });
    }
  });

  fastify.post('/api/shop/purchase', async (request, reply) => {
    try {
      await request.jwtVerify();
      const { itemId, quantity } = request.body;

      if (!itemId || !quantity || quantity < 1) {
        return reply.status(400).send({ error: 'Invalid item or quantity' });
      }

      const item = fastify.db.prepare('SELECT * FROM shop_items WHERE id = ?').get(itemId);

      if (!item) {
        return reply.status(404).send({ error: 'Item not found' });
      }

      const user = fastify.db.prepare('SELECT coins FROM users WHERE id = ?').get(request.user.userId);
      const totalCost = item.cost_coins * quantity;

      if (user.coins < totalCost) {
        return reply.status(400).send({ error: 'Insufficient coins' });
      }

      const purchaseId = uuidv4();
      fastify.db.prepare('UPDATE users SET coins = coins - ? WHERE id = ?').run(totalCost, request.user.userId);
      fastify.db.prepare('INSERT INTO user_purchases (id, user_id, shop_item_id, quantity, total_cost) VALUES (?, ?, ?, ?, ?)').run(purchaseId, request.user.userId, itemId, quantity, totalCost);
      
      const transactionId = uuidv4();
      fastify.db.prepare('INSERT INTO coins (id, user_id, amount, transaction_type, description, reference_id) VALUES (?, ?, ?, ?, ?, ?)').run(transactionId, request.user.userId, -totalCost, 'purchase', `Purchased: ${item.name} x${quantity}`, purchaseId);

      await logAudit(fastify.db, request.user.userId, 'SHOP_PURCHASE', 'shop_item', itemId, { quantity, totalCost }, request.ip, 'success');

      reply.send({ success: true, message: 'Purchase successful' });
    } catch (error) {
      fastify.log.error(error);
      reply.status(500).send({ error: 'Purchase failed' });
    }
  });
}
