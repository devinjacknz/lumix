import { EventEmitter } from 'events';
import {
  Plugin,
  PluginState,
  PluginDescriptor,
  PluginConfig,
  PluginEvent,
  LoadResult,
  UnloadResult,
  PluginLoaderError
} from '../types';
import { DependencyResolver } from '../dependency/resolver';

export class PluginLifecycleManager extends EventEmitter {
  private plugins: Map<string, PluginDescriptor>;
  private dependencyResolver: DependencyResolver;
  private stateChangeHandlers: Map<string, (state: PluginState) => void>;
  private configChangeHandlers: Map<string, (config: PluginConfig) => void>;
  private errorHandlers: Map<string, (error: Error) => void>;

  constructor() {
    super();
    this.plugins = new Map();
    this.dependencyResolver = new DependencyResolver();
    this.stateChangeHandlers = new Map();
    this.configChangeHandlers = new Map();
    this.errorHandlers = new Map();
  }

  /**
   * 注册插件
   */
  async registerPlugin(
    descriptor: PluginDescriptor
  ): Promise<LoadResult> {
    try {
      const startTime = Date.now();

      // 验证插件描述符
      this.validateDescriptor(descriptor);

      // 检查是否已存在
      if (this.plugins.has(descriptor.id)) {
        throw new PluginLoaderError(`Plugin ${descriptor.id} already registered`);
      }

      // 注册依赖关系
      this.dependencyResolver.addPlugin(descriptor);

      // 验证依赖关系
      this.dependencyResolver.validateDependencies(descriptor.id);

      // 设置事件处理器
      this.setupEventHandlers(descriptor);

      // 保存插件描述符
      this.plugins.set(descriptor.id, {
        ...descriptor,
        state: PluginState.REGISTERED,
        error: undefined,
        lastUpdated: Date.now()
      });

      // 触发事件
      this.emitPluginEvent('register', descriptor.id);

      return {
        success: true,
        pluginId: descriptor.id,
        timings: {
          start: startTime,
          end: Date.now(),
          duration: Date.now() - startTime
        },
        metadata: {
          state: PluginState.REGISTERED,
          dependencies: Array.from(descriptor.dependencies),
          memoryUsage: process.memoryUsage().heapUsed,
          cpuUsage: process.cpuUsage().user
        }
      };
    } catch (error) {
      return {
        success: false,
        pluginId: descriptor.id,
        error: error instanceof Error ? error : new Error(String(error)),
        timings: {
          start: Date.now(),
          end: Date.now(),
          duration: 0
        }
      };
    }
  }

  /**
   * 初始化插件
   */
  async initializePlugin(
    pluginId: string,
    config?: any
  ): Promise<LoadResult> {
    try {
      const startTime = Date.now();
      const descriptor = this.getPluginDescriptor(pluginId);

      // 检查依赖是否已初始化
      const dependencies = this.dependencyResolver.getDependencies(pluginId);
      for (const depId of dependencies) {
        const depDescriptor = this.getPluginDescriptor(depId);
        if (depDescriptor.state !== PluginState.INITIALIZED) {
          throw new PluginLoaderError(
            `Dependency ${depId} not initialized for plugin ${pluginId}`
          );
        }
      }

      // 调用插件初始化方法
      if (descriptor.instance?.initialize) {
        await descriptor.instance.initialize(config);
      }

      // 更新状态
      descriptor.state = PluginState.INITIALIZED;
      descriptor.lastUpdated = Date.now();

      // 触发事件
      this.emitPluginEvent('initialize', pluginId);

      return {
        success: true,
        pluginId,
        timings: {
          start: startTime,
          end: Date.now(),
          duration: Date.now() - startTime
        },
        metadata: {
          state: PluginState.INITIALIZED,
          dependencies: Array.from(dependencies),
          memoryUsage: process.memoryUsage().heapUsed,
          cpuUsage: process.cpuUsage().user
        }
      };
    } catch (error) {
      const descriptor = this.getPluginDescriptor(pluginId);
      descriptor.state = PluginState.ERROR;
      descriptor.error = error instanceof Error ? error : new Error(String(error));
      this.emitPluginEvent('error', pluginId, { error: descriptor.error });
      return {
        success: false,
        pluginId,
        error: descriptor.error,
        timings: {
          start: Date.now(),
          end: Date.now(),
          duration: 0
        }
      };
    }
  }

