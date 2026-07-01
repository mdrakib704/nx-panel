# NX Panel - Lightweight Minecraft Server Hosting Panel

A production-ready, lightweight Minecraft server hosting control panel built with Fastify, SQLite, and modern web technologies.

## Features

### Core Features
- **Server Management**: Create, manage, and control multiple Minecraft servers
- **User Management**: User registration, authentication, and role-based access control (Admin/User)
- **Coin System**: In-game currency for rewards, daily login bonuses, and shop purchases
- **Backup System**: Automatic and manual server backups with scheduling
- **Real-time Statistics**: CPU, RAM, disk, and player metrics with WebSocket streaming
- **Promo Codes**: Create and manage promotional codes for coin distribution
- **Admin Dashboard**: Comprehensive admin panel for user and server management
- **Audit Logging**: Track all user actions and system events
- **API-First Architecture**: RESTful API with JWT authentication

### Security Features
- JWT-based authentication
- Password hashing with bcrypt
- CORS protection
- Helmet.js security headers
- Rate limiting
- Input validation and sanitization
- Role-based access control
- Audit logging for compliance

## Quick Start

### Prerequisites
- Node.js 18+
- npm or yarn

### Installation

1. Clone the repository
```bash
git clone https://github.com/mdrakib704/nx-panel.git
cd nx-panel
```

2. Install dependencies
```bash
npm install
```

3. Configure the application
```bash
cp .env.example .env
```
Edit `config.json` with your settings.

4. Start the server
```bash
npm start
```

For development with auto-reload:
```bash
npm run dev
```

The panel will be available at `http://localhost:3000`

## Default Admin Account

Upon first run, a default admin account is created:
- **Username**: `admin`
- **Password**: `admin@123`
- **⚠️ IMPORTANT**: Change this password immediately in production!

## API Documentation

### Authentication

#### Register User
```http
POST /api/auth/register
Content-Type: application/json

{
  "username": "myuser",
  "email": "user@example.com",
  "password": "securepass123",
  "confirmPassword": "securepass123"
}
```

#### Login
```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "securepass123",
  "rememberMe": true
}
```

#### Get Current User
```http
GET /api/auth/me
Authorization: Bearer {token}
```

### Servers

#### List Servers
```http
GET /api/servers
Authorization: Bearer {token}
```

#### Create Server
```http
POST /api/servers
Authorization: Bearer {token}
Content-Type: application/json

{
  "name": "My Server",
  "version": "1.20.1",
  "serverType": "paper"
}
```

#### Start Server
```http
POST /api/servers/{serverId}/start
Authorization: Bearer {token}
```

#### Stop Server
```http
POST /api/servers/{serverId}/stop
Authorization: Bearer {token}
```

#### Restart Server
```http
POST /api/servers/{serverId}/restart
Authorization: Bearer {token}
```

#### Delete Server
```http
DELETE /api/servers/{serverId}
Authorization: Bearer {token}
```

### Coins

#### Get Balance
```http
GET /api/coins/balance
Authorization: Bearer {token}
```

#### Get History
```http
GET /api/coins/history
Authorization: Bearer {token}
```

#### Get Leaderboard
```http
GET /api/coins/leaderboard
```

#### Claim Daily Reward
```http
GET /api/coins/daily-reward
Authorization: Bearer {token}
```

#### Redeem Promo Code
```http
POST /api/coins/redeem-promo
Authorization: Bearer {token}
Content-Type: application/json

{
  "code": "PROMO2024"
}
```

### Backups

#### List Backups
```http
GET /api/backups/{serverId}
Authorization: Bearer {token}
```

#### Create Backup
```http
POST /api/backups/{serverId}/create
Authorization: Bearer {token}
Content-Type: application/json

{
  "name": "Pre-Event Backup"
}
```

#### Restore Backup
```http
POST /api/backups/{serverId}/restore
Authorization: Bearer {token}
Content-Type: application/json

{
  "backupId": "backup-uuid"
}
```

### Statistics

#### Get Latest Stats
```http
GET /api/statistics/{serverId}
Authorization: Bearer {token}
```

#### Get Stats History
```http
GET /api/statistics/{serverId}/history?hours=24
Authorization: Bearer {token}
```

### Admin Routes

#### List All Users
```http
GET /api/admin/users
Authorization: Bearer {admin-token}
```

#### Suspend User
```http
POST /api/admin/users/{userId}/suspend
Authorization: Bearer {admin-token}
Content-Type: application/json

{
  "reason": "Violation of ToS"
}
```

#### Add Coins to User
```http
POST /api/admin/users/{userId}/coins/add
Authorization: Bearer {admin-token}
Content-Type: application/json

{
  "amount": 100,
  "reason": "Reward for event"
}
```

