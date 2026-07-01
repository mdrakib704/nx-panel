import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { validateEmail, validatePassword } from '../utils/validation.js';
import { logAudit } from '../utils/audit.js';

export async function setupAuthRoutes(fastify) {
  fastify.post('/api/auth/register', async (request, reply) => {
    try {
      const { username, email, password, confirmPassword } = request.body;

      if (!username || !email || !password || !confirmPassword) {
        return reply.status(400).send({ error: 'All fields are required' });
      }

      if (password !== confirmPassword) {
        return reply.status(400).send({ error: 'Passwords do not match' });
      }

      if (!validateEmail(email)) {
        return reply.status(400).send({ error: 'Invalid email format' });
      }

      if (!validatePassword(password)) {
        return reply.status(400).send({ error: 'Password must be at least 8 characters' });
      }

      const existingUser = fastify.db.prepare('SELECT id FROM users WHERE email = ? OR username = ?').get(email, username);
      if (existingUser) {
        return reply.status(409).send({ error: 'Email or username already exists' });
      }

      const userId = uuidv4();
      const hashedPassword = await bcrypt.hash(password, 10);

      fastify.db.prepare(`
        INSERT INTO users (id, username, email, password_hash, coins)
        VALUES (?, ?, ?, ?, ?)
      `).run(userId, username, email, hashedPassword, 0);

      await logAudit(fastify.db, null, 'USER_REGISTERED', 'user', userId, null, request.ip, 'success');

      const token = fastify.jwt.sign({ userId, email, role: 'user' });
      const sessionId = uuidv4();
      
      fastify.db.prepare(`
        INSERT INTO sessions (id, user_id, ip_address, user_agent, expires_at)
        VALUES (?, ?, ?, ?, datetime('now', '+24 hours'))
      `).run(sessionId, userId, request.ip, request.headers['user-agent']);

      reply.status(201).send({
        success: true,
        token,
        sessionId,
        user: { userId, username, email }
      });
    } catch (error) {
      fastify.log.error(error);
      reply.status(500).send({ error: 'Registration failed' });
    }
  });

  fastify.post('/api/auth/login', async (request, reply) => {
    try {
      const { email, password, rememberMe } = request.body;

      if (!email || !password) {
        return reply.status(400).send({ error: 'Email and password required' });
      }

      const user = fastify.db.prepare('SELECT * FROM users WHERE email = ?').get(email);
      
      if (!user) {
        return reply.status(401).send({ error: 'Invalid credentials' });
      }

      if (user.is_suspended) {
        return reply.status(403).send({ error: 'Account is suspended' });
      }

      if (!user.is_active) {
        return reply.status(403).send({ error: 'Account is not active' });
      }

      const passwordMatch = await bcrypt.compare(password, user.password_hash);
      
      if (!passwordMatch) {
        return reply.status(401).send({ error: 'Invalid credentials' });
      }

      const expiresIn = rememberMe ? '30d' : '24h';
      const token = fastify.jwt.sign(
        { userId: user.id, email: user.email, role: user.role },
        { expiresIn }
      );
      
      const sessionId = uuidv4();
      const expiryDate = rememberMe ? "datetime('now', '+30 days')" : "datetime('now', '+24 hours')";
      
      fastify.db.prepare(`
        INSERT INTO sessions (id, user_id, ip_address, user_agent, expires_at)
        VALUES (?, ?, ?, ?, ${expiryDate})
      `).run(sessionId, user.id, request.ip, request.headers['user-agent']);

      fastify.db.prepare('UPDATE users SET last_login = datetime("now") WHERE id = ?').run(user.id);

      await logAudit(fastify.db, user.id, 'USER_LOGIN', 'user', user.id, null, request.ip, 'success');

      reply.send({
        success: true,
        token,
        sessionId,
        user: {
          userId: user.id,
          username: user.username,
          email: user.email,
          role: user.role,
          coins: user.coins
        }
      });
    } catch (error) {
      fastify.log.error(error);
      reply.status(500).send({ error: 'Login failed' });
    }
  });

  fastify.post('/api/auth/refresh', async (request, reply) => {
    try {
      const { sessionId } = request.body;

      if (!sessionId) {
        return reply.status(400).send({ error: 'Session ID required' });
      }

      const session = fastify.db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);
      
      if (!session) {
        return reply.status(401).send({ error: 'Invalid session' });
      }

      const expiryDate = new Date(session.expires_at);
      if (expiryDate < new Date()) {
        return reply.status(401).send({ error: 'Session expired' });
      }

      const user = fastify.db.prepare('SELECT * FROM users WHERE id = ?').get(session.user_id);
      
      const token = fastify.jwt.sign(
        { userId: user.id, email: user.email, role: user.role },
        { expiresIn: '24h' }
      );

      reply.send({
        success: true,
        token,
        user: {
          userId: user.id,
          username: user.username,
          email: user.email,
          role: user.role,
          coins: user.coins
        }
      });
    } catch (error) {
      fastify.log.error(error);
      reply.status(500).send({ error: 'Token refresh failed' });
    }
  });

  fastify.post('/api/auth/logout', async (request, reply) => {
    try {
      await request.jwtVerify();
      const { sessionId } = request.body;

      if (sessionId) {
        fastify.db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
      }

      reply.send({ success: true });
    } catch (error) {
      fastify.log.error(error);
      reply.status(500).send({ error: 'Logout failed' });
    }
  });

  fastify.post('/api/auth/forgot-password', async (request, reply) => {
    try {
      const { email } = request.body;

      if (!email) {
        return reply.status(400).send({ error: 'Email required' });
      }

      const user = fastify.db.prepare('SELECT id FROM users WHERE email = ?').get(email);
      
      if (!user) {
        return reply.status(404).send({ error: 'User not found' });
      }

      await logAudit(fastify.db, null, 'PASSWORD_RESET_REQUESTED', 'user', user.id, null, request.ip, 'success');

      reply.send({
        success: true,
        message: 'Password reset instructions sent to email (feature pending implementation)'
      });
    } catch (error) {
      fastify.log.error(error);
      reply.status(500).send({ error: 'Password reset request failed' });
    }
  });

  fastify.get('/api/auth/me', async (request, reply) => {
    try {
      await request.jwtVerify();
      const user = fastify.db.prepare('SELECT id, username, email, role, coins, two_factor_enabled FROM users WHERE id = ?').get(request.user.userId);

      reply.send({
        success: true,
        user
      });
    } catch (error) {
      fastify.log.error(error);
      reply.status(401).send({ error: 'Unauthorized' });
    }
  });

  fastify.post('/api/auth/change-password', async (request, reply) => {
    try {
      await request.jwtVerify();
      const { currentPassword, newPassword, confirmPassword } = request.body;

      if (!currentPassword || !newPassword || !confirmPassword) {
        return reply.status(400).send({ error: 'All fields required' });
      }

      if (newPassword !== confirmPassword) {
        return reply.status(400).send({ error: 'Passwords do not match' });
      }

      if (!validatePassword(newPassword)) {
        return reply.status(400).send({ error: 'Password must be at least 8 characters' });
      }

      const user = fastify.db.prepare('SELECT * FROM users WHERE id = ?').get(request.user.userId);
      const passwordMatch = await bcrypt.compare(currentPassword, user.password_hash);

      if (!passwordMatch) {
        return reply.status(401).send({ error: 'Current password is incorrect' });
      }

      const hashedPassword = await bcrypt.hash(newPassword, 10);
      fastify.db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashedPassword, request.user.userId);

      await logAudit(fastify.db, request.user.userId, 'PASSWORD_CHANGED', 'user', request.user.userId, null, request.ip, 'success');

      reply.send({ success: true, message: 'Password changed successfully' });
    } catch (error) {
      fastify.log.error(error);
      reply.status(500).send({ error: 'Password change failed' });
    }
  });
}
