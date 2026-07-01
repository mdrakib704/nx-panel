import { v4 as uuidv4 } from 'uuid';

export async function setupStatisticsRoutes(fastify) {
  fastify.get('/api/statistics/:serverId', async (request, reply) => {
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

      const stats = fastify.db.prepare('SELECT * FROM statistics WHERE server_id = ? ORDER BY created_at DESC LIMIT 1').get(serverId);
      reply.send({ success: true, stats: stats || {} });
    } catch (error) {
      fastify.log.error(error);
      reply.status(500).send({ error: 'Failed to fetch statistics' });
    }
  });

  fastify.get('/api/statistics/:serverId/history', async (request, reply) => {
    try {
      await request.jwtVerify();
      const { serverId } = request.params;
      const { hours = 24 } = request.query;

      const server = fastify.db.prepare('SELECT * FROM servers WHERE id = ?').get(serverId);

      if (!server) {
        return reply.status(404).send({ error: 'Server not found' });
      }

      if (request.user.role !== 'admin' && server.user_id !== request.user.userId) {
        return reply.status(403).send({ error: 'Unauthorized' });
      }

      const stats = fastify.db.prepare(`
        SELECT * FROM statistics 
        WHERE server_id = ? AND created_at > datetime('now', '-' || ? || ' hours')
        ORDER BY created_at DESC
      `).all(serverId, hours);

      reply.send({ success: true, stats });
    } catch (error) {
      fastify.log.error(error);
      reply.status(500).send({ error: 'Failed to fetch statistics history' });
    }
  });

  fastify.post('/api/statistics/:serverId/record', async (request, reply) => {
    try {
      const { serverId } = request.params;
      const { cpuUsage, ramUsage, diskUsage, networkIn, networkOut, onlinePlayers, tps, mspt } = request.body;

      const statId = uuidv4();
      fastify.db.prepare(`
        INSERT INTO statistics (id, server_id, cpu_usage, ram_usage, disk_usage, network_in, network_out, online_players, tps, mspt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(statId, serverId, cpuUsage, ramUsage, diskUsage, networkIn, networkOut, onlinePlayers, tps, mspt);

      reply.send({ success: true });
    } catch (error) {
      fastify.log.error(error);
      reply.status(500).send({ error: 'Failed to record statistics' });
    }
  });

  fastify.get('/api/statistics/aggregated/overview', async (request, reply) => {
    try {
      await request.jwtVerify();

      let serverIds;
      if (request.user.role === 'admin') {
        serverIds = fastify.db.prepare('SELECT id FROM servers').all().map(s => s.id);
      } else {
        serverIds = fastify.db.prepare('SELECT id FROM servers WHERE user_id = ?').all(request.user.userId).map(s => s.id);
      }

      if (serverIds.length === 0) {
        return reply.send({
          success: true,
          overview: {
            totalCpuUsage: 0,
            totalRamUsage: 0,
            totalDiskUsage: 0,
            totalOnlinePlayers: 0
          }
        });
      }

      const placeholders = serverIds.map(() => '?').join(',');
      const latestStats = fastify.db.prepare(`
        SELECT 
          AVG(cpu_usage) as avg_cpu,
          AVG(ram_usage) as avg_ram,
          AVG(disk_usage) as avg_disk,
          SUM(online_players) as total_players
        FROM statistics
        WHERE server_id IN (${placeholders}) AND created_at > datetime('now', '-1 hour')
      `).get(...serverIds);

      reply.send({
        success: true,
        overview: {
          totalCpuUsage: latestStats.avg_cpu || 0,
          totalRamUsage: latestStats.avg_ram || 0,
          totalDiskUsage: latestStats.avg_disk || 0,
          totalOnlinePlayers: latestStats.total_players || 0
        }
      });
    } catch (error) {
      fastify.log.error(error);
      reply.status(500).send({ error: 'Failed to fetch overview statistics' });
    }
  });
}
