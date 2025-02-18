import { Plugin, PluginManager, PluginContext, PluginAPI, PluginHooks, PluginUtils } from '@lumix/core';
import { HeliusClient } from '@lumix/helius';
import { 
  PriceData, 
  PriceSource, 
  PriceOracleConfig,
  TokenPair,
  ChainType,
  PriceSourceType
} from './types';
import { DexScreenerSource } from './sources/dexscreener';
import { PythSource } from './sources/pyth';
import { ChainlinkSource } from './sources/chainlink';
import { HeliusSource } from './sources/helius';
import { metadata } from './metadata';

export class PriceOraclePlugin implements Plugin {
  public readonly metadata = metadata;
  public isEnabled = false;
  public isLoaded = false;

  private sources: Map<PriceSourceType, PriceSource>;
  private defaultSource: PriceSourceType;
  private minimumConfidence: number;
  private cache: Map<string, { data: PriceData; timestamp: number }>;
  private cacheDuration: number;
  private chainConfigs: Map<ChainType, {
    preferredSource: PriceSourceType;
    minConfidence: number;
    maxPriceDeviation: number;
  }>;
  private heliusClient?: HeliusClient;
  private context?: PluginContext;
  private api?: PluginAPI;
  private hooks?: PluginHooks;
  private utils?: PluginUtils;

  constructor(config?: PriceOracleConfig) {
    this.sources = new Map();
    this.cache = new Map();
    this.chainConfigs = new Map();
    
    // 默认配置
    this.minimumConfidence = config?.minimumConfidence || 0.8;
    this.cacheDuration = config?.cacheDuration || 60000; // 1分钟
    
    // 初始化默认数据源
    const defaultSources = [
      new DexScreenerSource(), 
      new PythSource(),
      new ChainlinkSource()
    ];
    defaultSources.forEach(source => this.addSource(source));
    
    // 设置默认数据源优先级
    this.defaultSource = PriceSourceType.CHAINLINK;

    // 初始化链配置
    if (config?.chainConfigs) {
      Object.entries(config.chainConfigs).forEach(([chain, conf]) => {
        this.chainConfigs.set(chain as ChainType, {
          preferredSource: conf.preferredSource || this.defaultSource,
          minConfidence: conf.minConfidence,
          maxPriceDeviation: conf.maxPriceDeviation
        });
      });
    } else {
      // 设置默认链配置
      this.chainConfigs.set(ChainType.ETH, {
        preferredSource: PriceSourceType.CHAINLINK,
        minConfidence: 0.9,
        maxPriceDeviation: 0.1
      });
      this.chainConfigs.set(ChainType.SOLANA, {
        preferredSource: PriceSourceType.PYTH,
        minConfidence: 0.9,
        maxPriceDeviation: 0.1
      });
      this.chainConfigs.set(ChainType.BASE, {
        preferredSource: PriceSourceType.CHAINLINK,
        minConfidence: 0.9,
        maxPriceDeviation: 0.1
      });
    }
  }

  // 插件生命周期方法
  async onLoad(): Promise<void> {
    this.isLoaded = true;
  }

  async onUnload(): Promise<void> {
    this.clearCache();
    this.sources.clear();
    this.isLoaded = false;
  }

  async onEnable(): Promise<void> {
    this.isEnabled = true;
  }

  async onDisable(): Promise<void> {
    this.isEnabled = false;
  }

  async onConfigChange(newConfig: PriceOracleConfig): Promise<void> {
    // 更新配置
    if (newConfig.minimumConfidence) {
      this.minimumConfidence = newConfig.minimumConfidence;
    }
    if (newConfig.cacheDuration) {
      this.cacheDuration = newConfig.cacheDuration;
    }
    if (newConfig.chainConfigs) {
      Object.entries(newConfig.chainConfigs).forEach(([chain, conf]) => {
        this.chainConfigs.set(chain as ChainType, {
          preferredSource: conf.preferredSource || this.defaultSource,
          minConfidence: conf.minConfidence,
          maxPriceDeviation: conf.maxPriceDeviation
        });
      });
    }
  }

  // 插件初始化
  async initialize(manager: PluginManager): Promise<void> {
    // 获取插件上下文
    this.context = manager.getPluginContext(this.metadata.id);
    this.api = this.context.api;
    this.hooks = this.context.hooks;
    this.utils = this.context.utils;

    // 初始化 Helius 客户端
    const heliusConfig = manager.getConfig('helius');
    if (heliusConfig?.apiKey) {
      this.heliusClient = new HeliusClient({
        apiKey: heliusConfig.apiKey
      });
      // 添加 Helius 数据源
      this.addSource(new HeliusSource(this.heliusClient));
      
      // 更新 Solana 链的配置
      const solanaConfig = this.chainConfigs.get(ChainType.SOLANA);
      if (solanaConfig) {
        this.chainConfigs.set(ChainType.SOLANA, {
          ...solanaConfig,
          alternativeSources: [
            ...(solanaConfig.alternativeSources || []),
            PriceSourceType.HELIUS
          ]
        });
      }
    }

    // 注册事件处理器
    this.hooks.on('chain:block', this.handleNewBlock.bind(this));
    this.hooks.on('chain:transaction', this.handleNewTransaction.bind(this));

    // 注册 API 端点
    this.api.register('price-oracle', {
      getPrice: this.getPrice.bind(this),
      getPriceFromAllSources: this.getPriceFromAllSources.bind(this),
      getAggregatedPrice: this.getAggregatedPrice.bind(this),
      getAvailableSources: this.getAvailableSources.bind(this),
      clearCache: this.clearCache.bind(this)
    });
  }