  /**
   * 启动插件
   */
  async startPlugin(pluginId: string): Promise<LoadResult> {
    try {
      const startTime = Date.now();
      const descriptor = this.getPluginDescriptor(pluginId);

      // 检查状态
      if (descriptor.state !== PluginState.INITIALIZED) {
        throw new PluginLoaderError(
          `Plugin ${pluginId} not initialized`
        );
      }

      // 调用插件启动方法
      if (descriptor.instance?.start) {
        await descriptor.instance.start();
      }

      // 更新状态
      descriptor.state = PluginState.ACTIVE;
      descriptor.lastUpdated = Date.now();

      // 触发事件
      this.emitPluginEvent('start', pluginId);

      return {
        success: true,
        pluginId,
        timings: {
          start: startTime,
          end: Date.now(),
          duration: Date.now() - startTime
        },
        metadata: {
          state: PluginState.ACTIVE,
          dependencies: Array.from(descriptor.dependencies),
          memoryUsage: process.memoryUsage().heapUsed,
          cpuUsage: process.cpuUsage().user
        }
      };
    } catch (error) {
      const descriptor = this.getPluginDescriptor(pluginId);
      descriptor.state = PluginState.ERROR;
      descriptor.error = error instanceof Error ? error : new Error(String(error));
      this.emitPluginEvent('error', pluginId, { error: descriptor.error });
      return {
        success: false,
        pluginId,
        error: descriptor.error,
        timings: {
          start: Date.now(),
          end: Date.now(),
          duration: 0
        }
      };
    }
  }

  /**
   * 停止插件
   */
  async stopPlugin(pluginId: string): Promise<UnloadResult> {
    try {
      const startTime = Date.now();
      const descriptor = this.getPluginDescriptor(pluginId);

      // 检查依赖项
      const dependents = this.dependencyResolver.getDependents(pluginId);
      for (const depId of dependents) {
        const depDescriptor = this.getPluginDescriptor(depId);
        if (depDescriptor.state === PluginState.ACTIVE) {
          throw new PluginLoaderError(
            `Cannot stop plugin ${pluginId}: dependent plugin ${depId} is still active`
          );
        }
      }

      // 调用插件停止方法
      if (descriptor.instance?.stop) {
        await descriptor.instance.stop();
      }

      // 更新状态
      descriptor.state = PluginState.INACTIVE;
      descriptor.lastUpdated = Date.now();

      // 触发事件
      this.emitPluginEvent('stop', pluginId);

      return {
        success: true,
        pluginId,
        timings: {
          start: startTime,
          end: Date.now(),
          duration: Date.now() - startTime
        },
        metadata: {
          state: PluginState.INACTIVE,
          dependents: Array.from(dependents),
          cleanupActions: ['stop']
        }
      };
    } catch (error) {
      const descriptor = this.getPluginDescriptor(pluginId);
      descriptor.state = PluginState.ERROR;
      descriptor.error = error instanceof Error ? error : new Error(String(error));
      this.emitPluginEvent('error', pluginId, { error: descriptor.error });
      return {
        success: false,
        pluginId,
        error: descriptor.error,
        timings: {
          start: Date.now(),
          end: Date.now(),
          duration: 0
        }
      };
    }
  }

