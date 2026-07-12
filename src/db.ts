import fs from 'fs';
import path from 'path';
import { BotSettings, ProcessedLog, DashboardData, UserBotSettings } from './types.js';

const DB_FILE = path.join(process.cwd(), 'db.json');

const defaultSettings: BotSettings = {
  botToken: '',
  fileNamePattern: '@MyChannel_VPN',
  captionText: '✨ Your Customized VPN Config\n\n📢 Join our channel for more fast configs:\n👉 @MyChannel',
  adText: '@MyChannel',
  botEnabled: false,
  webhookActive: false
};

const defaultData: DashboardData = {
  settings: defaultSettings,
  status: {
    isRunning: false,
    username: '',
    name: '',
    webhookUrl: '',
  },
  logs: [],
  userSettings: {}
};

// Memory Cache
let cache: DashboardData = { ...defaultData };

// Load data from file on startup
export function loadDb(): DashboardData {
  try {
    if (fs.existsSync(DB_FILE)) {
      const dataStr = fs.readFileSync(DB_FILE, 'utf8');
      const loaded = JSON.parse(dataStr);
      
      // Merge with defaults to prevent missing properties
      cache = {
        settings: { ...defaultSettings, ...loaded.settings },
        status: { ...defaultData.status, ...loaded.status },
        logs: Array.isArray(loaded.logs) ? loaded.logs : [],
        userSettings: loaded.userSettings || {}
      };
    } else {
      cache = { ...defaultData };
      saveDb(cache);
    }
  } catch (err) {
    console.error('Error loading db.json, using defaults:', err);
    cache = { ...defaultData };
  }
  return cache;
}

// Save data to file
export function saveDb(data: DashboardData): void {
  try {
    cache = data;
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('Error saving db.json:', err);
  }
}

// Helper to get settings
export function getSettings(): BotSettings {
  return cache.settings;
}

// Helper to update settings
export function updateSettings(newSettings: Partial<BotSettings>): BotSettings {
  cache.settings = { ...cache.settings, ...newSettings };
  saveDb(cache);
  return cache.settings;
}

// Helper to get user settings
export function getUserSettings(userId: string | number): UserBotSettings {
  const uid = String(userId);
  if (!cache.userSettings) {
    cache.userSettings = {};
  }
  if (!cache.userSettings[uid]) {
    cache.userSettings[uid] = {
      fileNamePattern: cache.settings.fileNamePattern,
      captionText: cache.settings.captionText,
      adText: cache.settings.adText
    };
    saveDb(cache);
  }
  return cache.userSettings[uid];
}

// Helper to update user settings
export function updateUserSettings(userId: string | number, newSettings: Partial<UserBotSettings>): UserBotSettings {
  const uid = String(userId);
  if (!cache.userSettings) {
    cache.userSettings = {};
  }
  const current = getUserSettings(userId);
  cache.userSettings[uid] = {
    ...current,
    ...newSettings
  };
  saveDb(cache);
  return cache.userSettings[uid];
}

// Helper to add log
export function addLog(log: Omit<ProcessedLog, 'id' | 'timestamp'>): ProcessedLog {
  const fullLog: ProcessedLog = {
    ...log,
    id: Math.random().toString(36).substring(2, 11),
    timestamp: new Date().toISOString()
  };
  
  // Prepend log, limit to last 200 logs to prevent memory bloat
  cache.logs = [fullLog, ...cache.logs].slice(0, 200);
  saveDb(cache);
  return fullLog;
}

// Clear all logs
export function clearLogs(): void {
  cache.logs = [];
  saveDb(cache);
}

// Helper to get all logs
export function getLogs(): ProcessedLog[] {
  return cache.logs;
}

// Helper to get status
export function getBotStatus() {
  return cache.status;
}

// Helper to update status
export function updateBotStatus(statusUpdate: Partial<typeof cache.status>) {
  cache.status = { ...cache.status, ...statusUpdate };
  saveDb(cache);
  return cache.status;
}
