import { LogEntry, LogLevel, LogStorage } from './types';
import { configManager } from '../config';

export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error'
}

export interface LogEntry {
  level: LogLevel;
  module: string;
  message: string;
  timestamp: number;
  metadata?: Record<string, any>;
}

export interface LoggerConfig {
  level: LogLevel;
  format?: 'json' | 'text';
  timestamp?: boolean;
  colors?: boolean;
  metadata?: boolean;
}

export class Logger {
  private static instance: Logger;
  private config: Required<LoggerConfig>;
  private logs: LogEntry[] = [];

  private constructor(config: LoggerConfig) {
    this.config = {
      level: config.level,
      format: config.format || 'text',
      timestamp: config.timestamp ?? true,
      colors: config.colors ?? true,
      metadata: config.metadata ?? true
    };
  }

  public static getInstance(config?: LoggerConfig): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger(config || {
        level: LogLevel.INFO
      });
    }
    return Logger.instance;
  }

  public debug(module: string, message: string, metadata?: Record<string, any>): void {
    this.log(LogLevel.DEBUG, module, message, metadata);
  }

  public info(module: string, message: string, metadata?: Record<string, any>): void {
    this.log(LogLevel.INFO, module, message, metadata);
  }

  public warn(module: string, message: string, metadata?: Record<string, any>): void {
    this.log(LogLevel.WARN, module, message, metadata);
  }

  public error(module: string, message: string, metadata?: Record<string, any>): void {
    this.log(LogLevel.ERROR, module, message, metadata);
  }

  private log(level: LogLevel, module: string, message: string, metadata?: Record<string, any>): void {
    if (this.shouldLog(level)) {
      const entry: LogEntry = {
        level,
        module,
        message,
        timestamp: Date.now(),
        metadata
      };

      this.logs.push(entry);
      this.writeLog(entry);
    }
  }

  private shouldLog(level: LogLevel): boolean {
    const levels = {
      [LogLevel.DEBUG]: 0,
      [LogLevel.INFO]: 1,
      [LogLevel.WARN]: 2,
      [LogLevel.ERROR]: 3
    };

    return levels[level] >= levels[this.config.level];
  }

  private writeLog(entry: LogEntry): void {
    let output: string;

    if (this.config.format === 'json') {
      output = JSON.stringify(entry);
    } else {
      const parts: string[] = [];

      if (this.config.timestamp) {
        parts.push(new Date(entry.timestamp).toISOString());
      }

      parts.push(`[${entry.level.toUpperCase()}]`);
      parts.push(`[${entry.module}]`);
      parts.push(entry.message);

      if (this.config.metadata && entry.metadata) {
        parts.push(JSON.stringify(entry.metadata));
      }

      output = parts.join(' ');
    }

    if (this.config.colors) {
      output = this.colorize(entry.level, output);
    }

    switch (entry.level) {
      case LogLevel.ERROR:
        console.error(output);
        break;
      case LogLevel.WARN:
        console.warn(output);
        break;
      default:
        console.log(output);
    }
  }

  private colorize(level: LogLevel, text: string): string {
    const colors = {
      [LogLevel.DEBUG]: '\x1b[36m', // Cyan
      [LogLevel.INFO]: '\x1b[32m',  // Green
      [LogLevel.WARN]: '\x1b[33m',  // Yellow
      [LogLevel.ERROR]: '\x1b[31m'  // Red
    };

    const reset = '\x1b[0m';
    return `${colors[level]}${text}${reset}`;
  }

  public getLogs(options?: {
    level?: LogLevel;
    module?: string;
    startTime?: number;
    endTime?: number;
    limit?: number;
    offset?: number;
  }): LogEntry[] {
    let logs = [...this.logs];

    if (options) {
      if (options.level) {
        logs = logs.filter(log => log.level === options.level);
      }

      if (options.module) {
        logs = logs.filter(log => log.module === options.module);
      }

      if (options.startTime) {
        logs = logs.filter(log => log.timestamp >= options.startTime!);
      }

      if (options.endTime) {
        logs = logs.filter(log => log.timestamp <= options.endTime!);
      }

      if (options.limit) {
        const start = options.offset || 0;
        logs = logs.slice(start, start + options.limit);
      }
    }

    return logs;
  }

  public clearLogs(): void {
    this.logs = [];
  }

  public getConfig(): Required<LoggerConfig> {
    return { ...this.config };
  }

  public setConfig(config: Partial<LoggerConfig>): void {
    this.config = {
      ...this.config,
      ...config
    };
  }
}

export const logger = Logger.getInstance(); 