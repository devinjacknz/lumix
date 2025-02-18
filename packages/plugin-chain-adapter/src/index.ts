export * from './types';
export * from './manager';
export * from './registry';
export * from './evm/adapter';
export * from './evm/factory';

import { ChainConfig, ChainType } from './types';
import { ChainAdapterManagerImpl } from './manager';

export interface PluginConfig {
  chains?: ChainConfig[];
  stateUpdateInterval?: number;
}

export class ChainAdapterPlugin {
  private manager: ChainAdapterManagerImpl;

  constructor(config: PluginConfig = {}) {
    this.manager = new ChainAdapterManagerImpl();

    // 初始化配置的链
    if (config.chains) {
      for (const chainConfig of config.chains) {
        this.manager.addChain(chainConfig).catch(error => {
          console.error(`Failed to add chain ${chainConfig.id}:`, error);
        });
      }
    }
  }

  /**
   * 获取管理器实例
   */
  getManager(): ChainAdapterManagerImpl {
    return this.manager;
  }

  /**
   * 停止插件
   */
  stop(): void {
    this.manager.stop();
  }
} 