import { EventEmitter } from 'events';
import { Cache } from '@lumix/core';
import {
  PluginLoaderError,
  LoaderConfig,
  Plugin,
  PluginDescriptor,
  PluginState,
  PluginEvent,
  LoadResult,
  UnloadResult,
  PluginStats
} from './types';
import { DependencyResolver } from './dependency/resolver';
import { PluginSandbox, SandboxConfig } from './sandbox/sandbox';

export class PluginLoader extends EventEmitter {
  private config: Required<LoaderConfig>;
  private plugins: Map<string, PluginDescriptor>;
  private sandboxes: Map<string, PluginSandbox>;
  private dependencyResolver: DependencyResolver;
  private cache: Cache;
  private watcher?: NodeJS.Timer;

  constructor(config: LoaderConfig = {}) {
    super();
    this.config = {
      pluginsDir: config.pluginsDir || './plugins',
      tempDir: config.tempDir || './temp',
      cacheDir: config.cacheDir || './cache',
      autoLoad: config.autoLoad ?? true,
      loadTimeout: config.loadTimeout || 30000,
      maxConcurrentLoads: config.maxConcurrentLoads || 5,
      retryAttempts: config.retryAttempts || 3,
      sandboxEnabled: config.sandboxEnabled ?? true,
      defaultPermissions: config.defaultPermissions || [],
      isolationLevel: config.isolationLevel || 'vm',
      resolveDependencies: config.resolveDependencies ?? true,
      strictDependencies: config.strictDependencies ?? true,
      allowMissingDependencies: config.allowMissingDependencies ?? false,
      cacheEnabled: config.cacheEnabled ?? true,
      cacheExpiration: config.cacheExpiration || 24 * 60 * 60 * 1000,
      clearCacheOnStart: config.clearCacheOnStart ?? false,
      watchEnabled: config.watchEnabled ?? true,
      watchInterval: config.watchInterval || 5000,
      watchPatterns: config.watchPatterns || ['**/*.js', '**/*.json']
    };

    this.plugins = new Map();
    this.sandboxes = new Map();
    this.dependencyResolver = new DependencyResolver();
    this.cache = new Cache();
  }

  /**
   * 初始化加载器
   */
  async initialize(): Promise<void> {
    // 清理缓存
    if (this.config.clearCacheOnStart) {
      await this.cache.clear();
    }

    // 加载插件
    if (this.config.autoLoad) {
      await this.loadPlugins();
    }

    // 启动文件监控
    if (this.config.watchEnabled) {
      this.startWatcher();
    }
  }

  /**
   * 加载插件
   */
  async loadPlugins(): Promise<LoadResult[]> {
    const results: LoadResult[] = [];
    const pluginFiles = await this.discoverPlugins();

    // 按批次加载插件
    for (let i = 0; i < pluginFiles.length; i += this.config.maxConcurrentLoads) {
      const batch = pluginFiles.slice(i, i + this.config.maxConcurrentLoads);
      const batchResults = await Promise.all(
        batch.map(file => this.loadPlugin(file))
      );
      results.push(...batchResults);
    }

    return results;
  }

  /**
   * 加载单个插件
   */
  async loadPlugin(path: string): Promise<LoadResult> {
    const startTime = Date.now();

    try {
      // 检查缓存
      if (this.config.cacheEnabled) {
        const cached = await this.getFromCache(path);
        if (cached) {
          return cached;
        }
      }

      // 加载插件描述符
      const descriptor = await this.loadPluginDescriptor(path);

      // 验证依赖
      if (this.config.resolveDependencies) {
        this.dependencyResolver.validateDependencies(descriptor.id);
      }

      // 创建沙箱
      if (this.config.sandboxEnabled) {
        const sandbox = await this.createSandbox(descriptor);
        this.sandboxes.set(descriptor.id, sandbox);
      }

      // 初始化插件
      const plugin = await this.initializePlugin(descriptor);
      descriptor.instance = plugin;
      descriptor.state = PluginState.INITIALIZED;

      // 启动插件
      if (descriptor.config.autoStart) {
        await this.startPlugin(descriptor);
      }

      // 注册插件
      this.plugins.set(descriptor.id, descriptor);
      this.dependencyResolver.addPlugin(descriptor);

      const result: LoadResult = {
        success: true,
        pluginId: descriptor.id,
        timings: {
          start: startTime,
          end: Date.now(),
          duration: Date.now() - startTime
        },
        metadata: {
          state: descriptor.state,
          dependencies: Array.from(descriptor.dependencies),
          memoryUsage: this.sandboxes.get(descriptor.id)?.getStats().memoryUsage,
          cpuUsage: this.sandboxes.get(descriptor.id)?.getStats().cpuUsage
        }
      };

      // 更新缓存
      if (this.config.cacheEnabled) {
        await this.updateCache(path, result);
      }

      // 触发事件
      this.emitPluginEvent('load', descriptor.id);

      return result;
    } catch (error) {
      const result: LoadResult = {
        success: false,
        pluginId: path,
        error: error instanceof Error ? error : new PluginLoaderError('Unknown error'),
        timings: {
          start: startTime,
          end: Date.now(),
          duration: Date.now() - startTime
        }
      };

      // 触发事件
      this.emitPluginEvent('error', path, error);

      return result;
    }
  }

