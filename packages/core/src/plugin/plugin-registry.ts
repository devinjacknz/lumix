import { AlertManager, AlertType, AlertSeverity } from '../monitoring/alerts';
import { logger } from '../monitoring/logger';
import { VersionManager } from './plugin-version';
import { Plugin, PluginMetadata } from './types';

export interface PluginRegistryConfig {
  enabled: boolean;
  pluginDir?: string;
  autoStart?: boolean;
  maxPlugins?: number;
  allowHotReload?: boolean;
  validateDependencies?: boolean;
}

export interface PluginRegistryStats {
  totalPlugins: number;
  activePlugins: number;
  failedPlugins: number;
  lastUpdate: number;
}

export class PluginRegistry {
  private config: Required<PluginRegistryConfig>;
  private stats: PluginRegistryStats;
  private alertManager: AlertManager;
  private plugins: Map<string, Plugin>;
  private activePlugins: Set<string>;
  private initialized: boolean = false;

  constructor(config: PluginRegistryConfig, alertManager: AlertManager) {
    this.config = {
      enabled: config.enabled,
      pluginDir: config.pluginDir || './plugins',
      autoStart: config.autoStart ?? true,
      maxPlugins: config.maxPlugins || 100,
      allowHotReload: config.allowHotReload ?? false,
      validateDependencies: config.validateDependencies ?? true
    };

    this.stats = {
      totalPlugins: 0,
      activePlugins: 0,
      failedPlugins: 0,
      lastUpdate: Date.now()
    };

    this.alertManager = alertManager;
    this.plugins = new Map();
    this.activePlugins = new Set();
  }

