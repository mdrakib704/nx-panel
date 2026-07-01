import { v4 as uuidv4 } from 'uuid';

export async function logAudit(db, userId, action, resourceType, resourceId, changes, ipAddress, status) {
  try {
    const auditId = uuidv4();
    db.prepare(`
      INSERT INTO audit_logs (id, user_id, action, resource_type, resource_id, changes, ip_address, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(auditId, userId, action, resourceType, resourceId, changes ? JSON.stringify(changes) : null, ipAddress, status);
  } catch (error) {
    console.error('Audit log error:', error);
  }
}

export function getAuditLogs(db, filters = {}) {
  let query = 'SELECT * FROM audit_logs WHERE 1=1';
  const params = [];

  if (filters.userId) {
    query += ' AND user_id = ?';
    params.push(filters.userId);
  }

  if (filters.action) {
    query += ' AND action = ?';
    params.push(filters.action);
  }

  if (filters.status) {
    query += ' AND status = ?';
    params.push(filters.status);
  }

  query += ' ORDER BY created_at DESC LIMIT 100';

  return db.prepare(query).all(...params);
}
