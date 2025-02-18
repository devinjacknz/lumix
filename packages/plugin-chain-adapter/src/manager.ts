import { EventEmitter } from 'events';
import {
  ChainAdapterManager,
  ChainAdapter,
  ChainConfig,
  ChainState,
  ChainAdapterError
} from './types';
import { ChainAdapterRegistryImpl } from './registry';

/**
 * 链适配器管理器实现
 */
export class ChainAdapterManagerImpl implements ChainAdapterManager {
  private static instance: ChainAdapterManagerImpl;
  private registry: ChainAdapterRegistryImpl;
  private adapters: Map<number, ChainAdapter>;
  private configs: Map<number, ChainConfig>;
  private states: Map<number, ChainState>;
  private eventEmitter: EventEmitter;
  private updateInterval: NodeJS.Timeout | null;

  private constructor() {
    this.registry = ChainAdapterRegistryImpl.getInstance();
    this.adapters = new Map();
    this.configs = new Map();
    this.states = new Map();
    this.eventEmitter = new EventEmitter();
    this.updateInterval = null;
  }

  /**
   * 获取单例实例
   */
  public static getInstance(): ChainAdapterManagerImpl {
    if (!ChainAdapterManagerImpl.instance) {
      ChainAdapterManagerImpl.instance = new ChainAdapterManagerImpl();
    }
    return ChainAdapterManagerImpl.instance;
  }

  /**
   * 添加链
   */
  public async addChain(config: ChainConfig): Promise<void> {
    try {
      // 检查是否已存在
      if (this.adapters.has(config.id)) {
        throw new ChainAdapterError(`Chain already exists: ${config.id}`);
      }

      // 创建适配器
      const adapter = await this.registry.createAdapter(config);

      // 初始化适配器
      await adapter.initialize(config);
      await adapter.connect();

      // 存储适配器和配置
      this.adapters.set(config.id, adapter);
      this.configs.set(config.id, config);

      // 更新状态
      const state = await adapter.getChainState();
      this.states.set(config.id, state);

      // 触发事件
      this.eventEmitter.emit('chainAdded', config.id);

      // 启动状态更新
      this.startStateUpdates();
    } catch (error) {
      throw new ChainAdapterError('Failed to add chain', { cause: error });
    }
  }

  /**
   * 移除链
   */
  public async removeChain(chainId: number): Promise<void> {
    try {
      const adapter = this.adapters.get(chainId);
      if (!adapter) {
        throw new ChainAdapterError(`Chain not found: ${chainId}`);
      }

      // 断开连接
      await adapter.disconnect();

      // 移除适配器和配置
      this.adapters.delete(chainId);
      this.configs.delete(chainId);
      this.states.delete(chainId);

      // 触发事件
      this.eventEmitter.emit('chainRemoved', chainId);

      // 如果没有适配器了，停止状态更新
      if (this.adapters.size === 0) {
        this.stopStateUpdates();
      }
    } catch (error) {
      throw new ChainAdapterError('Failed to remove chain', { cause: error });
    }
  }

  /**
   * 获取链适配器
   */
  public getChain(chainId: number): ChainAdapter | undefined {
    return this.adapters.get(chainId);
  }

  /**
   * 获取所有链适配器
   */
  public getAllChains(): ChainAdapter[] {
    return Array.from(this.adapters.values());
  }

  /**
   * 更新链状态
   */
  public async updateChainState(chainId: number): Promise<ChainState> {
    try {
      const adapter = this.adapters.get(chainId);
      if (!adapter) {
        throw new ChainAdapterError(`Chain not found: ${chainId}`);
      }

      const state = await adapter.getChainState();
      this.states.set(chainId, state);

      // 触发事件
      this.eventEmitter.emit('chainStateUpdated', chainId, state);

      return state;
    } catch (error) {
      throw new ChainAdapterError('Failed to update chain state', {
        cause: error
      });
    }
  }

  /**
   * 获取所有链状态
   */
  public async getAllChainStates(): Promise<Record<number, ChainState>> {
    const states: Record<number, ChainState> = {};
    for (const [chainId, state] of this.states.entries()) {
      states[chainId] = state;
    }
    return states;
  }

  /**
   * 更新链配置
   */
  public async updateChainConfig(
    chainId: number,
    config: Partial<ChainConfig>
  ): Promise<void> {
    try {
      const adapter = this.adapters.get(chainId);
      if (!adapter) {
        throw new ChainAdapterError(`Chain not found: ${chainId}`);
      }

      const currentConfig = this.configs.get(chainId);
      if (!currentConfig) {
        throw new ChainAdapterError(`Config not found: ${chainId}`);
      }

      // 合并配置
      const newConfig = {
        ...currentConfig,
        ...config
      };

      // 验证配置
      const isValid = await this.registry.validateConfig(newConfig);
      if (!isValid) {
        throw new ChainAdapterError(`Invalid config for chain: ${chainId}`);
      }

      // 更新适配器
      await adapter.initialize(newConfig);

      // 更新配置
      this.configs.set(chainId, newConfig);

      // 触发事件
      this.eventEmitter.emit('chainConfigUpdated', chainId, newConfig);
    } catch (error) {
      throw new ChainAdapterError('Failed to update chain config', {
        cause: error
      });
    }
  }

  /**
   * 获取链配置
   */
  public getChainConfig(chainId: number): ChainConfig | undefined {
    return this.configs.get(chainId);
  }

  /**
   * 获取所有链配置
   */
  public getAllChainConfigs(): Record<number, ChainConfig> {
    const configs: Record<number, ChainConfig> = {};
    for (const [chainId, config] of this.configs.entries()) {
      configs[chainId] = config;
    }
    return configs;
  }

  /**
   * 注册事件监听器
   */
  public on(event: string, listener: (...args: any[]) => void): void {
    this.eventEmitter.on(event, listener);
  }

  /**
   * 移除事件监听器
   */
  public off(event: string, listener: (...args: any[]) => void): void {
    this.eventEmitter.off(event, listener);
  }

  /**
   * 注册一次性事件监听器
   */
  public once(event: string, listener: (...args: any[]) => void): void {
    this.eventEmitter.once(event, listener);
  }

  /**
   * 启动状态更新
   */
  private startStateUpdates(): void {
    if (this.updateInterval) {
      return;
    }

    this.updateInterval = setInterval(async () => {
      try {
        for (const chainId of this.adapters.keys()) {
          await this.updateChainState(chainId);
        }
      } catch (error) {
        this.eventEmitter.emit('error', error);
      }
    }, 10000); // 每10秒更新一次
  }

  /**
   * 停止状态更新
   */
  private stopStateUpdates(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }
} 