import winston from 'winston';

// Logger interface
export interface Logger {
  info(message: string, meta?: any): void;
  error(message: string, meta?: any): void;
  warn(message: string, meta?: any): void;
  debug(message: string, meta?: any): void;
  trace(message: string, meta?: any): void;
}

// Logger configuration
export interface LoggerConfig {
  level?: string;
  format?: winston.Logform.Format;
  transports?: winston.transport[];
}

// Default logger configuration
const defaultConfig: LoggerConfig = {
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console()
  ]
};

// Logger class
class LoggerService {
  private static instance: LoggerService;
  private logger: winston.Logger;

  private constructor(config: LoggerConfig = defaultConfig) {
    this.logger = winston.createLogger(config);
  }

  public static getInstance(config?: LoggerConfig): LoggerService {
    if (!LoggerService.instance) {
      LoggerService.instance = new LoggerService(config);
    }
    return LoggerService.instance;
  }

  public createLogger(config?: LoggerConfig): Logger {
    const logger = config ? winston.createLogger(config) : this.logger;
    
    return {
      info: (message: string, meta?: any) => logger.info(message, meta),
      error: (message: string, meta?: any) => logger.error(message, meta),
      warn: (message: string, meta?: any) => logger.warn(message, meta),
      debug: (message: string, meta?: any) => logger.debug(message, meta),
      trace: (message: string, meta?: any) => logger.verbose(message, meta)
    };
  }
}

// Export logger instance
export const logger = LoggerService.getInstance(); 