  /**
   * 卸载插件
   */
  async unloadPlugin(pluginId: string): Promise<UnloadResult> {
    try {
      const startTime = Date.now();
      const descriptor = this.getPluginDescriptor(pluginId);

      // 检查依赖项
      const dependents = this.dependencyResolver.getDependents(pluginId);
      if (dependents.size > 0) {
        throw new PluginLoaderError(
          `Cannot unload plugin ${pluginId}: has dependent plugins ${Array.from(dependents).join(', ')}`
        );
      }

      // 如果插件还在运行，先停止它
      if (descriptor.state === PluginState.ACTIVE) {
        await this.stopPlugin(pluginId);
      }

      // 调用插件卸载方法
      if (descriptor.instance?.uninstall) {
        await descriptor.instance.uninstall();
      }

      // 移除事件处理器
      this.removeEventHandlers(descriptor);

      // 移除依赖关系
      this.dependencyResolver.removePlugin(pluginId);

      // 移除插件
      this.plugins.delete(pluginId);

      // 触发事件
      this.emitPluginEvent('unload', pluginId);

      return {
        success: true,
        pluginId,
        timings: {
          start: startTime,
          end: Date.now(),
          duration: Date.now() - startTime
        },
        metadata: {
          state: PluginState.INACTIVE,
          dependents: [],
          cleanupActions: ['stop', 'uninstall', 'cleanup']
        }
      };
    } catch (error) {
      return {
        success: false,
        pluginId,
        error: error instanceof Error ? error : new Error(String(error)),
        timings: {
          start: Date.now(),
          end: Date.now(),
          duration: 0
        }
      };
    }
  }

  /**
   * 获取插件描述符
   */
  getPluginDescriptor(pluginId: string): PluginDescriptor {
    const descriptor = this.plugins.get(pluginId);
    if (!descriptor) {
      throw new PluginLoaderError(`Plugin ${pluginId} not found`);
    }
    return descriptor;
  }

  /**
   * 获取插件实例
   */
  getPlugin(pluginId: string): Plugin | undefined {
    return this.getPluginDescriptor(pluginId).instance;
  }

  /**
   * 获取所有插件
   */
  getAllPlugins(): Map<string, PluginDescriptor> {
    return new Map(this.plugins);
  }

  /**
   * 验证插件描述符
   */
  private validateDescriptor(descriptor: PluginDescriptor): void {
    if (!descriptor.id) {
      throw new PluginLoaderError('Plugin ID is required');
    }
    if (!descriptor.path) {
      throw new PluginLoaderError('Plugin path is required');
    }
    if (!descriptor.metadata) {
      throw new PluginLoaderError('Plugin metadata is required');
    }
    if (!descriptor.metadata.name) {
      throw new PluginLoaderError('Plugin name is required');
    }
    if (!descriptor.metadata.version) {
      throw new PluginLoaderError('Plugin version is required');
    }
  }

  /**
   * 设置事件处理器
   */
  private setupEventHandlers(descriptor: PluginDescriptor): void {
    if (descriptor.instance) {
      // 状态变更处理器
      if (descriptor.instance.onStateChange) {
        this.stateChangeHandlers.set(
          descriptor.id,
          descriptor.instance.onStateChange.bind(descriptor.instance)
        );
      }

      // 配置变更处理器
      if (descriptor.instance.onConfigChange) {
        this.configChangeHandlers.set(
          descriptor.id,
          descriptor.instance.onConfigChange.bind(descriptor.instance)
        );
      }

      // 错误处理器
      if (descriptor.instance.onError) {
        this.errorHandlers.set(
          descriptor.id,
          descriptor.instance.onError.bind(descriptor.instance)
        );
      }
    }
  }

  /**
   * 移除事件处理器
   */
  private removeEventHandlers(descriptor: PluginDescriptor): void {
    this.stateChangeHandlers.delete(descriptor.id);
    this.configChangeHandlers.delete(descriptor.id);
    this.errorHandlers.delete(descriptor.id);
  }

  /**
   * 触发插件事件
   */
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

    // 触发全局事件
    this.emit(type, event);

    // 触发特定处理器
    switch (type) {
      case 'state':
        this.stateChangeHandlers.get(pluginId)?.(data.state);
        break;
      case 'config':
        this.configChangeHandlers.get(pluginId)?.(data.config);
        break;
      case 'error':
        this.errorHandlers.get(pluginId)?.(data.error);
        break;
    }
  }
} 