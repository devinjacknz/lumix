import * as path from 'path';
import { logger } from '../monitoring';
import {
  Plugin,
  PluginManagerConfig,
  PluginVerificationResult
} from './types';
import { PluginLangChainAdapter, PluginToolConfig, AgentConfig } from './plugin-langchain-adapter';
import { Tool } from "langchain/tools";
import { AgentExecutor } from "langchain/agents";
import { BaseLanguageModel } from "langchain/base_language";

export class PluginManager {
  private plugins: Map<string, Plugin>;
  private verificationCache: Map<string, PluginVerificationResult>;
  private config: PluginManagerConfig;
  private langchainAdapter: PluginLangChainAdapter;

  constructor(pluginDir: string, config: Partial<PluginManagerConfig> = {}) {
    this.plugins = new Map();
    this.verificationCache = new Map();
    this.langchainAdapter = PluginLangChainAdapter.getInstance();
    this.config = {
      pluginDir,
      verifySignature: true,
      autoEnable: true,
      allowHotReload: true,
      maxPlugins: 100,
      ...config
    };
  }

  public async loadPlugin(pluginFile: string): Promise<void> {
    try {
      // 验证插件
      if (this.config.verifySignature) {
        const verificationResult = await this.verifyPlugin(pluginFile);
        if (!verificationResult.valid) {
          throw new Error(
            `Plugin verification failed: ${pluginFile}\n${verificationResult.errors.join('\n')}`
          );
        }
      }

      // 加载插件
      const plugin = await this.loadPluginModule(pluginFile);
      if (!plugin) {
        throw new Error(`Failed to load plugin: ${pluginFile}`);
      }

      // 存储插件
      const pluginId = plugin.getName();
      this.plugins.set(pluginId, plugin);

      // 存储验证结果
      if (this.config.verifySignature) {
        const verificationResult = await this.verifyPlugin(pluginFile);
        this.verificationCache.set(pluginId, verificationResult);
      }

      // 调用加载生命周期方法
      if (plugin.onLoad) {
        await plugin.onLoad();
      }

      // 如果配置了自动启用，则启用插件
      if (this.config.autoEnable && plugin.onEnable) {
        await plugin.onEnable();
        plugin.isEnabled = true;
      }

      logger.info('Plugin', `Loaded plugin: ${pluginId}`);
    } catch (error) {
      if (error instanceof Error) {
        logger.error('Plugin', `Failed to load plugin: ${error.message}`);
        throw error;
      }
      throw new Error('Unknown error during plugin loading');
    }
  }

  public async unloadPlugin(pluginId: string): Promise<void> {
    try {
      const plugin = this.plugins.get(pluginId);
      if (!plugin) {
        return;
      }

      // 如果插件已启用，先禁用它
      if (plugin.isEnabled && plugin.onDisable) {
        await plugin.onDisable();
        plugin.isEnabled = false;
      }

      // 卸载插件
      if (plugin.onUnload) {
        await plugin.onUnload();
      }

      this.plugins.delete(pluginId);
      this.verificationCache.delete(pluginId);
      logger.info('Plugin', `Unloaded plugin: ${pluginId}`);
    } catch (error) {
      if (error instanceof Error) {
        logger.error('Plugin', `Failed to unload plugin: ${error.message}`);
        throw error;
      }
      throw new Error('Unknown error during plugin unloading');
    }
  }

  public getPlugin(pluginId: string): Plugin | undefined {
    return this.plugins.get(pluginId);
  }

  public getPlugins(): Plugin[] {
    return Array.from(this.plugins.values());
  }

  private async loadPluginModule(pluginFile: string): Promise<Plugin | null> {
    try {
      const modulePath = path.resolve(this.config.pluginDir, pluginFile);
      const module = await import(modulePath);
      
      if (!module.default) {
        throw new Error(`Plugin module must export a default class`);
      }

      const plugin = new module.default();
      
      // 验证插件接口实现
      if (!this.validatePlugin(plugin)) {
        throw new Error(`Invalid plugin implementation`);
      }

      return plugin;
    } catch (error) {
      if (error instanceof Error) {
        logger.error('Plugin', `Failed to load plugin module: ${error.message}`);
      }
      return null;
    }
  }

  private validatePlugin(plugin: any): plugin is Plugin {
    return (
      typeof plugin.getName === 'function' &&
      typeof plugin.getAPI === 'function' &&
      typeof plugin.getMetadata === 'function' &&
      'isEnabled' in plugin &&
      'isLoaded' in plugin
    );
  }

  private async verifyPlugin(pluginFile: string): Promise<PluginVerificationResult> {
    try {
      // 1. 检查文件完整性
      // 2. 验证签名
      // 3. 检查安全漏洞
      return {
        valid: true,
        errors: [],
        warnings: []
      };
    } catch (error) {
      if (error instanceof Error) {
        return {
          valid: false,
          errors: [error.message],
          warnings: []
        };
      }
      return {
        valid: false,
        errors: ['Unknown error during plugin verification'],
        warnings: []
      };
    }
  }

  public async shutdown(): Promise<void> {
    try {
      // 卸载所有插件
      for (const [pluginId] of this.plugins.entries()) {
        await this.unloadPlugin(pluginId);
      }
      logger.info('Plugin', 'Plugin manager shut down');
    } catch (error) {
      if (error instanceof Error) {
        logger.error('Plugin', `Failed to shutdown plugin manager: ${error.message}`);
        throw error;
      }
      throw new Error('Unknown error during plugin manager shutdown');
    }
  }

  public setModel(model: BaseLanguageModel): void {
    this.langchainAdapter.setModel(model);
  }

  public async createToolFromPlugin(
    pluginId: string,
    config: PluginToolConfig
  ): Promise<Tool> {
    const plugin = this.getPlugin(pluginId);
    if (!plugin) {
      throw new Error(`Plugin not found: ${pluginId}`);
    }

    return this.langchainAdapter.createToolFromPlugin(plugin, config);
  }

  public async createAgentFromTools(
    config: AgentConfig,
    tools: Tool[]
  ): Promise<AgentExecutor> {
    return this.langchainAdapter.createAgentFromTools(config, tools);
  }

  public getTool(name: string): Tool | undefined {
    return this.langchainAdapter.getTool(name);
  }

  public getTools(): Tool[] {
    return this.langchainAdapter.getTools();
  }

  public getAgent(name: string): AgentExecutor | undefined {
    return this.langchainAdapter.getAgent(name);
  }

  public getAgents(): AgentExecutor[] {
    return this.langchainAdapter.getAgents();
  }
}