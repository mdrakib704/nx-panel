export async function setupWebsocketRoutes(fastify) {
  fastify.register(async function (fastify) {
    fastify.get('/ws/console/:serverId', { websocket: true }, async (socket, request) => {
      try {
        const { serverId } = request.params;
        const token = request.query.token;

        if (!token) {
          socket.close(1008, 'Token required');
          return;
        }

        try {
          const decoded = fastify.jwt.verify(token);
          const server = fastify.db.prepare('SELECT * FROM servers WHERE id = ?').get(serverId);

          if (!server) {
            socket.close(1008, 'Server not found');
            return;
          }

          if (decoded.role !== 'admin' && server.user_id !== decoded.userId) {
            socket.close(1008, 'Unauthorized');
            return;
          }

          socket.on('message', (message) => {
            try {
              const data = JSON.parse(message);
              
              if (data.type === 'command') {
                fastify.db.prepare('INSERT INTO server_logs (server_id, log_type, message) VALUES (?, ?, ?)').run(serverId, 'console', data.command);
                socket.send(JSON.stringify({ type: 'ack', message: 'Command received' }));
              }
            } catch (error) {
              fastify.log.error('WebSocket message error:', error);
            }
          });

          socket.on('close', () => {
            fastify.log.info(`WebSocket closed for server ${serverId}`);
          });

          socket.send(JSON.stringify({ type: 'connected', message: 'Connected to console' }));
        } catch (error) {
          socket.close(1008, 'Invalid token');
        }
      } catch (error) {
        fastify.log.error('WebSocket error:', error);
        socket.close(1011, 'Server error');
      }
    });

    fastify.get('/ws/stats/:serverId', { websocket: true }, async (socket, request) => {
      try {
        const { serverId } = request.params;
        const token = request.query.token;

        if (!token) {
          socket.close(1008, 'Token required');
          return;
        }

        try {
          const decoded = fastify.jwt.verify(token);
          const server = fastify.db.prepare('SELECT * FROM servers WHERE id = ?').get(serverId);

          if (!server) {
            socket.close(1008, 'Server not found');
            return;
          }

          if (decoded.role !== 'admin' && server.user_id !== decoded.userId) {
            socket.close(1008, 'Unauthorized');
            return;
          }

          const interval = setInterval(() => {
            const stats = fastify.db.prepare('SELECT * FROM statistics WHERE server_id = ? ORDER BY created_at DESC LIMIT 1').get(serverId);
            socket.send(JSON.stringify({ type: 'stats', data: stats || {} }));
          }, 5000);

          socket.on('close', () => {
            clearInterval(interval);
            fastify.log.info(`Stats WebSocket closed for server ${serverId}`);
          });

          socket.send(JSON.stringify({ type: 'connected', message: 'Connected to stats' }));
        } catch (error) {
          socket.close(1008, 'Invalid token');
        }
      } catch (error) {
        fastify.log.error('WebSocket error:', error);
        socket.close(1011, 'Server error');
      }
    });
  });
}