  /**
   * 卸载插件
   */
  async unloadPlugin(pluginId: string): Promise<UnloadResult> {
    const startTime = Date.now();

    try {
      const descriptor = this.plugins.get(pluginId);
      if (!descriptor) {
        throw new PluginLoaderError(`Plugin ${pluginId} not found`);
      }

      // 检查依赖
      const impact = this.dependencyResolver.getImpactAnalysis(pluginId);
      if (impact.totalImpact > 0 && this.config.strictDependencies) {
        throw new PluginLoaderError(
          `Cannot unload plugin ${pluginId}: has ${impact.totalImpact} dependents`
        );
      }

      // 停止插件
      if (descriptor.state === PluginState.ACTIVE) {
        await this.stopPlugin(descriptor);
      }

      // 卸载插件
      if (descriptor.instance?.uninstall) {
        await descriptor.instance.uninstall();
      }

      // 销毁沙箱
      const sandbox = this.sandboxes.get(pluginId);
      if (sandbox) {
        await sandbox.destroy();
        this.sandboxes.delete(pluginId);
      }

      // 移除插件
      this.plugins.delete(pluginId);
      this.dependencyResolver.removePlugin(pluginId);

      const result: UnloadResult = {
        success: true,
        pluginId,
        timings: {
          start: startTime,
          end: Date.now(),
          duration: Date.now() - startTime
        },
        metadata: {
          state: PluginState.INACTIVE,
          dependents: impact.directDependents,
          cleanupActions: ['stop', 'uninstall', 'destroy']
        }
      };

      // 触发事件
      this.emitPluginEvent('unload', pluginId);

      return result;
    } catch (error) {
      const result: UnloadResult = {
        success: false,
        pluginId,
        error: error instanceof Error ? error : new PluginLoaderError('Unknown error'),
        timings: {
          start: startTime,
          end: Date.now(),
          duration: Date.now() - startTime
        }
      };

      // 触发事件
      this.emitPluginEvent('error', pluginId, error);

      return result;
    }
  }

  /**
   * 重新加载插件
   */
  async reloadPlugin(pluginId: string): Promise<LoadResult> {
    await this.unloadPlugin(pluginId);
    const descriptor = this.plugins.get(pluginId);
    if (!descriptor) {
      throw new PluginLoaderError(`Plugin ${pluginId} not found`);
    }
    return await this.loadPlugin(descriptor.path);
  }

  /**
   * 获取插件
   */
  getPlugin(pluginId: string): Plugin | undefined {
    return this.plugins.get(pluginId)?.instance;
  }

  /**
   * 获取插件描述符
   */
  getPluginDescriptor(pluginId: string): PluginDescriptor | undefined {
    return this.plugins.get(pluginId);
  }

  /**
   * 获取所有插件
   */
  getAllPlugins(): Map<string, PluginDescriptor> {
    return this.plugins;
  }

  /**
   * 获取插件统计信息
   */
  getStats(): PluginStats {
    const plugins = Array.from(this.plugins.values());
    const sandboxStats = Array.from(this.sandboxes.values()).map(s => s.getStats());

    return {
      totalPlugins: plugins.length,
      activePlugins: plugins.filter(p => p.state === PluginState.ACTIVE).length,
      failedPlugins: plugins.filter(p => p.state === PluginState.ERROR).length,
      memoryUsage: {
        total: sandboxStats.reduce((sum, s) => sum + s.memoryUsage, 0),
        byPlugin: Object.fromEntries(
          Array.from(this.sandboxes.entries()).map(([id, sandbox]) => [
            id,
            sandbox.getStats().memoryUsage
          ])
        )
      },
      cpuUsage: {
        total: sandboxStats.reduce((sum, s) => sum + s.cpuUsage, 0),
        byPlugin: Object.fromEntries(
          Array.from(this.sandboxes.entries()).map(([id, sandbox]) => [
            id,
            sandbox.getStats().cpuUsage
          ])
        )
      },
      loadTimes: {
        average: plugins.reduce((sum, p) => sum + (p.lastUpdated - 0), 0) / plugins.length,
        byPlugin: Object.fromEntries(
          plugins.map(p => [p.id, p.lastUpdated - 0])
        )
      },
      errorCounts: {
        total: plugins.filter(p => p.error).length,
        byPlugin: Object.fromEntries(
          plugins.filter(p => p.error).map(p => [p.id, 1])
        )
      },
      lastUpdated: Date.now()
    };
  }