  // 事件处理器
  private async handleNewBlock(block: any): Promise<void> {
    // 处理新区块事件
    // 可以在这里更新缓存或执行其他操作
  }

  private async handleNewTransaction(tx: any): Promise<void> {
    // 处理新交易事件
    // 可以在这里更新价格数据或执行其他操作
  }

  getName(): string {
    return 'price-oracle';
  }

  addSource(source: PriceSource): void {
    this.sources.set(source.name as PriceSourceType, source);
  }

  removeSource(sourceName: PriceSourceType): void {
    this.sources.delete(sourceName);
  }

  async getPrice(pair: TokenPair, sourceName?: PriceSourceType): Promise<PriceData> {
    // 检查缓存
    const cacheKey = `${pair.chain}:${pair.baseToken}/${pair.quoteToken}:${sourceName || 'default'}`;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheDuration) {
      return cached.data;
    }

    // 获取数据源
    const source = sourceName 
      ? this.sources.get(sourceName)
      : this.getPreferredSource(pair.chain);

    if (!source) {
      throw new Error(`Price source ${sourceName || this.defaultSource} not found`);
    }

    if (!source.isSupported(pair)) {
      throw new Error(`Pair ${pair.baseToken}/${pair.quoteToken} not supported by source ${source.name}`);
    }

    const priceData = await source.getPriceData(pair);
    
    // 验证数据
    this.validatePriceData(pair.chain, priceData);

    // 更新缓存
    this.cache.set(cacheKey, {
      data: priceData,
      timestamp: Date.now()
    });

    return priceData;
  }

  async getPriceFromAllSources(pair: TokenPair): Promise<PriceData[]> {
    const promises = Array.from(this.sources.values())
      .filter(source => source.isSupported(pair))
      .map(source => source.getPriceData(pair).catch(error => ({
        error: error instanceof Error ? error.message : 'Unknown error',
        source: source.name
      })));

    const results = await Promise.all(promises);
    return results.filter(result => !('error' in result)) as PriceData[];
  }

  async getAggregatedPrice(pair: TokenPair): Promise<PriceData> {
    const prices = await this.getPriceFromAllSources(pair);
    
    if (prices.length === 0) {
      throw new Error(`No valid prices found for ${pair.baseToken}/${pair.quoteToken}`);
    }

    // 计算加权平均价格
    const totalWeight = prices.reduce((sum, p) => sum + this.getSourceWeight(p.source), 0);
    const weightedPrice = prices.reduce((sum, p) => {
      return sum + (p.price * this.getSourceWeight(p.source));
    }, 0) / totalWeight;

    return {
      pair,
      price: weightedPrice,
      timestamp: Date.now(),
      source: PriceSourceType.AGGREGATED,
      confidence: this.calculateAggregatedConfidence(prices),
      metadata: {
        sources: prices.map(p => p.source)
      }
    };
  }

  getAvailableSources(): PriceSourceType[] {
    return Array.from(this.sources.keys());
  }

  clearCache(): void {
    this.cache.clear();
  }

  private getPreferredSource(chain: ChainType): PriceSource {
    const chainConfig = this.chainConfigs.get(chain);
    const sourceName = chainConfig?.preferredSource || this.defaultSource;
    return this.sources.get(sourceName)!;
  }

  private validatePriceData(chain: ChainType, data: PriceData): void {
    const chainConfig = this.chainConfigs.get(chain);
    
    if (chainConfig && data.confidence < chainConfig.minConfidence) {
      throw new Error(`Price confidence ${data.confidence} below minimum threshold ${chainConfig.minConfidence}`);
    }

    if (data.confidence < this.minimumConfidence) {
      throw new Error(`Price confidence ${data.confidence} below global minimum threshold ${this.minimumConfidence}`);
    }
  }

  private getSourceWeight(source: PriceSourceType): number {
    // 定义数据源权重
    const weights: Record<PriceSourceType, number> = {
      [PriceSourceType.PYTH]: 0.4,
      [PriceSourceType.CHAINLINK]: 0.4,
      [PriceSourceType.HELIUS]: 0.3,
      [PriceSourceType.DEXSCREENER]: 0.2,
      [PriceSourceType.UNISWAP]: 0.3,
      [PriceSourceType.RAYDIUM]: 0.3,
      [PriceSourceType.BINANCE]: 0.3,
      [PriceSourceType.COINGECKO]: 0.2,
      [PriceSourceType.AGGREGATED]: 0
    };
    return weights[source] || 0.1;
  }

  private calculateAggregatedConfidence(prices: PriceData[]): number {
    const weights = prices.map(p => this.getSourceWeight(p.source));
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    
    return prices.reduce((sum, p, i) => {
      return sum + (p.confidence * weights[i]);
    }, 0) / totalWeight;
  }
} 