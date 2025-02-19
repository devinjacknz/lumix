import { Tool } from "langchain/tools";
import { Plugin, PluginAPI } from '../plugin/plugin-manager';
import { logger } from '../monitoring';

export interface PluginToolConfig {
  name: string;
  description: string;
  method: string;
  parameters?: Record<string, any>;
  returnSchema?: Record<string, any>;
  timeout?: number;
}

export class PluginTool extends Tool {
  private plugin: Plugin;
  private api: PluginAPI;
  private method: string;
  private parameters: Record<string, any>;
  private timeout: number;

  constructor(
    plugin: Plugin,
    config: PluginToolConfig
  ) {
    super();
    this.plugin = plugin;
    this.name = config.name;
    this.description = config.description;
    this.method = config.method;
    this.parameters = config.parameters || {};
    this.timeout = config.timeout || 30000;

    // 获取插件 API
    const api = plugin.getAPI();
    if (!api || !api[config.method]) {
      throw new Error(`Method ${config.method} not found in plugin ${plugin.getName()}`);
    }
    this.api = api;
  }

  async _call(input: string): Promise<string> {
    try {
      // 解析输入参数
      let params: Record<string, any>;
      try {
        params = JSON.parse(input);
      } catch {
        params = { input };
      }

      // 验证参数
      this.validateParameters(params);

      // 设置超时
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Tool execution timeout')), this.timeout)
      );

      // 执行插件方法
      const resultPromise = this.api[this.method](params);
      const result = await Promise.race([resultPromise, timeoutPromise]);

      // 格式化结果
      return this.formatResult(result);
    } catch (error) {
      if (error instanceof Error) {
        logger.error('Plugin', `Plugin tool execution failed: ${error.message}`);
        throw error;
      }
      throw new Error('Unknown error during plugin tool execution');
    }
  }

  private validateParameters(params: Record<string, any>): void {
    // 检查必需参数
    for (const [key, schema] of Object.entries(this.parameters)) {
      if (schema.required && !(key in params)) {
        throw new Error(`Missing required parameter: ${key}`);
      }
    }
  }

  private formatResult(result: any): string {
    if (typeof result === 'string') {
      return result;
    }
    return JSON.stringify(result, null, 2);
  }
}

export class PluginAdapter {
  private static instance: PluginAdapter;
  private tools: Map<string, PluginTool>;

  private constructor() {
    this.tools = new Map();
  }

  public static getInstance(): PluginAdapter {
    if (!PluginAdapter.instance) {
      PluginAdapter.instance = new PluginAdapter();
    }
    return PluginAdapter.instance;
  }

  public createTool(
    plugin: Plugin,
    config: PluginToolConfig
  ): PluginTool {
    try {
      const toolKey = `${plugin.getName()}:${config.name}`;
      if (this.tools.has(toolKey)) {
        throw new Error(`Tool ${toolKey} already exists`);
      }

      const tool = new PluginTool(plugin, config);
      this.tools.set(toolKey, tool);

      logger.info('Plugin', `Created tool ${toolKey} from plugin ${plugin.getName()}`);
      return tool;
    } catch (error) {
      if (error instanceof Error) {
        logger.error('Plugin', `Failed to create tool: ${error.message}`);
      }
      throw error;
    }
  }

  public getTool(pluginName: string, toolName: string): PluginTool | undefined {
    return this.tools.get(`${pluginName}:${toolName}`);
  }

  public getTools(): PluginTool[] {
    return Array.from(this.tools.values());
  }

  public deleteTool(pluginName: string, toolName: string): void {
    const toolKey = `${pluginName}:${toolName}`;
    if (this.tools.delete(toolKey)) {
      logger.info('Plugin', `Deleted tool ${toolKey}`);
    }
  }

  public deletePluginTools(pluginName: string): void {
    for (const [key] of this.tools.entries()) {
      if (key.startsWith(`${pluginName}:`)) {
        this.tools.delete(key);
      }
    }
    logger.info('Plugin', `Deleted all tools for plugin ${pluginName}`);
  }

  public async shutdown(): Promise<void> {
    try {
      this.tools.clear();
      logger.info('Plugin', 'Plugin adapter shut down');
    } catch (error) {
      if (error instanceof Error) {
        logger.error('Plugin', `Failed to shutdown plugin adapter: ${error.message}`);
      }
      throw error;
    }
  }
} 