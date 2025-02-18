import { Chain } from '@thirdweb-dev/chains';
import { DeFiProtocol, CrawlerConfig } from '../types';
import { UniswapAdapter } from './uniswap';
import { SushiswapAdapter } from './sushiswap';
import { PancakeswapAdapter } from './pancakeswap';
import { AaveAdapter } from './aave';
import { CompoundAdapter } from './compound';
import { CurveAdapter } from './curve';
import { BalancerAdapter } from './balancer';
import { RaydiumAdapter } from './raydium';
import { OrcaAdapter } from './orca';
import { logger } from '@lumix/core';

export interface ProtocolAdapter {
  name: string;
  chain: Chain;
  isSupported(address: string): Promise<boolean>;
  getProtocolInfo(address: string): Promise<DeFiProtocol>;
  getLiquidityPools(address: string): Promise<any[]>;
  getYieldStrategies(address: string): Promise<any[]>;
  getGovernanceInfo(address: string): Promise<any>;
  getAnalytics(address: string): Promise<any>;
}

export class ProtocolRegistry {
  private adapters: Map<string, ProtocolAdapter>;
  private config: CrawlerConfig;

  constructor(config: CrawlerConfig) {
    this.adapters = new Map();
    this.config = config;
    this.initializeAdapters();
  }

  private initializeAdapters(): void {
    // 初始化所有支持的协议适配器
    const adapters: ProtocolAdapter[] = [
      new UniswapAdapter(this.config),
      new SushiswapAdapter(this.config),
      new PancakeswapAdapter(this.config),
      new AaveAdapter(this.config),
      new CompoundAdapter(this.config),
      new CurveAdapter(this.config),
      new BalancerAdapter(this.config),
      new RaydiumAdapter(this.config),
      new OrcaAdapter(this.config)
    ];

    for (const adapter of adapters) {
      this.registerAdapter(adapter);
    }
  }

  public registerAdapter(adapter: ProtocolAdapter): void {
    const key = `${adapter.chain}:${adapter.name}`;
    this.adapters.set(key, adapter);
    logger.info('Protocol', `Registered adapter for ${adapter.name} on ${adapter.chain}`);
  }

  public unregisterAdapter(chain: Chain, name: string): void {
    const key = `${chain}:${name}`;
    this.adapters.delete(key);
    logger.info('Protocol', `Unregistered adapter for ${name} on ${chain}`);
  }

  public async getAdapter(chain: Chain, address: string): Promise<ProtocolAdapter | null> {
    // 遍历所有适配器，找到支持该地址的适配器
    for (const adapter of this.adapters.values()) {
      if (adapter.chain === chain && await adapter.isSupported(address)) {
        return adapter;
      }
    }
    return null;
  }

  public getAdapters(): ProtocolAdapter[] {
    return Array.from(this.adapters.values());
  }

  public getAdaptersByChain(chain: Chain): ProtocolAdapter[] {
    return Array.from(this.adapters.values()).filter(a => a.chain === chain);
  }

  public async analyzeProtocol(chain: Chain, address: string): Promise<DeFiProtocol | null> {
    const adapter = await this.getAdapter(chain, address);
    if (!adapter) {
      logger.warn('Protocol', `No adapter found for address ${address} on ${chain}`);
      return null;
    }

    try {
      const protocol = await adapter.getProtocolInfo(address);
      
      // 获取更多详细信息
      const [pools, strategies, governance, analytics] = await Promise.all([
        adapter.getLiquidityPools(address),
        adapter.getYieldStrategies(address),
        adapter.getGovernanceInfo(address),
        adapter.getAnalytics(address)
      ]);

      return {
        ...protocol,
        liquidityPools: pools,
        yieldStrategies: strategies,
        governance,
        analytics
      };
    } catch (error) {
      logger.error('Protocol', `Failed to analyze protocol ${address} on ${chain}`, error);
      return null;
    }
  }

  public async batchAnalyzeProtocols(
    chain: Chain,
    addresses: string[]
  ): Promise<(DeFiProtocol | null)[]> {
    // 并行分析多个协议
    const results = await Promise.all(
      addresses.map(address => this.analyzeProtocol(chain, address))
    );

    // 过滤掉失败的结果
    return results.filter(result => result !== null);
  }

  public getSupportedProtocols(): Array<{
    name: string;
    chain: Chain;
    features: string[];
  }> {
    return Array.from(this.adapters.values()).map(adapter => ({
      name: adapter.name,
      chain: adapter.chain,
      features: this.getAdapterFeatures(adapter)
    }));
  }

  private getAdapterFeatures(adapter: ProtocolAdapter): string[] {
    const features = ['basic_info'];
    
    // 检查适配器支持的功能
    if (adapter.getLiquidityPools) features.push('liquidity_pools');
    if (adapter.getYieldStrategies) features.push('yield_strategies');
    if (adapter.getGovernanceInfo) features.push('governance');
    if (adapter.getAnalytics) features.push('analytics');

    return features;
  }
} 