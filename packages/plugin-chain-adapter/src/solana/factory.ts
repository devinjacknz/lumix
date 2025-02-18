import {
  ChainAdapterFactory,
  ChainAdapter,
  ChainConfig,
  ChainType,
  ChainAdapterError
} from '../types';
import { SolanaChainAdapter } from './adapter';

export class SolanaChainAdapterFactory implements ChainAdapterFactory {
  private adapters: Map<number, SolanaChainAdapter>;
  private supportedNetworks: Map<number, ChainConfig>;

  constructor() {
    this.adapters = new Map();
    this.supportedNetworks = new Map();

    // 初始化支持的网络
    this.initializeSupportedNetworks();
  }

  /**
   * 创建链适配器
   */
  async createAdapter(
    type: ChainType,
    config: ChainConfig
  ): Promise<ChainAdapter> {
    if (type !== ChainType.SOLANA) {
      throw new ChainAdapterError(`Unsupported chain type: ${type}`);
    }

    // 验证配置
    this.validateChainConfig(type, config);

    // 检查是否已存在适配器
    let adapter = this.adapters.get(config.id);
    if (adapter) {
      return adapter;
    }

    // 创建新适配器
    adapter = new SolanaChainAdapter(config);
    await adapter.initialize();
    this.adapters.set(config.id, adapter);

    return adapter;
  }

  /**
   * 获取支持的链类型
   */
  getSupportedChainTypes(): ChainType[] {
    return [ChainType.SOLANA];
  }

  /**
   * 验证链配置
   */
  validateChainConfig(type: ChainType, config: ChainConfig): boolean {
    if (type !== ChainType.SOLANA) {
      return false;
    }

    // 验证必需字段
    if (!config.id || !config.name || !config.rpcUrls || config.rpcUrls.length === 0) {
      throw new ChainAdapterError('Missing required chain configuration');
    }

    // 验证 RPC URL 格式
    for (const url of config.rpcUrls) {
      try {
        new URL(url);
      } catch {
        throw new ChainAdapterError(`Invalid RPC URL: ${url}`);
      }
    }

    // 验证原生货币配置
    if (!config.nativeCurrency ||
        !config.nativeCurrency.name ||
        !config.nativeCurrency.symbol ||
        typeof config.nativeCurrency.decimals !== 'number') {
      throw new ChainAdapterError('Invalid native currency configuration');
    }

    // 验证区块浏览器 URL
    if (config.blockExplorerUrls) {
      for (const url of config.blockExplorerUrls) {
        try {
          new URL(url);
        } catch {
          throw new ChainAdapterError(`Invalid block explorer URL: ${url}`);
        }
      }
    }

    // 验证性能配置
    if (config.blockTime && config.blockTime < 0) {
      throw new ChainAdapterError('Block time must be positive');
    }
    if (config.confirmations && config.confirmations < 0) {
      throw new ChainAdapterError('Confirmations must be positive');
    }
    if (config.maxBlockRange && config.maxBlockRange < 1) {
      throw new ChainAdapterError('Max block range must be greater than 0');
    }
    if (config.batchSize && config.batchSize < 1) {
      throw new ChainAdapterError('Batch size must be greater than 0');
    }

    // 验证重试配置
    if (config.retryAttempts && config.retryAttempts < 0) {
      throw new ChainAdapterError('Retry attempts must be positive');
    }
    if (config.retryDelay && config.retryDelay < 0) {
      throw new ChainAdapterError('Retry delay must be positive');
    }
    if (config.timeout && config.timeout < 0) {
      throw new ChainAdapterError('Timeout must be positive');
    }

    return true;
  }

  /**
   * 获取适配器
   */
  getAdapter(chainId: number): SolanaChainAdapter | undefined {
    return this.adapters.get(chainId);
  }

  /**
   * 移除适配器
   */
  async removeAdapter(chainId: number): Promise<void> {
    const adapter = this.adapters.get(chainId);
    if (adapter) {
      await adapter.disconnect();
      this.adapters.delete(chainId);
    }
  }

  /**
   * 获取支持的网络配置
   */
  getSupportedNetwork(chainId: number): ChainConfig | undefined {
    return this.supportedNetworks.get(chainId);
  }

  /**
   * 获取所有支持的网络
   */
  getAllSupportedNetworks(): ChainConfig[] {
    return Array.from(this.supportedNetworks.values());
  }

  /**
   * 添加支持的网络
   */
  addSupportedNetwork(config: ChainConfig): void {
    this.validateChainConfig(ChainType.SOLANA, config);
    this.supportedNetworks.set(config.id, config);
  }

  /**
   * 移除支持的网络
   */
  removeSupportedNetwork(chainId: number): void {
    this.supportedNetworks.delete(chainId);
  }

  /**
   * 初始化支持的网络
   */
  private initializeSupportedNetworks(): void {
    // 主网
    this.addSupportedNetwork({
      id: 101,
      name: 'Solana Mainnet',
      type: ChainType.SOLANA,
      nativeCurrency: {
        name: 'SOL',
        symbol: 'SOL',
        decimals: 9
      },
      rpcUrls: ['https://api.mainnet-beta.solana.com'],
      blockExplorerUrls: ['https://explorer.solana.com'],
      blockTime: 400
    });

    // Devnet
    this.addSupportedNetwork({
      id: 102,
      name: 'Solana Devnet',
      type: ChainType.SOLANA,
      nativeCurrency: {
        name: 'SOL',
        symbol: 'SOL',
        decimals: 9
      },
      rpcUrls: ['https://api.devnet.solana.com'],
      blockExplorerUrls: ['https://explorer.solana.com/?cluster=devnet'],
      blockTime: 400,
      testnet: true
    });

    // Testnet
    this.addSupportedNetwork({
      id: 103,
      name: 'Solana Testnet',
      type: ChainType.SOLANA,
      nativeCurrency: {
        name: 'SOL',
        symbol: 'SOL',
        decimals: 9
      },
      rpcUrls: ['https://api.testnet.solana.com'],
      blockExplorerUrls: ['https://explorer.solana.com/?cluster=testnet'],
      blockTime: 400,
      testnet: true
    });
  }
}