import { Tool } from '@langchain/core/tools';
import { RunnableRetryFailedAttemptHandler } from '@langchain/core/runnables';
import { z } from 'zod';
import { BaseToolConfig, ToolResult } from './types';

export interface ToolConfig {
  name: string;
  description: string;
  version: string;
  enabled: boolean;
  priority: number;
  timeout: number;
  maxRetries: number;
  retryDelay: number;
  parameters: Record<string, string>;
}

export abstract class BaseLumixTool extends Tool {
  protected config: ToolConfig;
  protected schema: z.ZodObject<any>;

  constructor(config: ToolConfig) {
    super();
    this.config = {
      name: config.name,
      description: config.description,
      version: config.version || '1.0.0',
      enabled: config.enabled ?? true,
      priority: config.priority ?? 0,
      timeout: config.timeout ?? 30000,
      maxRetries: config.maxRetries ?? 3,
      retryDelay: config.retryDelay ?? 1000,
      parameters: config.parameters || {}
    };

    this.schema = z.object(
      Object.entries(this.config.parameters).reduce((acc, [key, value]) => ({
        ...acc,
        [key]: z.string().describe(value)
      }), {})
    );
  }

  get name(): string {
    return this.config.name;
  }
  
  get description(): string {
    return this.config.description;
  }

  withRetry(fields?: {
    stopAfterAttempt?: number;
    onFailedAttempt?: RunnableRetryFailedAttemptHandler;
  }) {
    return super.withRetry({
      stopAfterAttempt: fields?.stopAfterAttempt ?? this.config.maxRetries,
      onFailedAttempt: fields?.onFailedAttempt
    });
  }

  withTimeout(timeout?: number) {
    return super.withTimeout(timeout ?? this.config.timeout);
  }

  abstract execute(input: any): Promise<ToolResult>;

  protected async _call(args: z.infer<typeof this.schema>): Promise<string> {
    const result = await this.execute(args);
    return JSON.stringify(result);
  }

  protected async withRetryOperation<T>(
    operation: () => Promise<T>,
    maxAttempts: number = this.config.maxRetries,
    delay: number = this.config.retryDelay
  ): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (attempt === maxAttempts) {
          throw lastError;
        }
        await new Promise(resolve => setTimeout(resolve, delay * attempt));
      }
    }

    throw lastError;
  }

  protected async withTimeout<T>(
    operation: () => Promise<T>,
    timeout: number = this.config.timeout
  ): Promise<T> {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Operation timed out')), timeout);
    });
    return Promise.race([operation(), timeoutPromise]);
  }
} 