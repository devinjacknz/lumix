import { Tool } from "langchain/tools";
import { ToolConfig } from './config';
import { logger } from '../monitoring';

export abstract class BaseLumixTool extends Tool {
  protected config: ToolConfig;
  protected cache: Map<string, {
    data: any;
    timestamp: number;
  }>;

  constructor(config: ToolConfig) {
    super();
    this.config = config;
    this.cache = new Map();
  }

  protected async withTimeout<T>(
    operation: () => Promise<T>,
    timeout: number = this.config.timeout
  ): Promise<T> {
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Operation timeout')), timeout)
    );
    return Promise.race([operation(), timeoutPromise]);
  }

  protected async withRetry<T>(
    operation: () => Promise<T>,
    attempts: number = this.config.retryAttempts,
    delay: number = this.config.retryDelay
  ): Promise<T> {
    let lastError: Error;
    for (let i = 0; i < attempts; i++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (i < attempts - 1) {
          await new Promise(resolve => setTimeout(resolve, delay * (i + 1)));
        }
      }
    }
    throw lastError;
  }

  protected getCacheKey(key: string): string {
    return `${this.config.name}:${key}`;
  }

  protected getFromCache<T>(key: string): T | null {
    if (!this.config.cacheEnabled) return null;

    const cacheKey = this.getCacheKey(key);
    const cached = this.cache.get(cacheKey);
    
    if (!cached) return null;
    
    if (Date.now() - cached.timestamp > this.config.cacheTTL) {
      this.cache.delete(cacheKey);
      return null;
    }

    return cached.data as T;
  }

  protected setInCache(key: string, data: any): void {
    if (!this.config.cacheEnabled) return;

    const cacheKey = this.getCacheKey(key);
    this.cache.set(cacheKey, {
      data,
      timestamp: Date.now()
    });
  }

  protected clearCache(): void {
    this.cache.clear();
  }

  protected logError(message: string, error: Error): void {
    logger.error(`${this.config.name} Tool`, `${message}: ${error.message}`);
  }

  protected logInfo(message: string): void {
    logger.info(`${this.config.name} Tool`, message);
  }

  protected logWarning(message: string): void {
    logger.warn(`${this.config.name} Tool`, message);
  }

  public updateConfig(config: Partial<ToolConfig>): void {
    this.config = {
      ...this.config,
      ...config
    };
  }

  public isEnabled(): boolean {
    return this.config.enabled;
  }

  public getName(): string {
    return this.config.name;
  }

  public getDescription(): string {
    return this.config.description;
  }
} 