import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import { loadDb, updateSettings, getSettings, getLogs, getBotStatus, clearLogs } from './src/db.js';
import { startBotEngine, stopBotEngine, handleTelegramUpdate } from './src/telegramBot.js';
import { createBackup, restoreBackup, listBackups, deleteBackup, initAutoBackup } from './src/backup.js';

dotenv.config();

// Resolve paths for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function bootstrap() {
  // Load database
  loadDb();

  // Initialize auto backups on startup
  initAutoBackup();

  // Try to start Bot Engine on startup if it was enabled
  const currentSettings = getSettings();
  if (currentSettings.botEnabled && currentSettings.botToken) {
    console.log('Bootstrapping Telegram Bot on startup...');
    startBotEngine();
  }

  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

  app.use(express.json());

  // --- Auth Middleware for APIs ---
  app.use((req, res, next) => {
    // Allow public routes
    if (
      req.path === '/api/login' ||
      req.path === '/api/health' ||
      req.path === '/api/telegram-webhook' ||
      !req.path.startsWith('/api')
    ) {
      return next();
    }

    const authHeader = req.headers.authorization;
    const settings = getSettings();
    const expectedToken = Buffer.from(`${settings.adminUsername || 'admin'}:${settings.adminPassword || 'admin'}`).toString('base64');

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      if (token === expectedToken) {
        return next();
      }
    }

    return res.status(401).json({ success: false, error: 'Unauthorized access. Please login first.' });
  });

  // --- API Routes ---

  // Admin Login Endpoint
  app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const settings = getSettings();
    const adminUser = settings.adminUsername || 'admin';
    const adminPass = settings.adminPassword || 'admin';

    if (username === adminUser && password === adminPass) {
      const token = Buffer.from(`${username}:${password}`).toString('base64');
      res.json({ success: true, token });
    } else {
      res.status(401).json({ success: false, error: 'نام کاربری یا رمز عبور نامعتبر است.' });
    }
  });

  // Get status, settings, logs
  app.get('/api/dashboard', (req, res) => {
    res.json({
      settings: getSettings(),
      status: getBotStatus(),
      logs: getLogs()
    });
  });

  // Save/Update settings
  app.post('/api/settings', async (req, res) => {
    try {
      const oldSettings = getSettings();
      const updated = updateSettings(req.body);
      
      // If auto-backup settings changed, re-init auto backup
      if (
        oldSettings.autoBackupEnabled !== updated.autoBackupEnabled ||
        oldSettings.backupIntervalHours !== updated.backupIntervalHours ||
        oldSettings.backupPassword !== updated.backupPassword
      ) {
        initAutoBackup();
      }

      // If token changed or enabled/disabled status changed, trigger restart
      if (
        oldSettings.botToken !== updated.botToken ||
        oldSettings.botEnabled !== updated.botEnabled
      ) {
        if (updated.botEnabled && updated.botToken) {
          console.log('Settings changed: restarting bot engine.');
          await startBotEngine();
        } else {
          console.log('Settings changed: stopping bot engine.');
          await stopBotEngine();
        }
      }
      
      res.json({ success: true, settings: updated, status: getBotStatus() });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Clear logs
  app.post('/api/logs/clear', (req, res) => {
    clearLogs();
    res.json({ success: true, logs: [] });
  });

  // Manual Trigger Force Start/Stop Bot Engine
  app.post('/api/bot/toggle', async (req, res) => {
    const { enabled } = req.body;
    try {
      const settings = updateSettings({ botEnabled: enabled });
      if (enabled) {
        await startBotEngine();
      } else {
        await stopBotEngine();
      }
      res.json({ success: true, settings, status: getBotStatus() });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // --- Backup APIs ---

  // Get all backups
  app.get('/api/backups', (req, res) => {
    res.json({ success: true, backups: listBackups() });
  });

  // Create backup manually
  app.post('/api/backups/create', (req, res) => {
    const result = createBackup();
    if (result.success) {
      res.json({ success: true, filename: result.filename, backups: listBackups() });
    } else {
      res.status(500).json({ success: false, error: result.error });
    }
  });

  // Delete a backup
  app.post('/api/backups/delete', (req, res) => {
    const { filename } = req.body;
    const deleted = deleteBackup(filename);
    if (deleted) {
      res.json({ success: true, backups: listBackups() });
    } else {
      res.status(400).json({ success: false, error: 'حذف فایل پشتیبان ناموفق بود.' });
    }
  });

  // Restore database from backup
  app.post('/api/backups/restore', (req, res) => {
    const { filename, password } = req.body;
    const result = restoreBackup(filename, password);
    if (result.success) {
      // Re-initialize auto backups after restore since settings could have changed
      initAutoBackup();
      res.json({ success: true });
    } else {
      res.status(400).json({ success: false, error: result.error });
    }
  });

  // Webhook Receiver Endpoint for Telegram
  app.post('/api/telegram-webhook', async (req, res) => {
    try {
      await handleTelegramUpdate(req.body);
      res.sendStatus(200);
    } catch (err) {
      console.error('Error handling Telegram Webhook update:', err);
      res.sendStatus(500);
    }
  });

  // System Health check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', botRunning: getBotStatus().isRunning });
  });

  // --- Frontend Assets Routing ---

  if (process.env.NODE_ENV !== 'production') {
    // In development mode, mount Vite middleware
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // In production mode, serve static assets
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Bind to 0.0.0.0 and dynamic port (or port 3000)
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running at http://localhost:${PORT}`);
  });
}

bootstrap().catch(err => {
  console.error('Fatal bootstrapping error:', err);
});