  async initialize(): Promise<void> {
    if (!this.config.enabled) {
      logger.warn('Plugin Registry', 'Plugin registry is disabled');
      return;
    }

    if (this.initialized) {
      logger.warn('Plugin Registry', 'Plugin registry is already initialized');
      return;
    }

    try {
      // 清理现有状态
      this.plugins.clear();
      this.activePlugins.clear();
      this.stats = {
        totalPlugins: 0,
        activePlugins: 0,
        failedPlugins: 0,
        lastUpdate: Date.now()
      };

      // 加载插件目录
      if (this.config.autoStart) {
        // 这里可以实现自动加载插件目录的逻辑
        logger.info('Plugin Registry', 'Auto-loading plugins from directory');
      }

      this.initialized = true;
      logger.info('Plugin Registry', 'Plugin registry initialized');
    } catch (error) {
      logger.error('Plugin Registry', `Initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      await this.createAlert('init_failed', 'Plugin registry initialization failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  async registerPlugin(plugin: Plugin): Promise<boolean> {
    if (!this.initialized) {
      throw new Error('Plugin registry is not initialized');
    }

    try {
      // 验证插件元数据
      if (!this.validatePluginMetadata(plugin.metadata)) {
        logger.error('Plugin Registry', `Invalid plugin metadata: ${plugin.metadata.name}`);
        return false;
      }

      // 检查插件数量限制
      if (this.plugins.size >= this.config.maxPlugins) {
        await this.createAlert('max_plugins', 'Maximum number of plugins reached');
        return false;
      }

      // 检查插件是否已存在
      if (this.plugins.has(plugin.metadata.id)) {
        if (!this.config.allowHotReload) {
          logger.warn('Plugin Registry', `Plugin ${plugin.metadata.id} is already registered`);
          return false;
        }
        // 如果允许热重载，先停止并移除旧插件
        await this.unregisterPlugin(plugin.metadata.id);
      }

      // 验证依赖关系
      if (this.config.validateDependencies) {
        if (!await this.validateDependencies(plugin.metadata)) {
          return false;
        }
      }

      // 注册插件
      this.plugins.set(plugin.metadata.id, plugin);
      this.stats.totalPlugins++;
      this.stats.lastUpdate = Date.now();

      logger.info('Plugin Registry', `Plugin ${plugin.metadata.name} registered`);

      // 如果配置了自动启动，则启动插件
      if (this.config.autoStart) {
        await this.startPlugin(plugin.metadata.id);
      }

      return true;
    } catch (error) {
      logger.error('Plugin Registry', `Failed to register plugin: ${error instanceof Error ? error.message : 'Unknown error'}`);
      this.stats.failedPlugins++;
      await this.createAlert('register_failed', 'Plugin registration failed', {
        plugin: plugin.metadata.name,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return false;
    }
  }

  async unregisterPlugin(id: string): Promise<boolean> {
    if (!this.initialized) {
      throw new Error('Plugin registry is not initialized');
    }

    try {
      const plugin = this.plugins.get(id);
      if (!plugin) {
        logger.warn('Plugin Registry', `Plugin ${id} not found`);
        return false;
      }

      // 如果插件正在运行，先停止它
      if (this.activePlugins.has(id)) {
        await this.stopPlugin(id);
      }

      // 移除插件
      this.plugins.delete(id);
      this.stats.totalPlugins--;
      this.stats.lastUpdate = Date.now();

      logger.info('Plugin Registry', `Plugin ${plugin.metadata.name} unregistered`);
      return true;
    } catch (error) {
      logger.error('Plugin Registry', `Failed to unregister plugin: ${error instanceof Error ? error.message : 'Unknown error'}`);
      await this.createAlert('unregister_failed', 'Plugin unregistration failed', {
        pluginId: id,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return false;
    }
  }

  async startPlugin(id: string): Promise<boolean> {
    if (!this.initialized) {
      throw new Error('Plugin registry is not initialized');
    }

    try {
      const plugin = this.plugins.get(id);
      if (!plugin) {
        logger.warn('Plugin Registry', `Plugin ${id} not found`);
        return false;
      }

      if (this.activePlugins.has(id)) {
        logger.warn('Plugin Registry', `Plugin ${id} is already running`);
        return true;
      }

      // 初始化并启动插件
      await plugin.initialize();
      await plugin.start();

      this.activePlugins.add(id);
      this.stats.activePlugins++;
      this.stats.lastUpdate = Date.now();

      logger.info('Plugin Registry', `Plugin ${plugin.metadata.name} started`);
      return true;
    } catch (error) {
      logger.error('Plugin Registry', `Failed to start plugin: ${error instanceof Error ? error.message : 'Unknown error'}`);
      this.stats.failedPlugins++;
      await this.createAlert('start_failed', 'Plugin start failed', {
        pluginId: id,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return false;
    }
  }

  async stopPlugin(id: string): Promise<boolean> {
    if (!this.initialized) {
      throw new Error('Plugin registry is not initialized');
    }

    try {
      const plugin = this.plugins.get(id);
      if (!plugin) {
        logger.warn('Plugin Registry', `Plugin ${id} not found`);
        return false;
      }

      if (!this.activePlugins.has(id)) {
        logger.warn('Plugin Registry', `Plugin ${id} is not running`);
        return true;
      }

      // 停止插件
      await plugin.stop();

      this.activePlugins.delete(id);
      this.stats.activePlugins--;
      this.stats.lastUpdate = Date.now();

      logger.info('Plugin Registry', `Plugin ${plugin.metadata.name} stopped`);
      return true;
    } catch (error) {
      logger.error('Plugin Registry', `Failed to stop plugin: ${error instanceof Error ? error.message : 'Unknown error'}`);
      await this.createAlert('stop_failed', 'Plugin stop failed', {
        pluginId: id,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return false;
    }
  }

  async broadcastEvent(event: string, data?: any): Promise<void> {
    if (!this.initialized) {
      throw new Error('Plugin registry is not initialized');
    }

    const errors: Error[] = [];

    // 向所有活跃的插件广播事件
    for (const id of this.activePlugins) {
      const plugin = this.plugins.get(id);
      if (!plugin) {
        continue;
      }

      try {
        if (plugin.onEvent) {
          await plugin.onEvent(event, data);
        }
      } catch (error) {
        errors.push(error instanceof Error ? error : new Error(String(error)));
        logger.error('Plugin Registry', `Event broadcast failed for plugin ${id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    if (errors.length > 0) {
      await this.createAlert('broadcast_failed', 'Event broadcast failed for some plugins', {
        event,
        errors: errors.map(e => e.message)
      });
    }
  }

  private validatePluginMetadata(metadata: PluginMetadata): boolean {
    // 验证必需字段
    if (!metadata.id || !metadata.name || !metadata.version) {
      return false;
    }

    // 验证版本格式
    if (!VersionManager.isValidVersion(metadata.version)) {
      return false;
    }

    // 验证权限列表
    if (metadata.permissions) {
      if (!Array.isArray(metadata.permissions)) {
        return false;
      }
      // 这里可以添加更详细的权限验证逻辑
    }

    return true;
  }

  private async validateDependencies(metadata: PluginMetadata): Promise<boolean> {
    if (!metadata.dependencies) {
      return true;
    }

    for (const [pluginId, versionRange] of Object.entries(metadata.dependencies)) {
      const dependency = this.plugins.get(pluginId);
      if (!dependency) {
        await this.createAlert('missing_dependency', `Missing dependency: ${pluginId}`, {
          plugin: metadata.name,
          dependency: pluginId,
          requiredVersion: versionRange
        });
        return false;
      }

      if (!VersionManager.isValidVersionRange(versionRange)) {
        await this.createAlert('invalid_version_range', `Invalid version range for dependency: ${pluginId}`, {
          plugin: metadata.name,
          dependency: pluginId,
          versionRange
        });
        return false;
      }

      const dependencyVersion = VersionManager.parseVersion(dependency.metadata.version);
      const range = VersionManager.parseVersionRange(versionRange);

      if (!VersionManager.satisfiesRange(dependencyVersion, range)) {
        await this.createAlert('version_mismatch', `Dependency version mismatch: ${pluginId}`, {
          plugin: metadata.name,
          dependency: pluginId,
          required: versionRange,
          actual: dependency.metadata.version
        });
        return false;
      }
    }

    return true;
  }

  private async createAlert(
    type: string,
    message: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    await this.alertManager.createAlert({
      type: AlertType.PLUGIN_ERROR,
      severity: AlertSeverity.WARNING,
      message,
      metadata: {
        type,
        ...metadata,
        timestamp: Date.now()
      }
    });
  }

  getPlugin(id: string): Plugin | undefined {
    return this.plugins.get(id);
  }

  getAllPlugins(): Plugin[] {
    return Array.from(this.plugins.values());
  }

  getActivePlugins(): Plugin[] {
    return Array.from(this.activePlugins).map(id => this.plugins.get(id)!);
  }

  isPluginActive(id: string): boolean {
    return this.activePlugins.has(id);
  }

  getStats(): PluginRegistryStats {
    return { ...this.stats };
  }

  getConfig(): Required<PluginRegistryConfig> {
    return this.config;
  }

  isEnabled(): boolean {
    return this.config.enabled;
  }
} 