import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import { Plugin, PluginManager } from './plugin-manager';
import { logger } from '../monitoring';
import { configManager } from '../config';
import { PluginVersionManager } from './plugin-version';
import { PluginHotReloadConfig, PluginValidationResult } from './types';

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
  private pluginManager: PluginManager;
  private config: PluginHotReloadConfig;
  private retryMap: Map<string, number> = new Map();

  constructor(
    pluginManager: PluginManager,
    config: PluginHotReloadConfig
  ) {
    super();
    this.reloadAttempts = new Map();
    this.lastReload = new Map();
    this.reloadQueue = new Set();
    this.versionManager = new PluginVersionManager(process.env.CORE_VERSION || '1.0.0');
    this.pluginManager = pluginManager;
    this.config = config;
  }

  public async start(): Promise<void> {
    try {
      if (!this.config.enabled) {
        logger.info('HotReload', 'Hot reload is disabled');
        return;
      }

      // 创建备份目录
      if (this.config.backupEnabled) {
        await this.ensureBackupDir();
      }

      // 监听插件目录变化
      const pluginsDir = this.pluginManager.getPluginsDir();
      this.watcher = fs.watch(
        pluginsDir,
        { recursive: true },
        this.handleFileChange.bind(this)
      );

      logger.info('HotReload', 'Plugin hot reload started');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('HotReload', 'Failed to start hot reload', { error: message });
      throw error;
    }
  }

  private async ensureBackupDir(): Promise<void> {
    const backupDir = path.join(this.pluginManager.getPluginsDir(), this.config.backupDir);
    if (!fs.existsSync(backupDir)) {
      await fs.promises.mkdir(backupDir, { recursive: true });
    }
  }

  private async createBackup(pluginId: string): Promise<string> {
    const sourcePath = path.join(this.pluginManager.getPluginsDir(), `${pluginId}.js`);
    const backupPath = path.join(
      this.pluginManager.getPluginsDir(),
      this.config.backupDir,
      `${pluginId}_${Date.now()}.js`
    );

    await fs.promises.copyFile(sourcePath, backupPath);
    return backupPath;
  }

  private async validatePlugin(plugin: Plugin): Promise<PluginValidationResult> {
    const issues: string[] = [];

    // Validate required metadata
    if (!plugin.metadata?.name) {
      issues.push('Missing plugin name');
    }
    if (!plugin.metadata?.version) {
      issues.push('Missing plugin version');
    }

    // Validate permissions if present
    if (plugin.metadata?.permissions) {
      const validPermissions = await this.pluginManager.validatePermissions(plugin);
      if (!validPermissions) {
        issues.push('Invalid permissions');
      }
    }

    // Validate required methods
    if (typeof plugin.onLoad !== 'function') {
      issues.push('Missing onLoad method');
    }
    if (typeof plugin.onEnable !== 'function') {
      issues.push('Missing onEnable method');
    }

    return {
      valid: issues.length === 0,
      issues
    };
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
      const oldPlugin = this.pluginManager.getPlugin(pluginId);
      if (!oldPlugin) {
        throw new Error(`Plugin not found: ${pluginId}`);
      }

      // 创建备份
      if (this.config.backupEnabled) {
        backupPath = await this.createBackup(pluginId);
      }

      // 卸载旧插件
      await this.pluginManager.unloadPlugin(pluginId);

      // 清除 require 缓存
      this.clearRequireCache(pluginId);

      // 加载新插件
      const pluginPath = path.join(this.pluginManager.getPluginsDir(), `${pluginId}.js`);
      const NewPluginClass = require(pluginPath).default;
      const newPlugin = new NewPluginClass();

      // 验证新插件
      if (this.config.validateAfterReload) {
        const validation = await this.validatePlugin(newPlugin);
        if (!validation.valid) {
          throw new Error(`Plugin validation failed: ${validation.issues.join(', ')}`);
        }
      }

      // 注册新插件
      await this.pluginManager.loadPlugin(newPlugin);

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
      const pluginPath = path.join(this.pluginManager.getPluginsDir(), `${pluginId}.js`);
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
    const pluginPath = path.join(this.pluginManager.getPluginsDir(), `${pluginId}.js`);
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
    this.retryMap.clear();

    logger.info('HotReload', 'Plugin hot reload stopped');
  }
} 