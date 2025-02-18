import { Tool } from "langchain/tools";
import { BaseLanguageModel } from "langchain/base_language";
import { logger } from '../monitoring';
import { EventEmitter } from 'events';

export interface ToolConfig {
  name: string;
  description: string;
  enabled: boolean;
  requiresAuth?: boolean;
  rateLimit?: {
    maxRequests: number;
    interval: number;
  };
  timeout?: number;
}

export interface ToolStats {
  calls: number;
  errors: number;
  avgLatency: number;
  lastUsed: number;
  successRate: number;
}

export class ToolManager extends EventEmitter {
  private static instance: ToolManager;
  private tools: Map<string, Tool>;
  private configs: Map<string, ToolConfig>;
  private stats: Map<string, ToolStats>;
  private model?: BaseLanguageModel;

  private constructor() {
    super();
    this.tools = new Map();
    this.configs = new Map();
    this.stats = new Map();
  }

  public static getInstance(): ToolManager {
    if (!ToolManager.instance) {
      ToolManager.instance = new ToolManager();
    }
    return ToolManager.instance;
  }

  public setModel(model: BaseLanguageModel): void {
    this.model = model;
  }

  public registerTool(tool: Tool, config: ToolConfig): void {
    try {
      if (this.tools.has(tool.name)) {
        throw new Error(`Tool ${tool.name} already registered`);
      }

      // 添加工具统计
      this.stats.set(tool.name, {
        calls: 0,
        errors: 0,
        avgLatency: 0,
        lastUsed: 0,
        successRate: 1
      });

      // 存储配置
      this.configs.set(tool.name, config);

      // 包装工具以添加统计和错误处理
      const wrappedTool = this.wrapTool(tool);
      this.tools.set(tool.name, wrappedTool);

      logger.info('Tool', `Registered tool: ${tool.name}`);
      this.emit('toolRegistered', { name: tool.name, config });
    } catch (error) {
      if (error instanceof Error) {
        logger.error('Tool', `Failed to register tool ${tool.name}: ${error.message}`);
      }
      throw error;
    }
  }

  public unregisterTool(name: string): void {
    try {
      if (this.tools.delete(name)) {
        this.configs.delete(name);
        this.stats.delete(name);
        logger.info('Tool', `Unregistered tool: ${name}`);
        this.emit('toolUnregistered', { name });
      }
    } catch (error) {
      if (error instanceof Error) {
        logger.error('Tool', `Failed to unregister tool ${name}: ${error.message}`);
      }
      throw error;
    }
  }

  public getTool(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  public getTools(): Tool[] {
    return Array.from(this.tools.values());
  }

  public getEnabledTools(): Tool[] {
    return Array.from(this.tools.entries())
      .filter(([name]) => this.configs.get(name)?.enabled)
      .map(([_, tool]) => tool);
  }

  public getToolConfig(name: string): ToolConfig | undefined {
    return this.configs.get(name);
  }

  public getToolStats(name: string): ToolStats | undefined {
    return this.stats.get(name);
  }

  public getAllStats(): Record<string, ToolStats> {
    return Object.fromEntries(this.stats.entries());
  }

  private wrapTool(tool: Tool): Tool {
    const originalCall = tool.call.bind(tool);
    const stats = this.stats.get(tool.name)!;
    const config = this.configs.get(tool.name)!;

    tool.call = async (arg: string) => {
      const startTime = Date.now();
      stats.calls++;
      stats.lastUsed = startTime;

      try {
        // 检查速率限制
        if (config.rateLimit) {
          await this.checkRateLimit(tool.name);
        }

        // 设置超时
        const timeoutPromise = config.timeout
          ? new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Tool execution timeout')), config.timeout)
            )
          : null;

        // 执行工具调用
        const resultPromise = originalCall(arg);
        const result = timeoutPromise
          ? await Promise.race([resultPromise, timeoutPromise])
          : await resultPromise;

        // 更新统计信息
        const duration = Date.now() - startTime;
        stats.avgLatency = (stats.avgLatency * (stats.calls - 1) + duration) / stats.calls;
        stats.successRate = (stats.successRate * (stats.calls - 1) + 1) / stats.calls;

        this.emit('toolSuccess', {
          name: tool.name,
          duration,
          input: arg,
          output: result
        });

        return result;
      } catch (error) {
        stats.errors++;
        stats.successRate = (stats.successRate * (stats.calls - 1)) / stats.calls;

        if (error instanceof Error) {
          this.emit('toolError', {
            name: tool.name,
            error: error.message,
            input: arg
          });
          logger.error('Tool', `Tool ${tool.name} execution failed: ${error.message}`);
          throw error;
        }
        throw new Error('Unknown error during tool execution');
      }
    };

    return tool;
  }

  private async checkRateLimit(toolName: string): Promise<void> {
    const config = this.configs.get(toolName);
    if (!config?.rateLimit) return;

    const stats = this.stats.get(toolName)!;
    const { maxRequests, interval } = config.rateLimit;
    const now = Date.now();

    if (stats.calls >= maxRequests) {
      const timeSinceFirstCall = now - stats.lastUsed;
      if (timeSinceFirstCall < interval) {
        const waitTime = interval - timeSinceFirstCall;
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
  }

  public async shutdown(): Promise<void> {
    try {
      this.tools.clear();
      this.configs.clear();
      this.stats.clear();
      this.model = undefined;
      this.removeAllListeners();
      logger.info('Tool', 'Tool manager shut down');
    } catch (error) {
      if (error instanceof Error) {
        logger.error('Tool', `Failed to shutdown tool manager: ${error.message}`);
      }
      throw error;
    }
  }
} 