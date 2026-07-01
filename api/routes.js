export async function setupApiRoutes(fastify) {
  fastify.get('/api/health', async (request, reply) => {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: '1.0.0'
    };
  });

  fastify.get('/api/panel/info', async (request, reply) => {
    try {
      const config = JSON.parse(
        (await import('fs')).readFileSync('./config.json', 'utf-8')
      );
      
      const userCount = fastify.db.prepare('SELECT COUNT(*) as count FROM users').get();
      const serverCount = fastify.db.prepare('SELECT COUNT(*) as count FROM servers').get();
      const activeServers = fastify.db.prepare('SELECT COUNT(*) as count FROM servers WHERE is_running = 1').get();

      return {
        panelName: config.panelName,
        version: config.panelVersion,
        stats: {
          totalUsers: userCount.count,
          totalServers: serverCount.count,
          activeServers: activeServers.count,
          maintenanceMode: config.maintenanceMode
        }
      };
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Failed to get panel info' });
    }
  });
}
