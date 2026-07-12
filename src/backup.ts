import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { getSettings, loadDb, saveDb } from './db.js';

function findProjectRoot(): string {
  let dir = '';
  try {
    const filename = fileURLToPath(import.meta.url);
    dir = path.dirname(filename);
  } catch {
    dir = __dirname;
  }

  while (dir && dir !== path.parse(dir).root) {
    if (fs.existsSync(path.join(dir, 'package.json'))) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  return process.cwd();
}

const PROJECT_ROOT = findProjectRoot();
const BACKUPS_DIR = path.join(PROJECT_ROOT, 'backups');
const DB_FILE = path.join(PROJECT_ROOT, 'db.json');

// Make sure backups directory exists
if (!fs.existsSync(BACKUPS_DIR)) {
  fs.mkdirSync(BACKUPS_DIR, { recursive: true });
}

// Encrypt text with password
export function encryptText(text: string, keyString: string): string {
  const key = crypto.createHash('sha256').update(keyString).digest();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

// Decrypt text with password
export function decryptText(encryptedText: string, keyString: string): string {
  const parts = encryptedText.split(':');
  if (parts.length !== 2) throw new Error('Invalid backup data format');
  const iv = Buffer.from(parts[0], 'hex');
  const encrypted = parts[1];
  const key = crypto.createHash('sha256').update(keyString).digest();
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// Create backup file
export function createBackup(customPassword?: string): { success: boolean; filename: string; error?: string } {
  try {
    const settings = getSettings();
    const password = customPassword || settings.backupPassword || 'BackupSecurePass123';
    
    if (!fs.existsSync(DB_FILE)) {
      return { success: false, filename: '', error: 'Database file not found' };
    }

    const dbContent = fs.readFileSync(DB_FILE, 'utf8');
    const encrypted = encryptText(dbContent, password);

    // Generate filename with timestamp
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const filename = `backup-${year}-${month}-${day}-${hours}-${minutes}-${seconds}.enc`;

    const filepath = path.join(BACKUPS_DIR, filename);
    fs.writeFileSync(filepath, encrypted, 'utf8');

    console.log(`Backup created successfully: ${filename}`);
    return { success: true, filename };
  } catch (err: any) {
    console.error('Failed to create backup:', err);
    return { success: false, filename: '', error: err.message };
  }
}

// Restore database from backup file
export function restoreBackup(filename: string, passwordToUse: string): { success: boolean; error?: string } {
  try {
    const filepath = path.join(BACKUPS_DIR, filename);
    if (!fs.existsSync(filepath)) {
      return { success: false, error: 'Backup file not found' };
    }

    const encryptedContent = fs.readFileSync(filepath, 'utf8');
    const decryptedJson = decryptText(encryptedContent, passwordToUse);

    // Validate if it is valid JSON
    const parsed = JSON.parse(decryptedJson);
    if (!parsed.settings || !parsed.logs) {
      return { success: false, error: 'Backup format is invalid (missing settings or logs)' };
    }

    // Save restored file as db.json
    fs.writeFileSync(DB_FILE, JSON.stringify(parsed, null, 2), 'utf8');
    
    // Reload database in memory cache
    loadDb();

    console.log(`Database restored successfully from backup: ${filename}`);
    return { success: true };
  } catch (err: any) {
    console.error('Failed to restore backup:', err);
    return { success: false, error: 'رمز عبور نامعتبر است یا ساختار فایل پشتیبان خراب شده است.' };
  }
}

// List all backup files
export function listBackups(): { filename: string; size: number; date: string }[] {
  try {
    if (!fs.existsSync(BACKUPS_DIR)) {
      return [];
    }

    const files = fs.readdirSync(BACKUPS_DIR);
    return files
      .filter(f => f.startsWith('backup-') && f.endsWith('.enc'))
      .map(f => {
        const filepath = path.join(BACKUPS_DIR, f);
        const stats = fs.statSync(filepath);
        
        // Parse date from filename e.g. backup-2026-07-12-04-52-39.enc
        const nameParts = f.replace('backup-', '').replace('.enc', '').split('-');
        let dateString = stats.mtime.toISOString();
        if (nameParts.length >= 6) {
          const [year, month, day, hour, min, sec] = nameParts;
          dateString = `${year}/${month}/${day} ${hour}:${min}:${sec}`;
        }

        return {
          filename: f,
          size: stats.size,
          date: dateString
        };
      })
      .sort((a, b) => b.filename.localeCompare(a.filename)); // Sort newest first
  } catch (err) {
    console.error('Failed to list backups:', err);
    return [];
  }
}

// Delete backup file
export function deleteBackup(filename: string): boolean {
  try {
    const filepath = path.join(BACKUPS_DIR, filename);
    if (fs.existsSync(filepath)) {
      fs.unlinkSync(filepath);
      return true;
    }
    return false;
  } catch (err) {
    console.error('Failed to delete backup file:', err);
    return false;
  }
}

// Timer management for auto backups
let autoBackupInterval: NodeJS.Timeout | null = null;

export function initAutoBackup(): void {
  // Clear existing interval
  if (autoBackupInterval) {
    clearInterval(autoBackupInterval);
    autoBackupInterval = null;
  }

  const settings = getSettings();
  if (settings.autoBackupEnabled !== false) {
    const hours = settings.backupIntervalHours || 2;
    const ms = hours * 60 * 60 * 1000;
    
    console.log(`Automatic Backups scheduled to run every ${hours} hours.`);
    
    autoBackupInterval = setInterval(() => {
      console.log('Running scheduled automatic backup...');
      createBackup();
    }, ms);
  } else {
    console.log('Automatic Backups are disabled in settings.');
  }
}
