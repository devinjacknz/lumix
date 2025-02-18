import {
  ChainAdapterRegistry,
  ChainAdapterFactory,
  ChainAdapter,
  ChainConfig,
  ChainAdapterError
} from './types';

/**
 * 链适配器注册表实现
 */
export class ChainAdapterRegistryImpl implements ChainAdapterRegistry {
  private static instance: ChainAdapterRegistryImpl;
  private factories: Map<string, ChainAdapterFactory>;

  private constructor() {
    this.factories = new Map();
  }

  /**
   * 获取单例实例
   */
  public static getInstance(): ChainAdapterRegistryImpl {
    if (!ChainAdapterRegistryImpl.instance) {
      ChainAdapterRegistryImpl.instance = new ChainAdapterRegistryImpl();
    }
    return ChainAdapterRegistryImpl.instance;
  }

  /**
   * 注册工厂
   */
  public registerFactory(factory: ChainAdapterFactory): void {
    if (this.factories.has(factory.type)) {
      throw new ChainAdapterError(
        `Factory already registered for type: ${factory.type}`
      );
    }
    this.factories.set(factory.type, factory);
  }

  /**
   * 注销工厂
   */
  public unregisterFactory(type: string): void {
    if (!this.factories.has(type)) {
      throw new ChainAdapterError(`Factory not found for type: ${type}`);
    }
    this.factories.delete(type);
  }

  /**
   * 获取工厂
   */
  public getFactory(type: string): ChainAdapterFactory | undefined {
    return this.factories.get(type);
  }

  /**
   * 获取所有工厂
   */
  public getAllFactories(): ChainAdapterFactory[] {
    return Array.from(this.factories.values());
  }

  /**
   * 创建适配器
   */
  public async createAdapter(config: ChainConfig): Promise<ChainAdapter> {
    const factory = this.factories.get(config.type);
    if (!factory) {
      throw new ChainAdapterError(`Factory not found for type: ${config.type}`);
    }

    try {
      // 验证配置
      const isValid = await factory.validateConfig(config);
      if (!isValid) {
        throw new ChainAdapterError(`Invalid config for type: ${config.type}`);
      }

      // 创建适配器
      return await factory.createAdapter(config);
    } catch (error) {
      throw new ChainAdapterError('Failed to create adapter', { cause: error });
    }
  }

  /**
   * 验证配置
   */
  public async validateConfig(config: ChainConfig): Promise<boolean> {
    const factory = this.factories.get(config.type);
    if (!factory) {
      throw new ChainAdapterError(`Factory not found for type: ${config.type}`);
    }

    try {
      return await factory.validateConfig(config);
    } catch (error) {
      throw new ChainAdapterError('Failed to validate config', { cause: error });
    }
  }

  /**
   * 获取默认配置
   */
  public getDefaultConfig(type: string): ChainConfig {
    const factory = this.factories.get(type);
    if (!factory) {
      throw new ChainAdapterError(`Factory not found for type: ${type}`);
    }

    try {
      return factory.getDefaultConfig();
    } catch (error) {
      throw new ChainAdapterError('Failed to get default config', {
        cause: error
      });
    }
  }
} 