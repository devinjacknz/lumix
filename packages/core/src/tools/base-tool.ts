import { Tool } from '@langchain/core/tools';
import { RunnableRetryFailedAttemptHandler } from '@langchain/core/runnables';
import { ToolConfig, ToolResult, ToolError } from '@lumix/types';
import { logger } from '../monitoring';

export abstract class BaseLumixTool extends Tool {
  public withRetry(fields?: {
    stopAfterAttempt?: number;
    onFailedAttempt?: RunnableRetryFailedAttemptHandler;
  }) {
    return super.withRetry(fields);
  }

  protected async _call(input: string): Promise<string> {
    throw new Error('Method not implemented.');
  }

  get name(): string {
    throw new Error('Method not implemented.');
  }

  get description(): string {
    throw new Error('Method not implemented.');
  }

  protected config: Required<ToolConfig>;
  protected cache: Map<string, {
    data: any;
    timestamp: number;
  }>;

  constructor(config: ToolConfig) {
    super();
    this.config = {
      name: config.name,
      description: config.description,
      version: config.version || '1.0.0',
      enabled: config.enabled ?? true,
      priority: config.priority ?? 1,
      timeout: config.timeout ?? 30000,
      retryAttempts: config.retryAttempts ?? 3,
      retryDelay: config.retryDelay ?? 1000,
      cacheEnabled: config.cacheEnabled ?? true,
      cacheTTL: config.cacheTTL ?? 300000
    };
    this.cache = new Map();
  }

  async call(input: string): Promise<string> {
    if (!this.isEnabled()) {
      throw new Error(`Tool ${this.config.name} is disabled`);
    }
    try {
      return await this._call(input);
    } catch (error) {
      if (error instanceof Error) {
        this.logError(`Tool execution failed`, error);
      }
      throw error;
    }
  }

  protected async withTimeout<T>(
    operation: () => Promise<T>
  ): Promise<T> {
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Operation timeout')), this.config.timeout)
    );
    return Promise.race([operation(), timeoutPromise]);
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