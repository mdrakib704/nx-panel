export async function initializeDatabase(db) {
  try {
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA synchronous = NORMAL');
    
    db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        role TEXT DEFAULT 'user',
        is_active BOOLEAN DEFAULT 1,
        is_suspended BOOLEAN DEFAULT 0,
        coins INTEGER DEFAULT 0,
        two_factor_enabled BOOLEAN DEFAULT 0,
        two_factor_secret TEXT,
        last_login DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        ip_address TEXT,
        user_agent TEXT,
        refresh_token TEXT,
        expires_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    
    db.exec(`
      CREATE TABLE IF NOT EXISTS servers (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        version TEXT DEFAULT 'latest',
        server_type TEXT DEFAULT 'paper',
        ram_mb INTEGER DEFAULT 3072,
        cpu_percent INTEGER DEFAULT 100,
        storage_gb INTEGER DEFAULT 10,
        is_running BOOLEAN DEFAULT 0,
        is_suspended BOOLEAN DEFAULT 0,
        port INTEGER,
        motd TEXT,
        max_players INTEGER DEFAULT 20,
        gamemode TEXT DEFAULT 'survival',
        difficulty TEXT DEFAULT 'normal',
        pvp BOOLEAN DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    
    db.exec(`
      CREATE TABLE IF NOT EXISTS server_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        server_id TEXT NOT NULL,
        log_type TEXT,
        message TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
      )
    `);
    
    db.exec(`
      CREATE TABLE IF NOT EXISTS backups (
        id TEXT PRIMARY KEY,
        server_id TEXT NOT NULL,
        name TEXT NOT NULL,
        file_path TEXT NOT NULL,
        file_size INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
      )
    `);
    
    db.exec(`
      CREATE TABLE IF NOT EXISTS backup_schedules (
        id TEXT PRIMARY KEY,
        server_id TEXT NOT NULL,
        interval_hours INTEGER DEFAULT 24,
        is_enabled BOOLEAN DEFAULT 1,
        last_backup DATETIME,
        next_backup DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
      )
    `);
    
    db.exec(`
      CREATE TABLE IF NOT EXISTS coins (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        amount INTEGER NOT NULL,
        transaction_type TEXT,
        description TEXT,
        reference_id TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    
    db.exec(`
      CREATE TABLE IF NOT EXISTS coin_packages (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        coins INTEGER NOT NULL,
        price REAL NOT NULL,
        is_active BOOLEAN DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    db.exec(`
      CREATE TABLE IF NOT EXISTS shop_items (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        item_type TEXT,
        cost_coins INTEGER NOT NULL,
        benefit_value INTEGER,
        benefit_type TEXT,
        is_active BOOLEAN DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    db.exec(`
      CREATE TABLE IF NOT EXISTS user_purchases (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        shop_item_id TEXT NOT NULL,
        quantity INTEGER DEFAULT 1,
        total_cost INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (shop_item_id) REFERENCES shop_items(id)
      )
    `);
    
    db.exec(`
      CREATE TABLE IF NOT EXISTS promo_codes (
        id TEXT PRIMARY KEY,
        code TEXT NOT NULL UNIQUE,
        reward_coins INTEGER,
        reward_type TEXT,
        max_uses INTEGER,
        current_uses INTEGER DEFAULT 0,
        is_active BOOLEAN DEFAULT 1,
        expires_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    db.exec(`
      CREATE TABLE IF NOT EXISTS user_promo_uses (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        promo_code_id TEXT NOT NULL,
        used_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (promo_code_id) REFERENCES promo_codes(id)
      )
    `);
    
    db.exec(`
      CREATE TABLE IF NOT EXISTS api_keys (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        key_hash TEXT NOT NULL UNIQUE,
        name TEXT,
        permissions TEXT,
        is_active BOOLEAN DEFAULT 1,
        last_used DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    
    db.exec(`
      CREATE TABLE IF NOT EXISTS backgrounds (
        id TEXT PRIMARY KEY,
        file_name TEXT NOT NULL,
        file_path TEXT NOT NULL,
        video_format TEXT,
        is_active BOOLEAN DEFAULT 1,
        blur_level INTEGER DEFAULT 0,
        brightness_level INTEGER DEFAULT 100,
        opacity_level REAL DEFAULT 1.0,
        loop BOOLEAN DEFAULT 1,
        mute BOOLEAN DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    db.exec(`
      CREATE TABLE IF NOT EXISTS ads (
        id TEXT PRIMARY KEY,
        ad_type TEXT,
        content TEXT,
        file_path TEXT,
        target_url TEXT,
        reward_coins INTEGER DEFAULT 0,
        is_active BOOLEAN DEFAULT 1,
        frequency_minutes INTEGER DEFAULT 30,
        schedule_start DATETIME,
        schedule_end DATETIME,
        click_count INTEGER DEFAULT 0,
        view_count INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    db.exec(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        action TEXT NOT NULL,
        resource_type TEXT,
        resource_id TEXT,
        changes TEXT,
        ip_address TEXT,
        status TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    db.exec(`
      CREATE TABLE IF NOT EXISTS announcements (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        is_active BOOLEAN DEFAULT 1,
        priority TEXT DEFAULT 'normal',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME
      )
    `);
    
    db.exec(`
      CREATE TABLE IF NOT EXISTS statistics (
        id TEXT PRIMARY KEY,
        server_id TEXT,
        cpu_usage REAL,
        ram_usage REAL,
        disk_usage REAL,
        network_in INTEGER,
        network_out INTEGER,
        online_players INTEGER,
        tps REAL,
        mspt REAL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
      )
    `);
    
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)
    `);
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_servers_user_id ON servers(user_id)
    `);
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)
    `);
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_coins_user_id ON coins(user_id)
    `);
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id)
    `);
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_statistics_server_id ON statistics(server_id)
    `);
    
    const adminCount = db.prepare('SELECT COUNT(*) as count FROM users WHERE role = ?').get('admin');
    
    if (adminCount.count === 0) {
      const bcrypt = await import('bcrypt');
      const { v4: uuidv4 } = await import('uuid');
      
      const adminPassword = 'admin@123';
      const hashedPassword = await bcrypt.hash(adminPassword, 10);
      
      const adminId = uuidv4();
      db.prepare(`
        INSERT INTO users (id, username, email, password_hash, role, coins)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(adminId, 'admin', 'admin@nxpanel.local', hashedPassword, 'admin', 1000);
      
      console.log('✓ Default admin account created');
      console.log('  Username: admin');
      console.log('  Password: admin@123');
      console.log('  ⚠️  Change password immediately in production!');
    }
    
    console.log('✓ Database initialized successfully');
  } catch (error) {
    console.error('✗ Database initialization failed:', error);
    throw error;
  }
}
