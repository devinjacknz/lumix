import { ToolManager } from './tool-manager';
import { BaseLumixTool } from './base-tool';
import { ToolConfig } from './config';
import { logger } from '../monitoring';

export class ToolRegistry {
  private static instance: ToolRegistry;
  private toolManager: ToolManager;
  private toolFactories: Map<string, (config: ToolConfig) => Promise<BaseLumixTool>>;

  private constructor() {
    this.toolManager = ToolManager.getInstance();
    this.toolFactories = new Map();
  }

  public static getInstance(): ToolRegistry {
    if (!ToolRegistry.instance) {
      ToolRegistry.instance = new ToolRegistry();
    }
    return ToolRegistry.instance;
  }

  public async registerToolFactory(
    name: string,
    factory: (config: ToolConfig) => Promise<BaseLumixTool>
  ): Promise<void> {
    if (this.toolFactories.has(name)) {
      throw new Error(`Tool factory ${name} already registered`);
    }

    this.toolFactories.set(name, factory);
    logger.info('Tool Registry', `Registered tool factory: ${name}`);
  }

  public async createTool(
    name: string,
    config: ToolConfig
  ): Promise<BaseLumixTool> {
    const factory = this.toolFactories.get(name);
    if (!factory) {
      throw new Error(`Tool factory ${name} not found`);
    }

    const tool = await factory(config);
    await this.toolManager.registerTool(tool);
    return tool;
  }

  public async createAndRegisterTools(
    configs: Record<string, ToolConfig>
  ): Promise<void> {
    for (const [name, config] of Object.entries(configs)) {
      try {
        await this.createTool(name, config);
      } catch (error) {
        if (error instanceof Error) {
          logger.error(
            'Tool Registry',
            `Failed to create tool ${name}: ${error.message}`
          );
        }
      }
    }
  }

  public getRegisteredFactories(): string[] {
    return Array.from(this.toolFactories.keys());
  }

  public hasToolFactory(name: string): boolean {
    return this.toolFactories.has(name);
  }

  public async unregisterToolFactory(name: string): Promise<void> {
    if (!this.toolFactories.has(name)) {
      throw new Error(`Tool factory ${name} not found`);
    }

    this.toolFactories.delete(name);
    logger.info('Tool Registry', `Unregistered tool factory: ${name}`);
  }

  public getFactoryCount(): number {
    return this.toolFactories.size;
  }
} 