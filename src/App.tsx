import { useState, useEffect, useRef, FormEvent, DragEvent, ChangeEvent } from 'react';
import { 
  Bot, 
  Settings, 
  Shield, 
  FileCode, 
  History, 
  Download, 
  Upload, 
  Play, 
  Square, 
  Trash2, 
  Copy, 
  Check, 
  Eye, 
  EyeOff, 
  HelpCircle, 
  Sparkles,
  RefreshCw,
  AlertCircle,
  Lock,
  Unlock,
  Database,
  Key
} from 'lucide-react';
import { BotSettings, ProcessedLog, BotStatus } from './types';
import { customizeConfig } from './configParser';

export default function App() {
  // Navigation
  const [activeTab, setActiveTab] = useState<'dashboard' | 'settings' | 'sandbox' | 'logs' | 'backups'>('dashboard');

  // Authentication States
  const [authToken, setAuthToken] = useState<string | null>(localStorage.getItem('vpn_admin_token'));
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);

  // Backups States
  const [backups, setBackups] = useState<{ filename: string; size: number; date: string }[]>([]);
  const [backupPasswordToRestore, setBackupPasswordToRestore] = useState('');
  const [selectedBackupForRestore, setSelectedBackupForRestore] = useState<string | null>(null);
  const [backupLoading, setBackupLoading] = useState(false);
  const [backupSuccess, setBackupSuccess] = useState<string | null>(null);
  const [backupError, setBackupError] = useState<string | null>(null);

  // Backend States
  const [settings, setSettings] = useState<BotSettings>({
    botToken: '',
    fileNamePattern: '@MyChannel_VPN',
    captionText: '✨ Your Customized VPN Config\n\n📢 Join our channel for more fast configs:\n👉 @MyChannel',
    adText: '@MyChannel',
    botEnabled: false,
    webhookActive: false,
    adminUsername: 'admin',
    adminPassword: 'admin',
    backupPassword: 'BackupSecurePass123',
    backupIntervalHours: 2,
    autoBackupEnabled: true
  });
  
  const [botStatus, setBotStatus] = useState<BotStatus>({
    isRunning: false,
    username: '',
    name: '',
    webhookUrl: '',
  });

  const [logs, setLogs] = useState<ProcessedLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [saveLoading, setSaveLoading] = useState(false);
  const [tokenVisible, setTokenVisible] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Sandbox Client States
  const [sandboxText, setSandboxText] = useState('');
  const [sandboxResult, setSandboxResult] = useState<{
    content: string;
    fileName: string;
    fileType: string;
    modified: boolean;
  } | null>(null);
  const [sandboxFile, setSandboxFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Clipboard copies
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Authenticated fetch helper
  const apiFetch = async (url: string, options: RequestInit = {}) => {
    const headers = {
      ...options.headers,
      'Authorization': authToken ? `Bearer ${authToken}` : '',
    };
    const res = await fetch(url, { ...options, headers });
    if (res.status === 401) {
      setAuthToken(null);
      localStorage.removeItem('vpn_admin_token');
    }
    return res;
  };

  // Handle Admin Login
  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: loginUsername, password: loginPassword }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setAuthToken(data.token);
        localStorage.setItem('vpn_admin_token', data.token);
      } else {
        setLoginError(data.error || 'نام کاربری یا رمز عبور اشتباه است.');
      }
    } catch (err) {
      setLoginError('خطا در برقراری ارتباط با سرور.');
    }
  };

  // Handle Admin Logout
  const handleLogout = () => {
    setAuthToken(null);
    localStorage.removeItem('vpn_admin_token');
  };

  // Fetch Backups from Backend
  const fetchBackups = async () => {
    try {
      const res = await apiFetch('/api/backups');
      if (res.ok) {
        const data = await res.json();
        setBackups(data.backups);
      }
    } catch (err) {
      console.error('Failed to fetch backups:', err);
    }
  };

  // Create Backup
  const handleCreateBackup = async () => {
    setBackupLoading(true);
    setBackupSuccess(null);
    setBackupError(null);
    try {
      const res = await apiFetch('/api/backups/create', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setBackups(data.backups);
        setBackupSuccess('نسخه پشتیبان جدید با موفقیت رمزگذاری و ذخیره شد.');
        setTimeout(() => setBackupSuccess(null), 4000);
      } else {
        const data = await res.json();
        setBackupError(data.error || 'خطا در ایجاد نسخه پشتیبان.');
      }
    } catch (err) {
      setBackupError('خطا در برقراری ارتباط با سرور.');
    } finally {
      setBackupLoading(false);
    }
  };

  // Delete Backup
  const handleDeleteBackup = async (filename: string) => {
    if (!confirm('آیا از حذف این نسخه پشتیبان اطمینان کامل دارید؟ (این عملیات غیر قابل بازگشت است)')) return;
    try {
      const res = await apiFetch('/api/backups/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename }),
      });
      if (res.ok) {
        const data = await res.json();
        setBackups(data.backups);
      }
    } catch (err) {
      console.error('Failed to delete backup:', err);
    }
  };

  // Restore Backup
  const handleRestoreBackup = async () => {
    if (!selectedBackupForRestore) return;
    if (!backupPasswordToRestore) {
      alert('لطفاً رمز عبور دیکریپت فایل پشتیبان را وارد کنید.');
      return;
    }
    setBackupLoading(true);
    setBackupError(null);
    setBackupSuccess(null);
    try {
      const res = await apiFetch('/api/backups/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: selectedBackupForRestore, password: backupPasswordToRestore }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setBackupSuccess('پایگاه داده با موفقیت بازگردانی شد! سامانه تا چند لحظه دیگر ریستارت می‌شود...');
        setSelectedBackupForRestore(null);
        setBackupPasswordToRestore('');
        setTimeout(() => {
          window.location.reload();
        }, 3000);
      } else {
        setBackupError(data.error || 'رمز عبور پشتیبان نامعتبر است یا ساختار فایل خراب شده است.');
      }
    } catch (err) {
      setBackupError('خطا در ارتباط با سرور جهت بازگردانی پشتیبان.');
    } finally {
      setBackupLoading(false);
    }
  };

  // Fetch Dashboard Data from Backend
  const fetchDashboardData = async (showLoading = false) => {
    if (!authToken) return;
    if (showLoading) setIsLoading(true);
    try {
      const res = await apiFetch('/api/dashboard');
      if (res.ok) {
        const data = await res.json();
        setSettings(data.settings);
        setBotStatus(data.status);
        setLogs(data.logs);
      }
    } catch (err) {
      console.error('Failed to fetch dashboard data:', err);
    } finally {
      if (showLoading) setIsLoading(false);
    }
  };

  // Poll backend data every 3 seconds for real-time logs and status
  useEffect(() => {
    if (authToken) {
      fetchDashboardData(true);
      fetchBackups();
      const interval = setInterval(() => {
        fetchDashboardData(false);
      }, 3000);
      return () => clearInterval(interval);
    }
  }, [authToken]);

  // Save Settings
  const handleSaveSettings = async (e?: FormEvent) => {
    if (e) e.preventDefault();
    setSaveLoading(true);
    setSaveSuccess(false);
    try {
      const res = await apiFetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      if (res.ok) {
        const data = await res.json();
        setSettings(data.settings);
        setBotStatus(data.status);
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      }
    } catch (err) {
      console.error('Error saving settings:', err);
    } finally {
      setSaveLoading(false);
    }
  };

  // Toggle Bot Enabled
  const handleToggleBot = async () => {
    const nextState = !botStatus.isRunning;
    try {
      const res = await apiFetch('/api/bot/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: nextState }),
      });
      if (res.ok) {
        const data = await res.json();
        setSettings(data.settings);
        setBotStatus(data.status);
      }
    } catch (err) {
      console.error('Error toggling bot status:', err);
    }
  };

  // Clear Logs
  const handleClearLogs = async () => {
    if (!confirm('آیا از حذف تمامی لاگ‌ها اطمینان دارید؟ / Are you sure you want to clear all logs?')) {
      return;
    }
    try {
      const res = await apiFetch('/api/logs/clear', { method: 'POST' });
      if (res.ok) {
        setLogs([]);
      }
    } catch (err) {
      console.error('Error clearing logs:', err);
    }
  };

  // Client Sandbox Processing
  const processSandboxFile = async (file: File) => {
    setSandboxFile(file);
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      const res = customizeConfig(content, file.name, settings.fileNamePattern, settings.adText);
      
      let ext = file.name.includes('.') ? file.name.split('.').pop() : '';
      let newName = settings.fileNamePattern;
      if (ext) {
        newName = `${settings.fileNamePattern}.${ext}`;
      }

      setSandboxResult({
        content: res.content,
        fileName: newName,
        fileType: res.fileType,
        modified: res.modified
      });
    };
    reader.readAsText(file);
  };

  // Process raw text pasted into Sandbox
  const handleProcessSandboxText = () => {
    if (!sandboxText.trim()) return;
    const res = customizeConfig(sandboxText, 'pasted_configs.txt', settings.fileNamePattern, settings.adText);
    setSandboxResult({
      content: res.content,
      fileName: `${settings.fileNamePattern}.txt`,
      fileType: res.fileType,
      modified: res.modified
    });
  };

  // Download Sandbox processed file
  const downloadSandboxResult = () => {
    if (!sandboxResult) return;
    const blob = new Blob([sandboxResult.content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = sandboxResult.fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Copy helper
  const handleCopyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // File drag & drop triggers
  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processSandboxFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileSelectChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processSandboxFile(e.target.files[0]);
    }
  };

  // Calculate metrics
  const totalProcessed = logs.length;
  const totalUnlocked = logs.filter(l => l.status === 'unlocked').length;
  const totalFailed = logs.filter(l => l.status === 'failed').length;

  if (!authToken) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans antialiased flex flex-col justify-center items-center p-4 selection:bg-emerald-500/30 selection:text-emerald-200">
        <div className="h-1 bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 w-full fixed top-0 left-0" />
        
        <div className="w-full max-w-md bg-zinc-900/40 border border-zinc-800/80 rounded-3xl p-8 shadow-xl backdrop-blur-md">
          <div className="flex flex-col items-center text-center mb-8">
            <div className="p-3.5 bg-emerald-500/10 rounded-2xl border border-emerald-500/20 text-emerald-400 mb-4 animate-pulse">
              <Shield className="w-8 h-8" />
            </div>
            <h1 className="text-xl font-extrabold tracking-tight bg-gradient-to-r from-zinc-50 to-zinc-300 bg-clip-text text-transparent mb-2">
              پنل مدیریت ربات تلگرام VPN
            </h1>
            <p className="text-zinc-500 text-xs text-center" dir="rtl">
              لطفاً جهت دسترسی به تنظیمات ربات و سیستم پشتیبان‌گیری وارد شوید.
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-5" dir="rtl">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-zinc-400 block text-right">
                نام کاربری مدیر / Admin Username
              </label>
              <input
                type="text"
                required
                value={loginUsername}
                onChange={(e) => setLoginUsername(e.target.value)}
                placeholder="نام کاربری پیش‌فرض: admin"
                className="w-full bg-zinc-900/80 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-zinc-100 font-mono text-left focus:outline-none focus:border-emerald-500/80 transition-all placeholder:text-zinc-600"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-zinc-400 block text-right">
                رمز عبور / Admin Password
              </label>
              <input
                type="password"
                required
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                placeholder="رمز عبور پیش‌فرض: admin"
                className="w-full bg-zinc-900/80 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-zinc-100 font-mono text-left focus:outline-none focus:border-emerald-500/80 transition-all placeholder:text-zinc-600"
              />
            </div>

            {loginError && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-xl text-xs font-medium text-center">
                ⚠️ {loginError}
              </div>
            )}

            <button
              type="submit"
              className="w-full bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold py-3.5 rounded-xl text-sm transition-all shadow-md shadow-emerald-950/20 flex items-center justify-center gap-2 cursor-pointer"
            >
              <Lock className="w-4 h-4" />
              <span>ورود به پنل مدیریت</span>
            </button>
          </form>
        </div>

        <p className="mt-8 text-zinc-600 text-xs text-center">
          © 2026 VPN Config Customizer Bot Engine. All Rights Reserved.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans antialiased selection:bg-emerald-500/30 selection:text-emerald-200">
      
      {/* Visual Accent Top Bar */}
      <div className="h-1 bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 w-full" />

      {/* Main Container */}
      <div className="max-w-6xl mx-auto px-4 py-8 md:py-12">
        
        {/* Header */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-10 pb-8 border-b border-zinc-800/80">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2.5 bg-emerald-500/10 rounded-xl border border-emerald-500/20 text-emerald-400">
                <Bot className="w-6 h-6 animate-pulse" />
              </div>
              <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight bg-gradient-to-r from-zinc-50 to-zinc-300 bg-clip-text text-transparent">
                VPN Config Customizer Bot
              </h1>
            </div>
            <p className="text-zinc-400 text-sm md:text-base text-right md:text-left font-medium" dir="rtl">
              مدیریت و سفارشی‌سازی ربات تلگرام قفل‌شکن و تغییر نام فایلهای NPVT و کانفیگ‌های VPN
            </p>
          </div>

          <div className="flex items-center gap-4 w-full md:w-auto justify-end">
            {/* Status Indicator Badge */}
            <div className={`px-4 py-2 rounded-2xl border text-sm font-semibold flex items-center gap-2.5 shadow-sm transition-all duration-300 ${
              botStatus.isRunning 
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 shadow-emerald-950/20' 
                : 'bg-zinc-900 border-zinc-800 text-zinc-400'
            }`}>
              <span className={`w-2.5 h-2.5 rounded-full ${botStatus.isRunning ? 'bg-emerald-500 animate-ping' : 'bg-zinc-600'}`} />
              <span>
                {botStatus.isRunning 
                  ? `ربات فعال است (@${botStatus.username})` 
                  : 'ربات متوقف است / Bot Stopped'
                }
              </span>
            </div>

            {/* Quick Toggle Button */}
            <button
              onClick={handleToggleBot}
              disabled={!settings.botToken}
              className={`p-2.5 rounded-xl border font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                botStatus.isRunning
                  ? 'bg-amber-500/10 text-amber-400 border-amber-500/30 hover:bg-amber-500/20'
                  : 'bg-emerald-500 text-zinc-950 border-emerald-400 hover:bg-emerald-400 shadow-md shadow-emerald-950/30 disabled:opacity-50 disabled:cursor-not-allowed'
              }`}
            >
              {botStatus.isRunning ? <Square className="w-5 h-5" /> : <Play className="w-5 h-5" />}
              <span className="text-sm hidden sm:inline">
                {botStatus.isRunning ? 'غیرفعال‌سازی' : 'فعال‌سازی'}
              </span>
            </button>
          </div>
        </header>

        {/* Dashboard Tabs Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          
          {/* Navigation Sidebar */}
          <nav className="lg:col-span-1 flex flex-col gap-2 border-b lg:border-b-0 lg:border-r border-zinc-800/80 min-h-[350px]">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl font-medium text-sm transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'dashboard'
                  ? 'bg-emerald-500/10 text-emerald-400 border-l-2 lg:border-l-2 border-emerald-500 font-bold'
                  : 'text-zinc-400 hover:bg-zinc-900/50 hover:text-zinc-200'
              }`}
            >
              <Bot className="w-5 h-5" />
              <span>داشبورد / Dashboard</span>
            </button>

            <button
              onClick={() => setActiveTab('settings')}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl font-medium text-sm transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'settings'
                  ? 'bg-emerald-500/10 text-emerald-400 border-l-2 lg:border-l-2 border-emerald-500 font-bold'
                  : 'text-zinc-400 hover:bg-zinc-900/50 hover:text-zinc-200'
              }`}
            >
              <Settings className="w-5 h-5" />
              <span>تنظیمات / Settings</span>
            </button>

            <button
              onClick={() => setActiveTab('sandbox')}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl font-medium text-sm transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'sandbox'
                  ? 'bg-emerald-500/10 text-emerald-400 border-l-2 lg:border-l-2 border-emerald-500 font-bold'
                  : 'text-zinc-400 hover:bg-zinc-900/50 hover:text-zinc-200'
              }`}
            >
              <Sparkles className="w-5 h-5" />
              <span>تست زنده / Sandbox</span>
            </button>

            <button
              onClick={() => setActiveTab('logs')}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl font-medium text-sm transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'logs'
                  ? 'bg-emerald-500/10 text-emerald-400 border-l-2 lg:border-l-2 border-emerald-500 font-bold'
                  : 'text-zinc-400 hover:bg-zinc-900/50 hover:text-zinc-200'
              }`}
            >
              <History className="w-5 h-5" />
              <span>گزارشات / Logs</span>
              {logs.length > 0 && (
                <span className="ml-auto bg-zinc-800 text-zinc-300 text-xs px-2 py-0.5 rounded-full font-mono">
                  {logs.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('backups')}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl font-medium text-sm transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'backups'
                  ? 'bg-emerald-500/10 text-emerald-400 border-l-2 lg:border-l-2 border-emerald-500 font-bold'
                  : 'text-zinc-400 hover:bg-zinc-900/50 hover:text-zinc-200'
              }`}
            >
              <Database className="w-5 h-5" />
              <span>پشتیبان‌گیری / Backups</span>
              {backups.length > 0 && (
                <span className="ml-auto bg-zinc-800 text-zinc-300 text-xs px-2 py-0.5 rounded-full font-mono">
                  {backups.length}
                </span>
              )}
            </button>

            <div className="flex-grow hidden lg:block" />

            <button
              onClick={handleLogout}
              className="flex items-center gap-3 px-4 py-3 rounded-xl font-medium text-sm transition-all cursor-pointer whitespace-nowrap text-rose-400 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20 mt-4"
            >
              <Lock className="w-5 h-5 animate-pulse" />
              <span>خروج از پنل / Logout</span>
            </button>
          </nav>

          {/* Tab Contents Area */}
          <main className="lg:col-span-3">
            
            {/* Loading Overlay */}
            {isLoading && activeTab !== 'sandbox' ? (
              <div className="flex flex-col items-center justify-center py-20">
                <RefreshCw className="w-8 h-8 text-emerald-400 animate-spin mb-4" />
                <p className="text-zinc-400 text-sm">در حال بارگذاری اطلاعات داشبورد...</p>
              </div>
            ) : (
              <>
                
                {/* 1. DASHBOARD VIEW */}
                {activeTab === 'dashboard' && (
                  <div className="space-y-8 animate-fade-in">
                    
                    {/* Bot Setup Warning Alert */}
                    {!settings.botToken && (
                      <div className="p-4 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-2xl flex items-start gap-3.5" dir="rtl">
                        <AlertCircle className="w-6 h-6 shrink-0 mt-0.5" />
                        <div>
                          <h4 className="font-bold text-sm mb-1">توکن ربات تلگرام ثبت نشده است!</h4>
                          <p className="text-xs text-zinc-400 leading-relaxed">
                            برای راه‌اندازی ربات، لطفاً ابتدا به زبانه <strong>«تنظیمات»</strong> بروید، توکن دریافتی خود از <a href="https://t.me/BotFather" target="_blank" rel="noopener noreferrer" className="text-emerald-400 underline">@BotFather</a> را وارد کرده و ذخیره نمایید.
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Quick Stats Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      
                      <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-5 shadow-sm">
                        <span className="text-zinc-400 text-xs font-semibold block mb-2 text-right" dir="rtl">کل فایلهای پردازش شده</span>
                        <div className="flex justify-between items-baseline">
                          <span className="text-3xl font-extrabold text-zinc-100 font-mono">{totalProcessed}</span>
                          <span className="text-zinc-500 text-xs">Total Processed</span>
                        </div>
                      </div>

                      <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-5 shadow-sm">
                        <span className="text-emerald-400 text-xs font-semibold block mb-2 text-right" dir="rtl">قفل‌شکنی و آنلاک موفق NPVT</span>
                        <div className="flex justify-between items-baseline">
                          <span className="text-3xl font-extrabold text-emerald-400 font-mono">{totalUnlocked}</span>
                          <span className="text-zinc-500 text-xs">Unlocked NPVT</span>
                        </div>
                      </div>

                      <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-5 shadow-sm">
                        <span className="text-rose-400 text-xs font-semibold block mb-2 text-right" dir="rtl">خطاها و فایلهای نامعتبر</span>
                        <div className="flex justify-between items-baseline">
                          <span className="text-3xl font-extrabold text-rose-400 font-mono">{totalFailed}</span>
                          <span className="text-zinc-500 text-xs">Failed Processing</span>
                        </div>
                      </div>

                    </div>

                    {/* Bot Server & Info Card */}
                    <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-2xl p-6">
                      <h3 className="text-lg font-bold mb-4 flex items-center gap-2 border-b border-zinc-800/80 pb-3">
                        <Shield className="w-5 h-5 text-emerald-400" />
                        <span>مشخصات فنی و وضعیت سرویس / Service Details</span>
                      </h3>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm" dir="rtl">
                        <div className="space-y-4">
                          <div className="flex justify-between items-center bg-zinc-900/80 p-3 rounded-xl border border-zinc-800/50">
                            <span className="text-zinc-400">نام ربات:</span>
                            <span className="font-semibold text-zinc-200">{botStatus.name || '---'}</span>
                          </div>
                          <div className="flex justify-between items-center bg-zinc-900/80 p-3 rounded-xl border border-zinc-800/50">
                            <span className="text-zinc-400">آیدی ربات:</span>
                            <span className="font-semibold text-zinc-200 font-mono">
                              {botStatus.username ? `@${botStatus.username}` : '---'}
                            </span>
                          </div>
                        </div>

                        <div className="space-y-4">
                          <div className="flex justify-between items-center bg-zinc-900/80 p-3 rounded-xl border border-zinc-800/50">
                            <span className="text-zinc-400">روش اتصال وب‌هوک:</span>
                            <span className="font-semibold text-emerald-400 font-mono text-xs">
                              {botStatus.webhookUrl || 'غیرفعال / Not Bound'}
                            </span>
                          </div>
                          <div className="flex justify-between items-center bg-zinc-900/80 p-3 rounded-xl border border-zinc-800/50">
                            <span className="text-zinc-400">سیستم عامل هسته:</span>
                            <span className="font-semibold text-zinc-400 font-mono text-xs">Cloud Native Container (Node v22)</span>
                          </div>
                        </div>
                      </div>

                      {botStatus.error && (
                        <div className="mt-4 p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-xl text-xs font-mono text-right" dir="rtl">
                          ⚠️ خطای سیستم: {botStatus.error}
                        </div>
                      )}
                    </div>

                    {/* How to use instruction */}
                    <div className="bg-gradient-to-br from-zinc-900/40 to-zinc-900/20 border border-zinc-800/80 rounded-2xl p-6" dir="rtl">
                      <h3 className="text-lg font-bold mb-4 text-zinc-200 flex items-center gap-2">
                        <HelpCircle className="w-5 h-5 text-emerald-400" />
                        <span>راهنمای استفاده سریع</span>
                      </h3>
                      <ol className="list-decimal list-inside space-y-3 text-zinc-400 text-sm leading-relaxed">
                        <li>ابتدا در تب <strong className="text-emerald-400">تنظیمات</strong>، توکن ربات تلگرام را ست کرده و نام دلخواه و تبلیغ کانال خود را بنویسید.</li>
                        <li>ربات را با دکمه <strong className="text-emerald-400">«فعال‌سازی»</strong> روشن کنید.</li>
                        <li>هر فایل کانفیگ <code className="text-emerald-400 font-mono">.npvt</code>، <code className="text-emerald-400 font-mono">.ovpn</code> یا کانفیگ‌های متنی دیگر را از سایر کانال‌ها به ربات فوروارد کنید.</li>
                        <li>ربات فوراً قفل آن را شکسته، نام را طبق الگوی شما تغییر داده، تبلیغ شما را داخل فایل جاسازی کرده و با کپشن شما ریپلای می‌کند!</li>
                      </ol>
                    </div>

                  </div>
                )}

                {/* 2. SETTINGS VIEW */}
                {activeTab === 'settings' && (
                  <form onSubmit={handleSaveSettings} className="space-y-6 animate-fade-in">
                    
                    <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-2xl p-6 space-y-6">
                      
                      <div className="border-b border-zinc-800/80 pb-4">
                        <h3 className="text-lg font-bold flex items-center gap-2 text-zinc-200">
                          <Settings className="w-5 h-5 text-emerald-400" />
                          <span>تنظیمات پیکربندی ربات / Bot Configurations</span>
                        </h3>
                        <p className="text-zinc-500 text-xs mt-1">تغییرات شما مستقیماً در هسته بات تلگرام اعمال خواهد شد.</p>
                      </div>

                      {/* Bot Token Field */}
                      <div className="space-y-2">
                        <label className="text-sm font-semibold text-zinc-300 block text-right" dir="rtl">
                          توکن ربات تلگرام (Telegram Bot Token)
                        </label>
                        <div className="relative">
                          <input
                            type={tokenVisible ? 'text' : 'password'}
                            value={settings.botToken}
                            onChange={(e) => setSettings({ ...settings, botToken: e.target.value })}
                            placeholder="e.g. 1234567890:ABCdefGhIJKlmNoPQRsTUVwXyZ"
                            className="w-full bg-zinc-900/80 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-zinc-100 font-mono focus:outline-none focus:border-emerald-500/80 transition-all placeholder:text-zinc-600"
                          />
                          <button
                            type="button"
                            onClick={() => setTokenVisible(!tokenVisible)}
                            className="absolute right-3.5 top-3.5 text-zinc-500 hover:text-zinc-300 transition-colors"
                          >
                            {tokenVisible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                        <p className="text-xs text-zinc-500 text-right" dir="rtl">
                          توکن ربات خود را از بات‌فادر تلگرام (<a href="https://t.me/BotFather" target="_blank" rel="noopener noreferrer" className="text-emerald-400 hover:underline">@BotFather</a>) بگیرید.
                        </p>
                      </div>

                      {/* File Rename Pattern */}
                      <div className="space-y-2">
                        <label className="text-sm font-semibold text-zinc-300 block text-right" dir="rtl">
                          نام جدید فایل‌های کانفیگ (Rename Pattern)
                        </label>
                        <input
                          type="text"
                          value={settings.fileNamePattern}
                          onChange={(e) => setSettings({ ...settings, fileNamePattern: e.target.value })}
                          placeholder="@MyChannel_VPN"
                          className="w-full bg-zinc-900/80 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-zinc-100 font-mono focus:outline-none focus:border-emerald-500/80 transition-all placeholder:text-zinc-600"
                          dir="ltr"
                        />
                        <p className="text-xs text-zinc-500 text-right" dir="rtl">
                          تمام فایل‌هایی که کاربر برای ربات می‌فرستد به این نام به همراه پسوند اصلی تغییر می‌یابند. (مثال: <code className="text-emerald-400">@MyChannel_VPN.npvt</code>)
                        </p>
                      </div>

                      {/* Ad / Channel Watermark */}
                      <div className="space-y-2">
                        <label className="text-sm font-semibold text-zinc-300 block text-right" dir="rtl">
                          آیدی کانال جهت جاسازی تبلیغات در فایل (Ads Channel ID)
                        </label>
                        <input
                          type="text"
                          value={settings.adText}
                          onChange={(e) => setSettings({ ...settings, adText: e.target.value })}
                          placeholder="@MyChannel"
                          className="w-full bg-zinc-900/80 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-zinc-100 font-mono focus:outline-none focus:border-emerald-500/80 transition-all placeholder:text-zinc-600"
                          dir="ltr"
                        />
                        <p className="text-xs text-zinc-500 text-right" dir="rtl">
                          این آیدی تلگرام به عنوان تبلیغ کانفینگ (همچون قفل کانال یا بخش کانال تبلیغات NPVT) تزریق خواهد شد.
                        </p>
                      </div>

                      {/* Custom Caption Multiline */}
                      <div className="space-y-2">
                        <label className="text-sm font-semibold text-zinc-300 block text-right" dir="rtl">
                          کپشن ارسالی زیر فایل‌ها (Custom File Caption)
                        </label>
                        <textarea
                          rows={4}
                          value={settings.captionText}
                          onChange={(e) => setSettings({ ...settings, captionText: e.target.value })}
                          placeholder="متن دلخواه شما برای زیر فایل‌ها"
                          className="w-full bg-zinc-900/80 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-zinc-100 focus:outline-none focus:border-emerald-500/80 transition-all placeholder:text-zinc-600 font-sans"
                          dir="rtl"
                        />
                        <p className="text-xs text-zinc-500 text-right" dir="rtl">
                          کپشن دلخواه شما با پشتیبانی از اموجی و متن‌های خلاقانه برای زیر کانفیگ‌های خروجی تلگرام.
                        </p>
                      </div>

                      {/* Admin Credentials Setup */}
                      <div className="border-t border-zinc-800/80 pt-6 space-y-4">
                        <h4 className="text-sm font-bold text-emerald-400 flex items-center gap-1.5" dir="rtl">
                          <Lock className="w-4 h-4" />
                          <span>تنظیمات امنیتی و ورود به پنل</span>
                        </h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <label className="text-xs font-semibold text-zinc-400 block text-right" dir="rtl">
                              نام کاربری مدیر (Admin Username)
                            </label>
                            <input
                              type="text"
                              value={settings.adminUsername || ''}
                              onChange={(e) => setSettings({ ...settings, adminUsername: e.target.value })}
                              placeholder="admin"
                              className="w-full bg-zinc-900/80 border border-zinc-800 rounded-xl px-4 py-2.5 text-xs text-zinc-100 font-mono focus:outline-none focus:border-emerald-500/80 transition-all placeholder:text-zinc-600"
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-xs font-semibold text-zinc-400 block text-right" dir="rtl">
                              رمز عبور مدیر (Admin Password)
                            </label>
                            <input
                              type="text"
                              value={settings.adminPassword || ''}
                              onChange={(e) => setSettings({ ...settings, adminPassword: e.target.value })}
                              placeholder="admin"
                              className="w-full bg-zinc-900/80 border border-zinc-800 rounded-xl px-4 py-2.5 text-xs text-zinc-100 font-mono focus:outline-none focus:border-emerald-500/80 transition-all placeholder:text-zinc-600"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Automated Backup Settings */}
                      <div className="border-t border-zinc-800/80 pt-6 space-y-4">
                        <h4 className="text-sm font-bold text-emerald-400 flex items-center gap-1.5" dir="rtl">
                          <Database className="w-4 h-4" />
                          <span>تنظیمات پشتیبان‌گیری خودکار پایگاه داده</span>
                        </h4>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                          <div className="space-y-2">
                            <label className="text-xs font-semibold text-zinc-400 block text-right" dir="rtl">
                              فعال‌سازی بکاپ خودکار
                            </label>
                            <div className="flex items-center justify-end h-10 pr-2">
                              <input
                                type="checkbox"
                                checked={settings.autoBackupEnabled !== false}
                                onChange={(e) => setSettings({ ...settings, autoBackupEnabled: e.target.checked })}
                                className="w-5 h-5 accent-emerald-500 cursor-pointer"
                              />
                            </div>
                          </div>
                          <div className="space-y-2">
                            <label className="text-xs font-semibold text-zinc-400 block text-right" dir="rtl">
                              دوره تناوب بکاپ (ساعت)
                            </label>
                            <input
                              type="number"
                              min={1}
                              max={168}
                              value={settings.backupIntervalHours || 2}
                              onChange={(e) => setSettings({ ...settings, backupIntervalHours: parseInt(e.target.value) || 2 })}
                              className="w-full bg-zinc-900/80 border border-zinc-800 rounded-xl px-4 py-2.5 text-xs text-zinc-100 font-mono focus:outline-none focus:border-emerald-500/80 transition-all"
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-xs font-semibold text-zinc-400 block text-right" dir="rtl">
                              رمز نگاری بکاپ (Backup Password)
                            </label>
                            <input
                              type="text"
                              value={settings.backupPassword || ''}
                              onChange={(e) => setSettings({ ...settings, backupPassword: e.target.value })}
                              placeholder="Backup Password"
                              className="w-full bg-zinc-900/80 border border-zinc-800 rounded-xl px-4 py-2.5 text-xs text-zinc-100 font-mono focus:outline-none focus:border-emerald-500/80 transition-all placeholder:text-zinc-600"
                            />
                          </div>
                        </div>
                      </div>

                    </div>

                    <div className="flex items-center justify-between gap-4">
                      {saveSuccess && (
                        <span className="text-emerald-400 text-sm font-semibold flex items-center gap-1.5 animate-fade-in" dir="rtl">
                          ✓ تنظیمات با موفقیت ذخیره شد! ربات بروزرسانی شد.
                        </span>
                      )}
                      
                      <button
                        type="submit"
                        disabled={saveLoading}
                        className="ml-auto bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold px-6 py-3 rounded-xl text-sm transition-all shadow-md shadow-emerald-950/20 flex items-center gap-2 cursor-pointer disabled:opacity-50"
                      >
                        {saveLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : null}
                        <span>ذخیره تنظیمات / Save Settings</span>
                      </button>
                    </div>

                  </form>
                )}

                {/* 3. INSTANT SANDBOX VIEW */}
                {activeTab === 'sandbox' && (
                  <div className="space-y-6 animate-fade-in">
                    
                    <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-2xl p-6">
                      <div className="border-b border-zinc-800/80 pb-4 mb-6">
                        <h3 className="text-lg font-bold flex items-center gap-2 text-zinc-200">
                          <Sparkles className="w-5 h-5 text-emerald-400" />
                          <span>قفل‌شکن و سفارشی‌ساز آنلاین (تست فوری بدون بات)</span>
                        </h3>
                        <p className="text-zinc-400 text-xs mt-1 text-right" dir="rtl">
                          بدون نیاز به ارسال فایل در تلگرام، اینجا می‌توانید فایل خود را آپلود کنید تا قفل آن باز شده و فوراً با نام جدید دانلود کنید!
                        </p>
                      </div>

                      {/* Drag and Drop Zone */}
                      <div
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        onClick={() => fileInputRef.current?.click()}
                        className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all duration-300 flex flex-col items-center justify-center gap-4 ${
                          isDragging
                            ? 'border-emerald-500 bg-emerald-500/5'
                            : 'border-zinc-800 bg-zinc-900/20 hover:border-zinc-700 hover:bg-zinc-900/40'
                        }`}
                      >
                        <input
                          type="file"
                          ref={fileInputRef}
                          onChange={handleFileSelectChange}
                          className="hidden"
                          accept=".npvt,.ovpn,.sks,.hc,.txt,*"
                        />
                        
                        <div className="p-3.5 bg-zinc-900 rounded-2xl border border-zinc-800 text-zinc-400">
                          <Upload className="w-7 h-7" />
                        </div>

                        <div>
                          <p className="text-sm font-semibold mb-1" dir="rtl">
                            فایل کانفیگ خود را به اینجا بکشید یا برای انتخاب کلیک کنید
                          </p>
                          <p className="text-xs text-zinc-500">
                            Supports .npvt, .ovpn, .sks, .hc, .txt, etc.
                          </p>
                        </div>
                      </div>

                      {/* Raw Text pasting fallback */}
                      <div className="my-6 flex items-center gap-4">
                        <div className="h-px bg-zinc-800 flex-1" />
                        <span className="text-xs text-zinc-500 font-mono">یا چسباندن متن کانفیگ (Or Paste Text)</span>
                        <div className="h-px bg-zinc-800 flex-1" />
                      </div>

                      <div className="space-y-3">
                        <textarea
                          rows={3}
                          value={sandboxText}
                          onChange={(e) => setSandboxText(e.target.value)}
                          placeholder="vmess://... یا vless://... یا محتوای قفل شده کانفیگ"
                          className="w-full bg-zinc-900/80 border border-zinc-800 rounded-xl px-4 py-3 text-xs text-zinc-100 font-mono focus:outline-none focus:border-emerald-500/80 transition-all placeholder:text-zinc-600"
                        />
                        <button
                          onClick={handleProcessSandboxText}
                          disabled={!sandboxText.trim()}
                          className="bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 font-bold px-5 py-2.5 rounded-xl text-xs transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
                        >
                          <FileCode className="w-4 h-4" />
                          <span>پردازش متن کانفیگ / Process Text Links</span>
                        </button>
                      </div>

                    </div>

                    {/* Sandbox Output Results */}
                    {sandboxResult && (
                      <div className="bg-zinc-900/60 border border-emerald-500/20 rounded-2xl p-6 space-y-4 animate-fade-in">
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-zinc-800 pb-3" dir="rtl">
                          <div>
                            <span className="bg-emerald-500/10 text-emerald-400 text-xs px-2.5 py-1 rounded-full font-bold border border-emerald-500/20 ml-2">
                              {sandboxResult.modified ? '✓ قفل شکسته شد (Unlocked)' : 'آماده به کار'}
                            </span>
                            <span className="text-xs text-zinc-400 font-mono">نوع فایل: {sandboxResult.fileType}</span>
                          </div>
                          <span className="text-sm font-semibold font-mono text-zinc-300 text-left" dir="ltr">
                            {sandboxResult.fileName}
                          </span>
                        </div>

                        {/* Text preview */}
                        <div className="relative">
                          <pre className="bg-zinc-950/80 border border-zinc-900 rounded-xl p-4 text-[11px] font-mono overflow-x-auto max-h-48 text-zinc-400 whitespace-pre">
                            {sandboxResult.content}
                          </pre>
                          <button
                            onClick={() => handleCopyToClipboard(sandboxResult.content, 'sandbox-copy')}
                            className="absolute top-3 right-3 bg-zinc-900/90 border border-zinc-800 text-zinc-400 hover:text-zinc-200 p-2 rounded-lg transition-colors cursor-pointer"
                          >
                            {copiedId === 'sandbox-copy' ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                          </button>
                        </div>

                        {/* Download button */}
                        <div className="flex justify-end gap-3 pt-2">
                          <button
                            onClick={() => {
                              setSandboxResult(null);
                              setSandboxFile(null);
                              setSandboxText('');
                            }}
                            className="text-xs text-zinc-500 hover:text-zinc-300 font-semibold px-4 py-2 rounded-xl transition-colors cursor-pointer"
                          >
                            پاک کردن / Clear
                          </button>
                          
                          <button
                            onClick={downloadSandboxResult}
                            className="bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold px-5 py-2.5 rounded-xl text-xs transition-all flex items-center gap-2 cursor-pointer shadow-md shadow-emerald-950/20"
                          >
                            <Download className="w-4 h-4" />
                            <span>دانلود فایل سفارشی / Download Config</span>
                          </button>
                        </div>
                      </div>
                    )}

                  </div>
                )}

                {/* 4. ACTIVITY LOGS VIEW */}
                {activeTab === 'logs' && (
                  <div className="space-y-6 animate-fade-in">
                    
                    <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-2xl p-6">
                      
                      <div className="flex justify-between items-center border-b border-zinc-800/80 pb-4 mb-6" dir="rtl">
                        <div>
                          <h3 className="text-lg font-bold text-zinc-200">گزارشات فایلهای پردازش شده / Process Logs</h3>
                          <p className="text-zinc-500 text-xs mt-0.5">لیست آخرین فایلهایی که توسط ربات تلگرام آنلاک و تغییر نام داده شده‌اند.</p>
                        </div>
                        
                        {logs.length > 0 && (
                          <button
                            onClick={handleClearLogs}
                            className="text-rose-400 hover:text-rose-300 border border-rose-500/10 hover:bg-rose-500/5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>پاک کردن تاریخچه</span>
                          </button>
                        )}
                      </div>

                      {logs.length === 0 ? (
                        <div className="text-center py-12 text-zinc-500" dir="rtl">
                          <History className="w-10 h-10 mx-auto mb-3 opacity-30 text-zinc-400" />
                          <p className="text-sm">هنوز فایلی توسط ربات پردازش نشده است.</p>
                          <p className="text-xs text-zinc-600 mt-1">با ارسال اولین فایل به ربات، گزارش آن در اینجا ظاهر می‌شود.</p>
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-right text-sm border-collapse" dir="rtl">
                            <thead>
                              <tr className="border-b border-zinc-800/80 text-zinc-400 text-xs">
                                <th className="pb-3 pt-1 font-semibold pr-2">نام فایل اصلی</th>
                                <th className="pb-3 pt-1 font-semibold">نام خروجی</th>
                                <th className="pb-3 pt-1 font-semibold">نوع فایل</th>
                                <th className="pb-3 pt-1 font-semibold">کاربر تلگرام</th>
                                <th className="pb-3 pt-1 font-semibold">وضعیت</th>
                                <th className="pb-3 pt-1 font-semibold text-left pl-2">زمان پردازش</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-800/30">
                              {logs.map((log) => (
                                <tr key={log.id} className="text-zinc-300 hover:bg-zinc-900/30 transition-colors">
                                  <td className="py-3.5 pr-2 font-medium max-w-[150px] truncate" title={log.originalName}>
                                    {log.originalName}
                                  </td>
                                  <td className="py-3.5 font-mono text-xs text-zinc-400 max-w-[150px] truncate" title={log.newName} dir="ltr">
                                    {log.newName}
                                  </td>
                                  <td className="py-3.5 text-xs text-zinc-400">
                                    {log.fileType}
                                  </td>
                                  <td className="py-3.5 text-xs text-zinc-400">
                                    {log.userId ? (
                                      <span className="flex flex-col text-right">
                                        <span className="font-mono text-emerald-400 text-[11px]">{log.userId}</span>
                                        {log.userUsername && log.userUsername !== 'unknown' && (
                                          <span className="text-zinc-500 text-[10px]">@{log.userUsername}</span>
                                        )}
                                      </span>
                                    ) : (
                                      <span className="text-zinc-600">—</span>
                                    )}
                                  </td>
                                  <td className="py-3.5">
                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                      log.status === 'unlocked' 
                                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                                        : log.status === 'success'
                                          ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                                          : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                                    }`}>
                                      {log.status === 'unlocked' ? 'قفل‌شکنی' : log.status === 'success' ? 'تغییر نام' : 'ناموفق'}
                                    </span>
                                  </td>
                                  <td className="py-3.5 pl-2 text-left font-mono text-[11px] text-zinc-500">
                                    {new Date(log.timestamp).toLocaleTimeString('fa-IR')}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}

                    </div>

                  </div>
                )}

                {/* 5. BACKUPS VIEW */}
                {activeTab === 'backups' && (
                  <div className="space-y-6 animate-fade-in" dir="rtl">
                    
                    <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-2xl p-6">
                      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-zinc-800/80 pb-4 mb-6 gap-4">
                        <div>
                          <h3 className="text-lg font-bold text-zinc-200">سیستم پشتیبان‌گیری پایگاه داده / Backups Manager</h3>
                          <p className="text-zinc-500 text-xs mt-0.5">پشتیبان‌گیری رمزگذاری‌شده از پیکربندی ربات، تنظیمات و تمامی لاگ‌ها</p>
                        </div>
                        
                        <button
                          onClick={handleCreateBackup}
                          disabled={backupLoading}
                          className="bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold px-4 py-2.5 rounded-xl text-xs transition-all flex items-center gap-2 cursor-pointer shadow-md shadow-emerald-950/20 disabled:opacity-50"
                        >
                          <Database className="w-4 h-4" />
                          <span>ایجاد بکاپ جدید / Create Backup</span>
                        </button>
                      </div>

                      {backupSuccess && (
                        <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl text-xs font-semibold mb-4 text-center">
                          ✓ {backupSuccess}
                        </div>
                      )}

                      {backupError && (
                        <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-xl text-xs font-semibold mb-4 text-center">
                          ⚠️ {backupError}
                        </div>
                      )}

                      {/* Decryption password modal/form for restore */}
                      {selectedBackupForRestore && (
                        <div className="mb-6 p-5 bg-emerald-950/20 border border-emerald-500/20 rounded-2xl space-y-4">
                          <h4 className="text-sm font-bold text-emerald-400 flex items-center gap-1.5">
                            <Unlock className="w-4 h-4" />
                            <span>بازگردانی نسخه پشتیبان: {selectedBackupForRestore}</span>
                          </h4>
                          <p className="text-xs text-zinc-400">
                            جهت بازگردانی اطلاعات، رمز عبوری که در زمان تهیه پشتیبان ست شده بود را وارد نمایید.
                          </p>
                          <div className="flex flex-col sm:flex-row gap-3">
                            <input
                              type="password"
                              value={backupPasswordToRestore}
                              onChange={(e) => setBackupPasswordToRestore(e.target.value)}
                              placeholder="رمز عبور دیکریپشن بکاپ"
                              className="bg-zinc-900/80 border border-zinc-800 rounded-xl px-4 py-2.5 text-xs text-zinc-100 font-mono text-left focus:outline-none focus:border-emerald-500/80 transition-all placeholder:text-zinc-600 flex-1"
                            />
                            <div className="flex gap-2">
                              <button
                                onClick={handleRestoreBackup}
                                disabled={backupLoading}
                                className="bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold px-4 py-2.5 rounded-xl text-xs transition-all cursor-pointer disabled:opacity-50"
                              >
                                {backupLoading ? 'در حال بازگردانی...' : 'تایید و بازگردانی'}
                              </button>
                              <button
                                onClick={() => {
                                  setSelectedBackupForRestore(null);
                                  setBackupPasswordToRestore('');
                                }}
                                className="bg-zinc-800 hover:bg-zinc-700 text-zinc-400 px-4 py-2.5 rounded-xl text-xs transition-all cursor-pointer"
                              >
                                انصراف
                              </button>
                            </div>
                          </div>
                        </div>
                      )}

                      {backups.length === 0 ? (
                        <div className="text-center py-12 text-zinc-500">
                          <Database className="w-10 h-10 mx-auto mb-3 opacity-30 text-zinc-400" />
                          <p className="text-sm">هیچ فایل پشتیبانی یافت نشد.</p>
                          <p className="text-xs text-zinc-600 mt-1">با کلیک روی دکمه بالا، اولین نسخه پشتیبان رمزنگاری‌شده را بسازید.</p>
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-right text-sm border-collapse">
                            <thead>
                              <tr className="border-b border-zinc-800/80 text-zinc-400 text-xs">
                                <th className="pb-3 pt-1 font-semibold pr-2">نام فایل پشتیبان</th>
                                <th className="pb-3 pt-1 font-semibold">حجم فایل</th>
                                <th className="pb-3 pt-1 font-semibold">تاریخ ایجاد</th>
                                <th className="pb-3 pt-1 font-semibold text-left pl-2">عملیات</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-800/30">
                              {backups.map((backup) => (
                                <tr key={backup.filename} className="text-zinc-300 hover:bg-zinc-900/30 transition-colors">
                                  <td className="py-3.5 pr-2 font-mono text-xs text-zinc-300" dir="ltr">
                                    {backup.filename}
                                  </td>
                                  <td className="py-3.5 text-xs text-zinc-400 font-mono">
                                    {(backup.size / 1024).toFixed(2)} KB
                                  </td>
                                  <td className="py-3.5 text-xs text-zinc-400 font-mono">
                                    {new Date(backup.date).toLocaleString('fa-IR')}
                                  </td>
                                  <td className="py-3.5 pl-2 text-left">
                                    <div className="flex items-center justify-end gap-2.5" dir="ltr">
                                      <button
                                        onClick={() => {
                                          setSelectedBackupForRestore(backup.filename);
                                          setBackupPasswordToRestore(settings.backupPassword || '');
                                        }}
                                        className="text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1"
                                      >
                                        <Unlock className="w-3 h-3" />
                                        <span>Restore</span>
                                      </button>
                                      
                                      <button
                                        onClick={() => handleDeleteBackup(backup.filename)}
                                        className="text-rose-400 hover:text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 p-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer"
                                        title="Delete backup"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}

                    </div>

                    <div className="bg-gradient-to-br from-zinc-900/40 to-zinc-900/20 border border-zinc-800/80 rounded-2xl p-6">
                      <h3 className="text-base font-bold mb-3 text-zinc-200 flex items-center gap-2">
                        <Shield className="w-4 h-4 text-emerald-400" />
                        <span>توضیحات امنیتی دیکریپت و بازیابی فایلهای پشتیبان</span>
                      </h3>
                      <p className="text-zinc-400 text-xs leading-relaxed">
                        سامانه برای تضمین ۱۰۰٪ امنیت، تمام فایل‌های پشتیبان را با الگوریتم قدرتمند و نظامی <code className="text-emerald-400 font-mono">AES-256-CBC</code> و به همراه نمک تصادفی (Salt) رمزگذاری می‌کند. بدون داشتن رمز نگاری که در تنظیمات ذخیره کرده‌اید، بازگشایی اطلاعات حتی توسط قوی‌ترین ابرکامپیوترها نیز عملاً ناممکن است.
                      </p>
                    </div>

                  </div>
                )}

              </>
            )}

          </main>

        </div>

        {/* Footer */}
        <footer className="mt-16 pt-6 border-t border-zinc-900 text-center text-zinc-600 text-xs flex flex-col sm:flex-row justify-between gap-4">
          <p>© 2026 VPN Config Customizer Bot Engine.</p>
          <p dir="rtl">طراحی شده برای مدیران حرفه‌ای تلگرام و شبکه‌های VPN</p>
        </footer>

      </div>
    </div>
  );
}
