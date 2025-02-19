export interface Logger {
  debug(context: string, message: string, meta?: Record<string, any>): void;
  info(context: string, message: string, meta?: Record<string, any>): void;
  warn(context: string, message: string, meta?: Record<string, any>): void;
  error(context: string, message: string, meta?: Record<string, any>): void;
}

class ConsoleLogger implements Logger {
  debug(context: string, message: string, meta?: Record<string, any>): void {
    console.debug(`[${context}] ${message}`, meta);
  }

  info(context: string, message: string, meta?: Record<string, any>): void {
    console.info(`[${context}] ${message}`, meta);
  }

  warn(context: string, message: string, meta?: Record<string, any>): void {
    console.warn(`[${context}] ${message}`, meta);
  }

  error(context: string, message: string, meta?: Record<string, any>): void {
    console.error(`[${context}] ${message}`, meta);
  }
}

export const logger: Logger = new ConsoleLogger(); 