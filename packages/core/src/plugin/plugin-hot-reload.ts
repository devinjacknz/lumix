import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import { Plugin, PluginManager } from './plugin-manager';
import { logger } from '../monitoring';
import { configManager } from '../config';
import { PluginVersionManager } from './plugin-version';

export interface HotReloadConfig {
  enabled: boolean;
  watchInterval: number;
  watchPatterns: string[];
  maxReloadAttempts: number;
  reloadTimeout: number;
  backupEnabled: boolean;
  backupDir: string;
  validateAfterReload: boolean;
}

export interface ReloadResult {
  success: boolean;
  pluginId: string;
  timestamp: number;
  duration: number;
  error?: Error;
  validation?: {
    passed: boolean;
    issues: string[];
  };
}

export class PluginHotReload extends EventEmitter {
  private watcher?: fs.FSWatcher;
  private reloadAttempts: Map<string, number>;
  private lastReload: Map<string, number>;
  private reloadQueue: Set<string>;
  private reloadTimer?: NodeJS.Timeout;
  private versionManager: PluginVersionManager;
  private readonly RELOAD_DEBOUNCE = 1000; // 1秒防抖

  constructor(
    private manager: PluginManager,
    private config: HotReloadConfig
  ) {
    super();
    this.reloadAttempts = new Map();
    this.lastReload = new Map();
    this.reloadQueue = new Set();
    this.versionManager = new PluginVersionManager(process.env.CORE_VERSION || '1.0.0');
  }

  public async start(): Promise<void> {
    if (!this.config.enabled) {
      logger.info('HotReload', 'Hot reload is disabled');
      return;
    }

    try {
      // 创建备份目录
      if (this.config.backupEnabled) {
        await this.ensureBackupDir();
      }

      // 监听插件目录变化
      this.watcher = fs.watch(
        this.manager.getPluginsDir(),
        { recursive: true },
        this.handleFileChange.bind(this)
      );

      logger.info('HotReload', 'Plugin hot reload started');
    } catch (error) {
      logger.error('HotReload', 'Failed to start hot reload', error);
      throw error;
    }
  }

  private async ensureBackupDir(): Promise<void> {
    const backupDir = path.join(this.manager.getPluginsDir(), this.config.backupDir);
    if (!fs.existsSync(backupDir)) {
      await fs.promises.mkdir(backupDir, { recursive: true });
    }
  }

  private async createBackup(pluginId: string): Promise<string> {
    const sourcePath = path.join(this.manager.getPluginsDir(), `${pluginId}.js`);
    const backupPath = path.join(
      this.manager.getPluginsDir(),
      this.config.backupDir,
      `${pluginId}_${Date.now()}.js`
    );

    await fs.promises.copyFile(sourcePath, backupPath);
    return backupPath;
  }

  private async validatePlugin(plugin: Plugin): Promise<{ passed: boolean; issues: string[] }> {
    const issues: string[] = [];

    try {
      // 验证插件元数据
      if (!plugin.metadata) {
        issues.push('Missing plugin metadata');
      } else {
        if (!plugin.metadata.id) issues.push('Missing plugin ID');
        if (!plugin.metadata.version) issues.push('Missing plugin version');
        if (!plugin.metadata.name) issues.push('Missing plugin name');
      }

      // 验证必要的方法
      if (typeof plugin.initialize !== 'function') {
        issues.push('Missing initialize method');
      }
      if (typeof plugin.onLoad !== 'function') {
        issues.push('Missing onLoad method');
      }
      if (typeof plugin.onUnload !== 'function') {
        issues.push('Missing onUnload method');
      }

      // 验证依赖关系
      if (plugin.metadata?.dependencies) {
        for (const [depId, version] of Object.entries(plugin.metadata.dependencies)) {
          const depPlugin = this.manager.getPlugin(depId);
          if (!depPlugin) {
            issues.push(`Missing dependency: ${depId}`);
          } else {
            // 检查版本兼容性
            const versionCheck = await this.versionManager.checkCompatibility(plugin);
            if (!versionCheck.compatible) {
              issues.push(...versionCheck.issues);
            }
          }
        }
      }

      // 验证权限
      if (plugin.metadata?.permissions) {
        const validPermissions = await this.manager.validatePermissions(
          plugin.metadata.id,
          plugin.metadata.permissions
        );
        if (!validPermissions.valid) {
          issues.push(...validPermissions.issues);
        }
      }

      return {
        passed: issues.length === 0,
        issues
      };
    } catch (error) {
      issues.push(`Validation error: ${error.message}`);
      return {
        passed: false,
        issues
      };
    }
  }

