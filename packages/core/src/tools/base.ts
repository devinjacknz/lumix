import { Tool } from '@langchain/core/tools';
import { BaseCallbackConfig } from '@langchain/core/callbacks/manager';

/**
 * 工具配置
 */
export interface ToolConfig {
  name?: string;
  description?: string;
  verbose?: boolean;
  maxRetries?: number;
  retryDelay?: number;
}

/**
 * LangChain 风格的基础工具
 */
export abstract class BaseTool extends Tool {
  protected config: Required<ToolConfig>;

  constructor(config: ToolConfig = {}) {
    super();
    this.config = {
      name: config.name || this.name,
      description: config.description || this.description,
      verbose: config.verbose || false,
      maxRetries: config.maxRetries || 3,
      retryDelay: config.retryDelay || 1000
    };
  }

  /**
   * 执行工具
   */
  async _call(
    input: string,
    runManager?: BaseCallbackConfig
  ): Promise<string> {
    let lastError: Error | undefined;

    for (let i = 0; i < this.config.maxRetries; i++) {
      try {
        if (this.config.verbose) {
          console.log(`Executing ${this.config.name}:`, input);
        }

        const result = await this.execute(input);

        if (this.config.verbose) {
          console.log(`Result from ${this.config.name}:`, result);
        }

        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (this.config.verbose) {
          console.error(`Error in ${this.config.name}:`, lastError);
        }

        if (i < this.config.maxRetries - 1) {
          await new Promise(resolve =>
            setTimeout(resolve, this.config.retryDelay)
          );
        }
      }
    }

    throw lastError || new Error('Tool execution failed');
  }

  /**
   * 执行具体工具逻辑
   */
  protected abstract execute(input: string): Promise<string>;

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
} 