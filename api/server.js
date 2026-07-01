import { v4 as uuidv4 } from 'uuid';
import { validateServerName, sanitizeInput } from '../utils/validation.js';
import { logAudit } from '../utils/audit.js';

export async function setupServerRoutes(fastify) {
  fastify.post('/api/servers', async (request, reply) => {
    try {
      await request.jwtVerify();
      const { name, version, serverType } = request.body;

      if (!validateServerName(name)) {
        return reply.status(400).send({ error: 'Invalid server name' });
      }

      const serverCount = fastify.db.prepare('SELECT COUNT(*) as count FROM servers WHERE user_id = ?').get(request.user.userId);
      const config = JSON.parse((await import('fs')).readFileSync('./config.json', 'utf-8'));
      
      if (serverCount.count >= config.maxServersPerUser) {
        return reply.status(403).send({ error: `Maximum ${config.maxServersPerUser} server(s) allowed per user` });
      }

      const serverId = uuidv4();
      const sanitizedName = sanitizeInput(name);
      const port = 25565 + serverCount.count;

      fastify.db.prepare(`
        INSERT INTO servers (id, user_id, name, version, server_type, port, ram_mb, cpu_percent, storage_gb)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(serverId, request.user.userId, sanitizedName, version || 'latest', serverType || 'paper', port, config.defaultServerRam, config.defaultServerCpu, config.defaultServerStorage);

      await logAudit(fastify.db, request.user.userId, 'SERVER_CREATED', 'server', serverId, { name: sanitizedName }, request.ip, 'success');

      reply.status(201).send({
        success: true,
        server: {
          id: serverId,
          name: sanitizedName,
          version: version || 'latest',
          serverType: serverType || 'paper',
          port,
          ram: config.defaultServerRam,
          cpu: config.defaultServerCpu,
          storage: config.defaultServerStorage
        }
      });
    } catch (error) {
      fastify.log.error(error);
      reply.status(500).send({ error: 'Server creation failed' });
    }
  });

  fastify.get('/api/servers', async (request, reply) => {
    try {
      await request.jwtVerify();
      
      let query = 'SELECT * FROM servers WHERE user_id = ?';
      const params = [request.user.userId];

      if (request.user.role === 'admin') {
        query = 'SELECT * FROM servers';
        params.pop();
      }

      const servers = fastify.db.prepare(query).all(...params);
      reply.send({ success: true, servers });
    } catch (error) {
      fastify.log.error(error);
      reply.status(500).send({ error: 'Failed to fetch servers' });
    }
  });

  fastify.get('/api/servers/:serverId', async (request, reply) => {
    try {
      await request.jwtVerify();
      const { serverId } = request.params;

      const server = fastify.db.prepare('SELECT * FROM servers WHERE id = ?').get(serverId);

      if (!server) {
        return reply.status(404).send({ error: 'Server not found' });
      }

      if (request.user.role !== 'admin' && server.user_id !== request.user.userId) {
        return reply.status(403).send({ error: 'Unauthorized' });
      }

      reply.send({ success: true, server });
    } catch (error) {
      fastify.log.error(error);
      reply.status(500).send({ error: 'Failed to fetch server' });
    }
  });

  fastify.put('/api/servers/:serverId', async (request, reply) => {
    try {
      await request.jwtVerify();
      const { serverId } = request.params;
      const { name, motd, maxPlayers, gamemode, difficulty, pvp } = request.body;

      const server = fastify.db.prepare('SELECT * FROM servers WHERE id = ?').get(serverId);

      if (!server) {
        return reply.status(404).send({ error: 'Server not found' });
      }

      if (request.user.role !== 'admin' && server.user_id !== request.user.userId) {
        return reply.status(403).send({ error: 'Unauthorized' });
      }

      const updates = {};
      if (name) {
        if (!validateServerName(name)) {
          return reply.status(400).send({ error: 'Invalid server name' });
        }
        updates.name = sanitizeInput(name);
      }
      if (motd) updates.motd = sanitizeInput(motd);
      if (maxPlayers) updates.max_players = maxPlayers;
      if (gamemode) updates.gamemode = gamemode;
      if (difficulty) updates.difficulty = difficulty;
      if (pvp !== undefined) updates.pvp = pvp ? 1 : 0;

      const setClause = Object.keys(updates).map(key => `${key.replace(/([A-Z])/g, '_$1').toLowerCase()} = ?`).join(', ');
      const values = Object.values(updates);

      fastify.db.prepare(`UPDATE servers SET ${setClause}, updated_at = datetime('now') WHERE id = ?`).run(...values, serverId);

      await logAudit(fastify.db, request.user.userId, 'SERVER_UPDATED', 'server', serverId, updates, request.ip, 'success');

      reply.send({ success: true, message: 'Server updated' });
    } catch (error) {
      fastify.log.error(error);
      reply.status(500).send({ error: 'Server update failed' });
    }
  });

  fastify.post('/api/servers/:serverId/start', async (request, reply) => {
    try {
      await request.jwtVerify();
      const { serverId } = request.params;

      const server = fastify.db.prepare('SELECT * FROM servers WHERE id = ?').get(serverId);

      if (!server) {
        return reply.status(404).send({ error: 'Server not found' });
      }

      if (request.user.role !== 'admin' && server.user_id !== request.user.userId) {
        return reply.status(403).send({ error: 'Unauthorized' });
      }

      fastify.db.prepare('UPDATE servers SET is_running = 1 WHERE id = ?').run(serverId);
      await logAudit(fastify.db, request.user.userId, 'SERVER_STARTED', 'server', serverId, null, request.ip, 'success');

      reply.send({ success: true, message: 'Server started' });
    } catch (error) {
      fastify.log.error(error);
      reply.status(500).send({ error: 'Server start failed' });
    }
  });

  fastify.post('/api/servers/:serverId/stop', async (request, reply) => {
    try {
      await request.jwtVerify();
      const { serverId } = request.params;

      const server = fastify.db.prepare('SELECT * FROM servers WHERE id = ?').get(serverId);

      if (!server) {
        return reply.status(404).send({ error: 'Server not found' });
      }

      if (request.user.role !== 'admin' && server.user_id !== request.user.userId) {
        return reply.status(403).send({ error: 'Unauthorized' });
      }

      fastify.db.prepare('UPDATE servers SET is_running = 0 WHERE id = ?').run(serverId);
      await logAudit(fastify.db, request.user.userId, 'SERVER_STOPPED', 'server', serverId, null, request.ip, 'success');

      reply.send({ success: true, message: 'Server stopped' });
    } catch (error) {
      fastify.log.error(error);
      reply.status(500).send({ error: 'Server stop failed' });
    }
  });

  fastify.post('/api/servers/:serverId/restart', async (request, reply) => {
    try {
      await request.jwtVerify();
      const { serverId } = request.params;

      const server = fastify.db.prepare('SELECT * FROM servers WHERE id = ?').get(serverId);

      if (!server) {
        return reply.status(404).send({ error: 'Server not found' });
      }

      if (request.user.role !== 'admin' && server.user_id !== request.user.userId) {
        return reply.status(403).send({ error: 'Unauthorized' });
      }

      fastify.db.prepare('UPDATE servers SET is_running = 0 WHERE id = ?').run(serverId);
      setTimeout(() => {
        fastify.db.prepare('UPDATE servers SET is_running = 1 WHERE id = ?').run(serverId);
      }, 3000);

      await logAudit(fastify.db, request.user.userId, 'SERVER_RESTARTED', 'server', serverId, null, request.ip, 'success');

      reply.send({ success: true, message: 'Server restarting' });
    } catch (error) {
      fastify.log.error(error);
      reply.status(500).send({ error: 'Server restart failed' });
    }
  });

  fastify.post('/api/servers/:serverId/kill', async (request, reply) => {
    try {
      await request.jwtVerify();
      const { serverId } = request.params;

      const server = fastify.db.prepare('SELECT * FROM servers WHERE id = ?').get(serverId);

      if (!server) {
        return reply.status(404).send({ error: 'Server not found' });
      }

      if (request.user.role !== 'admin' && server.user_id !== request.user.userId) {
        return reply.status(403).send({ error: 'Unauthorized' });
      }

      fastify.db.prepare('UPDATE servers SET is_running = 0 WHERE id = ?').run(serverId);
      await logAudit(fastify.db, request.user.userId, 'SERVER_KILLED', 'server', serverId, null, request.ip, 'success');

      reply.send({ success: true, message: 'Server killed' });
    } catch (error) {
      fastify.log.error(error);
      reply.status(500).send({ error: 'Server kill failed' });
    }
  });

  fastify.delete('/api/servers/:serverId', async (request, reply) => {
    try {
      await request.jwtVerify();
      const { serverId } = request.params;

      const server = fastify.db.prepare('SELECT * FROM servers WHERE id = ?').get(serverId);

      if (!server) {
        return reply.status(404).send({ error: 'Server not found' });
      }

      if (request.user.role !== 'admin' && server.user_id !== request.user.userId) {
        return reply.status(403).send({ error: 'Unauthorized' });
      }

      fastify.db.prepare('DELETE FROM server_logs WHERE server_id = ?').run(serverId);
      fastify.db.prepare('DELETE FROM backups WHERE server_id = ?').run(serverId);
      fastify.db.prepare('DELETE FROM backup_schedules WHERE server_id = ?').run(serverId);
      fastify.db.prepare('DELETE FROM statistics WHERE server_id = ?').run(serverId);
      fastify.db.prepare('DELETE FROM servers WHERE id = ?').run(serverId);

      await logAudit(fastify.db, request.user.userId, 'SERVER_DELETED', 'server', serverId, null, request.ip, 'success');

      reply.send({ success: true, message: 'Server deleted' });
    } catch (error) {
      fastify.log.error(error);
      reply.status(500).send({ error: 'Server deletion failed' });
    }
  });

  fastify.get('/api/servers/:serverId/logs', async (request, reply) => {
    try {
      await request.jwtVerify();
      const { serverId } = request.params;

      const server = fastify.db.prepare('SELECT * FROM servers WHERE id = ?').get(serverId);

      if (!server) {
        return reply.status(404).send({ error: 'Server not found' });
      }

      if (request.user.role !== 'admin' && server.user_id !== request.user.userId) {
        return reply.status(403).send({ error: 'Unauthorized' });
      }

      const logs = fastify.db.prepare('SELECT * FROM server_logs WHERE server_id = ? ORDER BY created_at DESC LIMIT 100').all(serverId);
      reply.send({ success: true, logs });
    } catch (error) {
      fastify.log.error(error);
      reply.status(500).send({ error: 'Failed to fetch logs' });
    }
  });

  fastify.post('/api/servers/:serverId/console', async (request, reply) => {
    try {
      await request.jwtVerify();
      const { serverId } = request.params;
      const { command } = request.body;

      const server = fastify.db.prepare('SELECT * FROM servers WHERE id = ?').get(serverId);

      if (!server) {
        return reply.status(404).send({ error: 'Server not found' });
      }

      if (request.user.role !== 'admin' && server.user_id !== request.user.userId) {
        return reply.status(403).send({ error: 'Unauthorized' });
      }

      const logId = fastify.db.prepare('INSERT INTO server_logs (server_id, log_type, message) VALUES (?, ?, ?)').run(serverId, 'command', command);

      await logAudit(fastify.db, request.user.userId, 'CONSOLE_COMMAND', 'server', serverId, { command }, request.ip, 'success');

      reply.send({ success: true, message: 'Command executed' });
    } catch (error) {
      fastify.log.error(error);
      reply.status(500).send({ error: 'Command execution failed' });
    }
  });
}
