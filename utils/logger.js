import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const logsDir = path.join(__dirname, '..', 'logs');

if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

export async function requestLogger(request, reply) {
  try {
    const timestamp = new Date().toISOString();
    const logEntry = `${timestamp} - ${request.method} ${request.url} - ${reply.statusCode} - ${request.ip}\n`;
    
    const logFile = path.join(logsDir, `access-${new Date().toISOString().split('T')[0]}.log`);
    fs.appendFileSync(logFile, logEntry);
  } catch (error) {
    console.error('Logger error:', error);
  }
}

export function getRecentLogs(days = 7) {
  const logs = [];
  const now = new Date();
  
  for (let i = 0; i < days; i++) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];
    const logFile = path.join(logsDir, `access-${dateStr}.log`);
    
    if (fs.existsSync(logFile)) {
      const content = fs.readFileSync(logFile, 'utf-8');
      logs.push(...content.split('\n').filter(line => line.trim()));
    }
  }
  
  return logs.slice(-100);
}
