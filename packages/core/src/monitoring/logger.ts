import { LogEntry, LogLevel, LogStorage } from './types';
import { configManager } from '../config';

export class Logger {
  private static instance: Logger;
  private logLevel: LogLevel;
  private storage: LogStorage | null = null;

  private constructor() {
    this.logLevel = configManager.getMetricsConfig().logLevel as LogLevel;
  }

  public static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  public setStorage(storage: LogStorage): void {
    this.storage = storage;
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: Record<LogLevel, number> = {
      debug: 0,
      info: 1,
      warn: 2,
      error: 3
    };
    return levels[level] >= levels[this.logLevel];
  }

  private async createLogEntry(
    level: LogLevel,
    module: string,
    message: string,
    metadata?: Record<string, any>
  ): Promise<LogEntry> {
    const entry: LogEntry = {
      timestamp: new Date(),
      level,
      module,
      message,
      metadata
    };

    if (this.storage) {
      await this.storage.write(entry);
    }

    // 控制台输出
    const formattedMessage = this.formatLogMessage(entry);
    switch (level) {
      case 'debug':
        console.debug(formattedMessage);
        break;
      case 'info':
        console.info(formattedMessage);
        break;
      case 'warn':
        console.warn(formattedMessage);
        break;
      case 'error':
        console.error(formattedMessage);
        break;
    }

    return entry;
  }

  private formatLogMessage(entry: LogEntry): string {
    const timestamp = entry.timestamp.toISOString();
    const level = entry.level.toUpperCase().padEnd(5);
    const metadata = entry.metadata ? ` ${JSON.stringify(entry.metadata)}` : '';
    return `[${timestamp}] ${level} [${entry.module}] ${entry.message}${metadata}`;
  }

  public async debug(module: string, message: string, metadata?: Record<string, any>): Promise<void> {
    if (this.shouldLog('debug')) {
      await this.createLogEntry('debug', module, message, metadata);
    }
  }

  public async info(module: string, message: string, metadata?: Record<string, any>): Promise<void> {
    if (this.shouldLog('info')) {
      await this.createLogEntry('info', module, message, metadata);
    }
  }

  public async warn(module: string, message: string, metadata?: Record<string, any>): Promise<void> {
    if (this.shouldLog('warn')) {
      await this.createLogEntry('warn', module, message, metadata);
    }
  }

  public async error(module: string, message: string, metadata?: Record<string, any>): Promise<void> {
    if (this.shouldLog('error')) {
      await this.createLogEntry('error', module, message, metadata);
    }
  }

  public async query(options: {
    level?: LogLevel;
    module?: string;
    startTime?: Date;
    endTime?: Date;
    limit?: number;
  }): Promise<LogEntry[]> {
    if (!this.storage) {
      throw new Error('No log storage configured');
    }
    return this.storage.query(options);
  }
} 