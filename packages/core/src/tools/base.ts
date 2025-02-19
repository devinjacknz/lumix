import { StructuredTool } from '@langchain/core/tools';
import { CallbackManagerForToolRun } from '@langchain/core/callbacks/manager';
import { z } from 'zod';
import { ToolConfig } from './types';

/**
 * 工具配置
 */
export interface ToolConfig {
  name: string;
  description: string;
  version?: string;
  parameters?: Record<string, any>;
  returnSchema?: Record<string, any>;
  timeout?: number;
}

/**
 * LangChain 风格的基础工具
 */
export abstract class BaseTool extends StructuredTool {
  protected config: ToolConfig;

  constructor(config: ToolConfig) {
    const schema = z.object({
      input: z.string().optional(),
      ...Object.entries(config.parameters || {}).reduce((acc, [key, value]) => ({
        ...acc,
        [key]: z.string().describe(value)
      }), {})
    });

    super({
      name: config.name,
      description: config.description,
      schema: schema
    });
    this.config = config;
  }

  /**
   * 执行工具
   */
  protected async _call(input: string): Promise<string> {
    try {
      const result = await this.execute(input);
      return JSON.stringify(result);
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Tool execution failed: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * 执行具体工具逻辑
   */
  abstract execute(input: string): Promise<unknown>;

  /**
   * 更新配置
   */
  updateConfig(config: Partial<ToolConfig>): void {
    this.config = {
      ...this.config,
      ...config
    };
  }

  /**
   * 获取配置
   */
  getConfig(): ToolConfig {
    return this.config;
  }

  public withRetry<T>(operation: () => Promise<T>): Promise<T> {
    return this.retry(operation);
  }

  private async retry<T>(
    operation: () => Promise<T>,
    maxAttempts: number = 3,
    delay: number = 1000
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
    timeout: number = this.config.timeout || 30000
  ): Promise<T> {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Operation timed out')), timeout);
    });
    return Promise.race([operation(), timeoutPromise]);
  }
} 