import { BaseError } from '@lumix/core';

export class PluginLoaderError extends BaseError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'PluginLoaderError';
  }
}

/**
 * 插件生命周期状态
 */
export enum PluginState {
  REGISTERED = 'registered',
  INITIALIZED = 'initialized',
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  ERROR = 'error'
}

/**
 * 插件元数据
 */
export interface PluginMetadata {
  id: string;
  name: string;
  version: string;
  description?: string;
  author?: string;
  homepage?: string;
  repository?: string;
  license?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  engines?: {
    node?: string;
    npm?: string;
  };
  tags?: string[];
}

/**
 * 插件配置
 */
export interface PluginConfig {
  // 基础配置
  enabled?: boolean;
  autoStart?: boolean;
  priority?: number;
  timeout?: number;

  // 依赖配置
  dependencies?: string[];
  optionalDependencies?: string[];
  conflictsWith?: string[];

  // 沙箱配置
  sandbox?: {
    enabled?: boolean;
    permissions?: string[];
    memoryLimit?: number;
    cpuLimit?: number;
  };

  // 热重载配置
  hotReload?: {
    enabled?: boolean;
    watchPatterns?: string[];
    debounceInterval?: number;
  };

  // 错误处理配置
  errorHandling?: {
    maxRetries?: number;
    retryDelay?: number;
    failureThreshold?: number;
  };
}

/**
 * 插件接口
 */
export interface Plugin {
  // 生命周期方法
  initialize?(config?: any): Promise<void>;
  start?(): Promise<void>;
  stop?(): Promise<void>;
  uninstall?(): Promise<void>;

  // 状态方法
  getState?(): PluginState;
  getMetadata?(): PluginMetadata;
  getConfig?(): PluginConfig;

  // 依赖方法
  getDependencies?(): string[];
  hasDependency?(pluginId: string): boolean;

  // 事件处理
  onError?(error: Error): void;
  onStateChange?(state: PluginState): void;
  onConfigChange?(config: PluginConfig): void;
}

/**
 * 插件描述符
 */
export interface PluginDescriptor {
  id: string;
  path: string;
  metadata: PluginMetadata;
  config: PluginConfig;
  instance?: Plugin;
  state: PluginState;
  error?: Error;
  dependencies: Set<string>;
  dependents: Set<string>;
  lastUpdated: number;
}

/**
 * 插件加载器配置
 */
export interface LoaderConfig {
  // 插件目录配置
  pluginsDir?: string;
  tempDir?: string;
  cacheDir?: string;

  // 加载配置
  autoLoad?: boolean;
  loadTimeout?: number;
  maxConcurrentLoads?: number;
  retryAttempts?: number;

  // 沙箱配置
  sandboxEnabled?: boolean;
  defaultPermissions?: string[];
  isolationLevel?: 'none' | 'process' | 'vm';

  // 依赖配置
  resolveDependencies?: boolean;
  strictDependencies?: boolean;
  allowMissingDependencies?: boolean;

  // 缓存配置
  cacheEnabled?: boolean;
  cacheExpiration?: number;
  clearCacheOnStart?: boolean;

  // 监控配置
  watchEnabled?: boolean;
  watchInterval?: number;
  watchPatterns?: string[];
}

/**
 * 插件加载结果
 */
export interface LoadResult {
  success: boolean;
  pluginId: string;
  error?: Error;
  timings: {
    start: number;
    end: number;
    duration: number;
  };
  metadata?: {
    state: PluginState;
    dependencies: string[];
    memoryUsage?: number;
    cpuUsage?: number;
  };
}

/**
 * 插件卸载结果
 */
export interface UnloadResult {
  success: boolean;
  pluginId: string;
  error?: Error;
  timings: {
    start: number;
    end: number;
    duration: number;
  };
  metadata?: {
    state: PluginState;
    dependents: string[];
    cleanupActions: string[];
  };
}

/**
 * 插件事件
 */
export interface PluginEvent {
  type: 'load' | 'unload' | 'error' | 'state' | 'config';
  pluginId: string;
  timestamp: number;
  data?: any;
}

/**
 * 插件统计信息
 */
export interface PluginStats {
  totalPlugins: number;
  activePlugins: number;
  failedPlugins: number;
  memoryUsage: {
    total: number;
    byPlugin: Record<string, number>;
  };
  cpuUsage: {
    total: number;
    byPlugin: Record<string, number>;
  };
  loadTimes: {
    average: number;
    byPlugin: Record<string, number>;
  };
  errorCounts: {
    total: number;
    byPlugin: Record<string, number>;
  };
  lastUpdated: number;
} 