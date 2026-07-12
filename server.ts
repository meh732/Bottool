import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import { loadDb, updateSettings, getSettings, getLogs, getBotStatus, clearLogs } from './src/db.js';
import { startBotEngine, stopBotEngine, handleTelegramUpdate } from './src/telegramBot.js';

dotenv.config();

// Resolve paths for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function bootstrap() {
  // Load database
  loadDb();

  // Try to start Bot Engine on startup if it was enabled
  const currentSettings = getSettings();
  if (currentSettings.botEnabled && currentSettings.botToken) {
    console.log('Bootstrapping Telegram Bot on startup...');
    startBotEngine();
  }

  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // --- API Routes ---

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

  // Bind to 0.0.0.0 and port 3000
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running at http://localhost:${PORT}`);
  });
}

bootstrap().catch(err => {
  console.error('Fatal bootstrapping error:', err);
});
