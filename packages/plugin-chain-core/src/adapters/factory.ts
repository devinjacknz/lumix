import { ChainAdapter, ChainConfig, ChainCoreError } from '../types';
import { EVMChainAdapter } from './evm';
import { SolanaChainAdapter } from './solana';

export class ChainAdapterFactory {
  static create(config: ChainConfig): ChainAdapter {
    // 根据链 ID 或其他配置判断链类型
    if (typeof config.chainId === 'string' && config.chainId.toLowerCase() === 'solana') {
      return new SolanaChainAdapter(config);
    }
    
    // 默认使用 EVM 适配器
    return new EVMChainAdapter(config);
  }

  static async createAndConnect(config: ChainConfig): Promise<ChainAdapter> {
    const adapter = this.create(config);
    try {
      await adapter.connect();
      return adapter;
    } catch (error) {
      throw new ChainCoreError(`Failed to create and connect chain adapter: ${error.message}`);
    }
  }
} 