  /**
   * 停止加载器
   */
  async stop(): Promise<void> {
    // 停止文件监控
    if (this.watcher) {
      clearInterval(this.watcher);
      this.watcher = undefined;
    }

    // 卸载所有插件
    const unloadOrder = this.dependencyResolver.getUnloadOrder();
    for (const pluginId of unloadOrder) {
      await this.unloadPlugin(pluginId);
    }
  }

  private async discoverPlugins(): Promise<string[]> {
    // TODO: 实现插件发现逻辑
    return [];
  }

  private async loadPluginDescriptor(
    path: string
  ): Promise<PluginDescriptor> {
    // TODO: 实现插件描述符加载逻辑
    return {
      id: '',
      path: '',
      metadata: {
        id: '',
        name: '',
        version: ''
      },
      config: {},
      state: PluginState.REGISTERED,
      dependencies: new Set(),
      dependents: new Set(),
      lastUpdated: Date.now()
    };
  }

  private async createSandbox(
    descriptor: PluginDescriptor
  ): Promise<PluginSandbox> {
    const config: SandboxConfig = {
      isolationLevel: this.config.isolationLevel,
      permissions: [
        ...this.config.defaultPermissions,
        ...(descriptor.config.sandbox?.permissions || [])
      ],
      memoryLimit: descriptor.config.sandbox?.memoryLimit,
      cpuLimit: descriptor.config.sandbox?.cpuLimit
    };

    const sandbox = new PluginSandbox(config);
    await sandbox.initialize();
    return sandbox;
  }

  private async initializePlugin(
    descriptor: PluginDescriptor
  ): Promise<Plugin> {
    const sandbox = this.sandboxes.get(descriptor.id);
    if (sandbox) {
      // 在沙箱中初始化插件
      return await sandbox.execute(
        'new Plugin(config)',
        { config: descriptor.config }
      );
    } else {
      // 直接初始化插件
      const PluginClass = require(descriptor.path).default;
      return new PluginClass(descriptor.config);
    }
  }

  private async startPlugin(
    descriptor: PluginDescriptor
  ): Promise<void> {
    if (descriptor.instance?.start) {
      await descriptor.instance.start();
    }
    descriptor.state = PluginState.ACTIVE;
    this.emitPluginEvent('state', descriptor.id, { state: PluginState.ACTIVE });
  }

  private async stopPlugin(
    descriptor: PluginDescriptor
  ): Promise<void> {
    if (descriptor.instance?.stop) {
      await descriptor.instance.stop();
    }
    descriptor.state = PluginState.INACTIVE;
    this.emitPluginEvent('state', descriptor.id, { state: PluginState.INACTIVE });
  }

  private startWatcher(): void {
    this.watcher = setInterval(async () => {
      try {
        // 检查文件变化
        const changes = await this.checkFileChanges();
        
        // 重新加载变化的插件
        for (const [pluginId, path] of changes) {
          await this.reloadPlugin(pluginId);
        }
      } catch (error) {
        this.emit('error', error);
      }
    }, this.config.watchInterval);
  }

  private async checkFileChanges(): Promise<Map<string, string>> {
    // TODO: 实现文件变化检测逻辑
    return new Map();
  }

  private async getFromCache(
    path: string
  ): Promise<LoadResult | null> {
    if (!this.config.cacheEnabled) {
      return null;
    }

    const key = `plugin:${path}`;
    const cached = await this.cache.get<LoadResult>(key);

    if (cached && Date.now() - cached.timings.end < this.config.cacheExpiration) {
      return cached;
    }

    return null;
  }

  private async updateCache(
    path: string,
    result: LoadResult
  ): Promise<void> {
    if (!this.config.cacheEnabled) {
      return;
    }

    const key = `plugin:${path}`;
    await this.cache.set(
      key,
      result,
      this.config.cacheExpiration
    );
  }

  private emitPluginEvent(
    type: PluginEvent['type'],
    pluginId: string,
    data?: any
  ): void {
    const event: PluginEvent = {
      type,
      pluginId,
      timestamp: Date.now(),
      data
    };
    this.emit('plugin', event);
    this.emit(`plugin:${type}`, event);
  }
} 