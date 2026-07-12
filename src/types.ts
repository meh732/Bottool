export interface BotSettings {
  botToken: string;
  fileNamePattern: string;
  captionText: string;
  adText: string; // Used for channels or in-config advertisements
  botEnabled: boolean;
  webhookActive: boolean;
}

export interface UserBotSettings {
  fileNamePattern: string;
  captionText: string;
  adText: string;
}

export interface ProcessedLog {
  id: string;
  timestamp: string;
  originalName: string;
  newName: string;
  fileSize: number;
  fileType: string;
  status: 'success' | 'failed' | 'unlocked';
  message: string;
  userId?: string;
  userUsername?: string;
}

export interface BotStatus {
  isRunning: boolean;
  username: string;
  name: string;
  webhookUrl: string;
  error?: string;
}

export interface DashboardData {
  settings: BotSettings;
  status: BotStatus;
  logs: ProcessedLog[];
  userSettings?: Record<string, UserBotSettings>;
}