#### Create Promo Code
```http
POST /api/admin/promo-codes
Authorization: Bearer {admin-token}
Content-Type: application/json

{
  "code": "SUMMER2024",
  "rewardCoins": 500,
  "maxUses": 100,
  "expiresIn": 30
}
```

#### Get Admin Statistics
```http
GET /api/admin/statistics/overview
Authorization: Bearer {admin-token}
```

## Project Structure

```
nx-panel/
├── server.js                 # Main Fastify server
├── config.json              # Configuration file
├── package.json             # Dependencies
├── database/
│   └── init.js             # Database initialization
├── auth/
│   └── routes.js           # Authentication endpoints
├── api/
│   ├── routes.js           # Core API routes
│   ├── server.js           # Server management
│   ├── user.js             # User management
│   ├── coin.js             # Coin system
│   ├── backup.js           # Backup management
│   ├── statistics.js       # Statistics tracking
│   └── admin.js            # Admin routes
├── websocket/
│   └── routes.js           # WebSocket handlers
├── utils/
│   ├── validation.js       # Input validation
│   ├── audit.js            # Audit logging
│   ├── rateLimit.js        # Rate limiting
│   └── logger.js           # Request logging
└── public/                  # Frontend files (to be added)
```

## Configuration

Edit `config.json` to customize:

```json
{
  "port": 3000,
  "jwtSecret": "your-secret-key",
  "maxServersPerUser": 1,
  "dailyRewardCoins": 10,
  "enableBackups": true,
  "enableCoins": true,
  "maintenanceMode": false
}
```

## Environment Variables

Create a `.env` file (copy from `.env.example`):

```env
NODE_ENV=production
PORT=3000
JWT_SECRET=your-super-secret-key
DATABASE_PATH=./database/panel.db
```

## Database

The panel uses SQLite3 with WAL mode for optimal performance. Database is automatically initialized on first run.

### Tables
- `users` - User accounts and profiles
- `sessions` - User sessions
- `servers` - Minecraft servers
- `server_logs` - Console and action logs
- `backups` - Server backups
- `backup_schedules` - Backup automation
- `coins` - Coin transactions
- `coin_packages` - Coin purchase packages
- `shop_items` - In-game shop items
- `user_purchases` - Purchase history
- `promo_codes` - Promotional codes
- `user_promo_uses` - Promo usage tracking
- `api_keys` - API key management
- `backgrounds` - UI backgrounds/videos
- `ads` - Advertisement content
- `audit_logs` - Action audit trail
- `announcements` - System announcements
- `statistics` - Server performance metrics

## WebSocket Connections

### Console Connection
```javascript
const socket = new WebSocket('ws://localhost:3000/ws/console/{serverId}?token={jwt-token}');
socket.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log(data);
};
```

### Statistics Stream
```javascript
const socket = new WebSocket('ws://localhost:3000/ws/stats/{serverId}?token={jwt-token}');
socket.onmessage = (event) => {
  const stats = JSON.parse(event.data);
  console.log(stats); // CPU, RAM, disk, players, etc.
};
```

## Security Considerations

1. **Change Default Password**: Always change the default admin password in production
2. **Use HTTPS**: Deploy with SSL/TLS certificates
3. **JWT Secret**: Use a strong, randomly generated JWT secret
4. **Rate Limiting**: Configured to prevent abuse
5. **Input Validation**: All inputs are validated and sanitized
6. **Audit Logging**: All actions are logged for compliance
7. **CORS**: Configure allowed origins in `config.json`

## Performance

- SQLite with WAL mode for concurrent access
- Connection pooling ready
- Efficient query indexing
- Rate limiting to prevent abuse
- Gzip compression enabled
- Static file caching

## Deployment

### Docker (Coming Soon)
A Dockerfile will be provided for containerized deployment.

### Using PM2
```bash
npm install -g pm2
pm2 start server.js --name "nx-panel"
pm2 save
pm2 startup
```

### Using Systemd
Create `/etc/systemd/system/nx-panel.service`:
```ini
[Unit]
Description=NX Panel
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/path/to/nx-panel
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

## Troubleshooting

### Database Locked
If you see "database is locked" errors, ensure only one instance is running.

### Port Already in Use
```bash
lsof -i :3000
kill -9 <PID>
```

### JWT Errors
Ensure the JWT secret in `.env` matches `config.json`.

## Contributing

Contributions are welcome! Please follow these guidelines:
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

MIT License - See LICENSE file for details

## Support

For issues, questions, or suggestions:
- Open an issue on GitHub
- Check existing documentation
- Review the API documentation above

## Roadmap

- [ ] Frontend dashboard
- [ ] Docker support
- [ ] PostgreSQL support
- [ ] Advanced server management
- [ ] Plugin system
- [ ] Mobile app
- [ ] Multi-language support

---

**NX Panel** - Empowering Minecraft server hosting management
