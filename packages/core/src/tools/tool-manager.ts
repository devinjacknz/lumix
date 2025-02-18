import { Tool } from "langchain/tools";
import { BaseLumixTool } from './base-tool';
import { ToolConfig } from './config';
import { logger } from '../monitoring';

export class ToolManager {
  private static instance: ToolManager;
  private tools: Map<string, BaseLumixTool>;
  private isInitialized: boolean;

  private constructor() {
    this.tools = new Map();
    this.isInitialized = false;
  }

  public static getInstance(): ToolManager {
    if (!ToolManager.instance) {
      ToolManager.instance = new ToolManager();
    }
    return ToolManager.instance;
  }

  public async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // 加载工具配置
      await this.loadToolConfigs();
      
      // 注册内置工具
      await this.registerBuiltinTools();
      
      this.isInitialized = true;
      logger.info('Tool Manager', 'Initialized successfully');
    } catch (error) {
      if (error instanceof Error) {
        logger.error('Tool Manager', `Initialization failed: ${error.message}`);
      }
      throw error;
    }
  }

  public async registerTool(tool: BaseLumixTool): Promise<void> {
    if (this.tools.has(tool.getName())) {
      throw new Error(`Tool ${tool.getName()} already registered`);
    }

    this.tools.set(tool.getName(), tool);
    logger.info('Tool Manager', `Registered tool: ${tool.getName()}`);
  }

  public async unregisterTool(name: string): Promise<void> {
    if (!this.tools.has(name)) {
      throw new Error(`Tool ${name} not found`);
    }

    this.tools.delete(name);
    logger.info('Tool Manager', `Unregistered tool: ${name}`);
  }

  public getTool(name: string): BaseLumixTool | undefined {
    return this.tools.get(name);
  }

  public getTools(): Tool[] {
    return Array.from(this.tools.values())
      .filter(tool => tool.isEnabled())
      .sort((a, b) => {
        const configA = (a as BaseLumixTool)['config'];
        const configB = (b as BaseLumixTool)['config'];
        return (configB?.priority || 0) - (configA?.priority || 0);
      });
  }

  public async updateToolConfig(
    name: string,
    config: Partial<ToolConfig>
  ): Promise<void> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Tool ${name} not found`);
    }

    tool.updateConfig(config);
    logger.info('Tool Manager', `Updated config for tool: ${name}`);
  }

  private async loadToolConfigs(): Promise<void> {
    // TODO: 从配置文件或数据库加载工具配置
  }

  private async registerBuiltinTools(): Promise<void> {
    // TODO: 注册内置工具
  }

  public getToolCount(): number {
    return this.tools.size;
  }

  public getEnabledToolCount(): number {
    return this.getTools().length;
  }

  public async shutdown(): Promise<void> {
    this.tools.clear();
    this.isInitialized = false;
    logger.info('Tool Manager', 'Shut down successfully');
  }
} 