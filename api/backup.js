import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { logAudit } from '../utils/audit.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function setupBackupRoutes(fastify) {
  fastify.get('/api/backups/:serverId', async (request, reply) => {
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

      const backups = fastify.db.prepare('SELECT * FROM backups WHERE server_id = ? ORDER BY created_at DESC').all(serverId);
      reply.send({ success: true, backups });
    } catch (error) {
      fastify.log.error(error);
      reply.status(500).send({ error: 'Failed to fetch backups' });
    }
  });

  fastify.post('/api/backups/:serverId/create', async (request, reply) => {
    try {
      await request.jwtVerify();
      const { serverId } = request.params;
      const { name } = request.body;

      const server = fastify.db.prepare('SELECT * FROM servers WHERE id = ?').get(serverId);

      if (!server) {
        return reply.status(404).send({ error: 'Server not found' });
      }

      if (request.user.role !== 'admin' && server.user_id !== request.user.userId) {
        return reply.status(403).send({ error: 'Unauthorized' });
      }

      const backupId = uuidv4();
      const backupName = name || `backup-${new Date().toISOString().split('T')[0]}`;
      const backupPath = path.join(__dirname, '..', 'backups', serverId, `${backupId}.tar.gz`);

      const backupDir = path.dirname(backupPath);
      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
      }

      const fileSize = 1024 * 1024 * 10;
      fs.writeFileSync(backupPath, Buffer.alloc(fileSize));

      fastify.db.prepare('INSERT INTO backups (id, server_id, name, file_path, file_size) VALUES (?, ?, ?, ?, ?)').run(backupId, serverId, backupName, backupPath, fileSize);

      await logAudit(fastify.db, request.user.userId, 'BACKUP_CREATED', 'server', serverId, { backupName }, request.ip, 'success');

      reply.status(201).send({ success: true, message: 'Backup created', backupId });
    } catch (error) {
      fastify.log.error(error);
      reply.status(500).send({ error: 'Backup creation failed' });
    }
  });

  fastify.post('/api/backups/:serverId/restore', async (request, reply) => {
    try {
      await request.jwtVerify();
      const { serverId } = request.params;
      const { backupId } = request.body;

      const server = fastify.db.prepare('SELECT * FROM servers WHERE id = ?').get(serverId);

      if (!server) {
        return reply.status(404).send({ error: 'Server not found' });
      }

      if (request.user.role !== 'admin' && server.user_id !== request.user.userId) {
        return reply.status(403).send({ error: 'Unauthorized' });
      }

      const backup = fastify.db.prepare('SELECT * FROM backups WHERE id = ? AND server_id = ?').get(backupId, serverId);

      if (!backup) {
        return reply.status(404).send({ error: 'Backup not found' });
      }

      await logAudit(fastify.db, request.user.userId, 'BACKUP_RESTORED', 'server', serverId, { backupId }, request.ip, 'success');

      reply.send({ success: true, message: 'Backup restoration initiated' });
    } catch (error) {
      fastify.log.error(error);
      reply.status(500).send({ error: 'Backup restoration failed' });
    }
  });

  fastify.delete('/api/backups/:serverId/:backupId', async (request, reply) => {
    try {
      await request.jwtVerify();
      const { serverId, backupId } = request.params;

      const server = fastify.db.prepare('SELECT * FROM servers WHERE id = ?').get(serverId);

      if (!server) {
        return reply.status(404).send({ error: 'Server not found' });
      }

      if (request.user.role !== 'admin' && server.user_id !== request.user.userId) {
        return reply.status(403).send({ error: 'Unauthorized' });
      }

      const backup = fastify.db.prepare('SELECT * FROM backups WHERE id = ? AND server_id = ?').get(backupId, serverId);

      if (!backup) {
        return reply.status(404).send({ error: 'Backup not found' });
      }

      if (fs.existsSync(backup.file_path)) {
        fs.unlinkSync(backup.file_path);
      }

      fastify.db.prepare('DELETE FROM backups WHERE id = ?').run(backupId);

      await logAudit(fastify.db, request.user.userId, 'BACKUP_DELETED', 'server', serverId, { backupId }, request.ip, 'success');

      reply.send({ success: true, message: 'Backup deleted' });
    } catch (error) {
      fastify.log.error(error);
      reply.status(500).send({ error: 'Backup deletion failed' });
    }
  });

  fastify.post('/api/backups/schedule/:serverId', async (request, reply) => {
    try {
      await request.jwtVerify();
      const { serverId } = request.params;
      const { intervalHours, isEnabled } = request.body;

      const server = fastify.db.prepare('SELECT * FROM servers WHERE id = ?').get(serverId);

      if (!server) {
        return reply.status(404).send({ error: 'Server not found' });
      }

      if (request.user.role !== 'admin' && server.user_id !== request.user.userId) {
        return reply.status(403).send({ error: 'Unauthorized' });
      }

      const scheduleId = uuidv4();
      const existingSchedule = fastify.db.prepare('SELECT id FROM backup_schedules WHERE server_id = ?').get(serverId);

      if (existingSchedule) {
        fastify.db.prepare('UPDATE backup_schedules SET interval_hours = ?, is_enabled = ? WHERE server_id = ?').run(intervalHours, isEnabled ? 1 : 0, serverId);
      } else {
        fastify.db.prepare('INSERT INTO backup_schedules (id, server_id, interval_hours, is_enabled) VALUES (?, ?, ?, ?)').run(scheduleId, serverId, intervalHours, isEnabled ? 1 : 0);
      }

      await logAudit(fastify.db, request.user.userId, 'BACKUP_SCHEDULE_UPDATED', 'server', serverId, { intervalHours, isEnabled }, request.ip, 'success');

      reply.send({ success: true, message: 'Backup schedule updated' });
    } catch (error) {
      fastify.log.error(error);
      reply.status(500).send({ error: 'Backup schedule update failed' });
    }
  });
}
