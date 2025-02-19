export * from './types';
export * from './loader';
export * from './dependency/resolver';
export * from './sandbox/sandbox';

export interface PluginLoaderOptions {
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

export class PluginLoaderFactory {
  private static instance: PluginLoader;

  static getInstance(options?: PluginLoaderOptions): PluginLoader {
    if (!PluginLoaderFactory.instance) {
      PluginLoaderFactory.instance = new PluginLoader(options);
    }
    return PluginLoaderFactory.instance;
  }

  static async initialize(options?: PluginLoaderOptions): Promise<PluginLoader> {
    const loader = PluginLoaderFactory.getInstance(options);
    await loader.initialize();
    return loader;
  }

  static async destroy(): Promise<void> {
    if (PluginLoaderFactory.instance) {
      await PluginLoaderFactory.instance.stop();
      PluginLoaderFactory.instance = undefined;
    }
  }
} 