  private async reloadPlugin(pluginId: string): Promise<ReloadResult> {
    const startTime = Date.now();
    let backupPath: string | undefined;

    try {
      // 检查重载次数限制
      const attempts = this.reloadAttempts.get(pluginId) || 0;
      if (attempts >= this.config.maxReloadAttempts) {
        throw new Error(`Max reload attempts reached for plugin: ${pluginId}`);
      }

      // 检查重载时间间隔
      const lastReload = this.lastReload.get(pluginId) || 0;
      if (Date.now() - lastReload < this.config.reloadTimeout) {
        throw new Error(`Reload timeout not reached for plugin: ${pluginId}`);
      }

      logger.info('HotReload', `Reloading plugin: ${pluginId}`);

      // 获取当前插件实例
      const oldPlugin = this.manager.getPlugin(pluginId);
      if (!oldPlugin) {
        throw new Error(`Plugin not found: ${pluginId}`);
      }

      // 创建备份
      if (this.config.backupEnabled) {
        backupPath = await this.createBackup(pluginId);
      }

      // 卸载旧插件
      await this.manager.unloadPlugin(pluginId);

      // 清除 require 缓存
      this.clearRequireCache(pluginId);

      // 加载新插件
      const pluginPath = path.join(this.manager.getPluginsDir(), `${pluginId}.js`);
      const NewPluginClass = require(pluginPath).default;
      const newPlugin = new NewPluginClass();

      // 验证新插件
      if (this.config.validateAfterReload) {
        const validation = await this.validatePlugin(newPlugin);
        if (!validation.passed) {
          throw new Error(`Plugin validation failed: ${validation.issues.join(', ')}`);
        }
      }

      // 注册新插件
      await this.manager.loadPlugin(newPlugin);

      // 更新计数器
      this.reloadAttempts.set(pluginId, attempts + 1);
      this.lastReload.set(pluginId, Date.now());

      const result: ReloadResult = {
        success: true,
        pluginId,
        timestamp: Date.now(),
        duration: Date.now() - startTime
      };

      // 发出重载成功事件
      this.emit('reloadSuccess', result);

      logger.info('HotReload', `Successfully reloaded plugin: ${pluginId}`);
      return result;

    } catch (error) {
      logger.error('HotReload', `Failed to reload plugin: ${pluginId}`, error);

      const result: ReloadResult = {
        success: false,
        pluginId,
        timestamp: Date.now(),
        duration: Date.now() - startTime,
        error: error instanceof Error ? error : new Error(String(error))
      };

      // 发出重载失败事件
      this.emit('reloadError', result);

      // 尝试回滚
      if (backupPath) {
        await this.rollbackPlugin(pluginId, backupPath);
      }

      return result;
    }
  }

  private async rollbackPlugin(pluginId: string, backupPath: string): Promise<void> {
    try {
      logger.info('HotReload', `Rolling back plugin: ${pluginId}`);

      // 恢复备份文件
      const pluginPath = path.join(this.manager.getPluginsDir(), `${pluginId}.js`);
      await fs.promises.copyFile(backupPath, pluginPath);

      // 重新加载插件
      await this.reloadPlugin(pluginId);

      logger.info('HotReload', `Successfully rolled back plugin: ${pluginId}`);
    } catch (error) {
      logger.error('HotReload', `Failed to roll back plugin: ${pluginId}`, error);

      // 发出回滚失败事件
      this.emit('rollbackError', {
        pluginId,
        error,
        timestamp: Date.now()
      });
    }
  }

  private async processReloadQueue(): Promise<void> {
    const plugins = Array.from(this.reloadQueue);
    this.reloadQueue.clear();

    for (const pluginId of plugins) {
      await this.reloadPlugin(pluginId);
    }
  }

  private handleFileChange(eventType: string, filename: string): void {
    if (!filename) return;

    // 检查文件是否匹配监视模式
    if (!this.matchesWatchPatterns(filename)) {
      return;
    }

    // 获取插件ID
    const pluginId = this.getPluginIdFromFile(filename);
    if (!pluginId) {
      return;
    }

    // 添加到重载队列
    this.reloadQueue.add(pluginId);

    // 防抖处理
    if (this.reloadTimer) {
      clearTimeout(this.reloadTimer);
    }

    this.reloadTimer = setTimeout(
      () => this.processReloadQueue(),
      this.RELOAD_DEBOUNCE
    );
  }

  private matchesWatchPatterns(filename: string): boolean {
    return this.config.watchPatterns.some(pattern => {
      const regex = new RegExp(pattern.replace('*', '.*'));
      return regex.test(filename);
    });
  }

  private getPluginIdFromFile(filename: string): string | null {
    const match = filename.match(/^(.+?)\.(js|ts)$/);
    return match ? match[1] : null;
  }

  private clearRequireCache(pluginId: string): void {
    const pluginPath = path.join(this.manager.getPluginsDir(), `${pluginId}.js`);
    delete require.cache[require.resolve(pluginPath)];
  }

  public async stop(): Promise<void> {
    if (this.watcher) {
      this.watcher.close();
    }

    if (this.reloadTimer) {
      clearTimeout(this.reloadTimer);
    }

    this.reloadQueue.clear();
    this.reloadAttempts.clear();
    this.lastReload.clear();

    logger.info('HotReload', 'Plugin hot reload stopped');
  }
} 