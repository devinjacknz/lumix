import { logger } from "@lumix/core";
import { TokenPair, PriceData, PriceSourceType } from "../types";
import { CacheManager } from "./cache-manager";
import { PriceSourceTool } from "./price-source";

export interface UpdateConfig {
  updateInterval: number;
  maxConcurrent: number;
  stalePriceThreshold: number;
  priceChangeThreshold: number;
  updateStrategy: "all" | "stale" | "changed";
}

interface UpdateTask {
  pair: TokenPair;
  lastUpdate: number;
  priority: number;
}

export class CacheUpdater {
  private static instance: CacheUpdater;
  private cacheManager: CacheManager;
  private config: UpdateConfig;
  private sources: Map<PriceSourceType, PriceSourceTool>;
  private updateQueue: UpdateTask[];
  private isUpdating: boolean;

  private constructor(
    cacheManager: CacheManager,
    config: UpdateConfig,
    sources: Map<PriceSourceType, PriceSourceTool>
  ) {
    this.cacheManager = cacheManager;
    this.config = config;
    this.sources = sources;
    this.updateQueue = [];
    this.isUpdating = false;

    // 启动更新调度器
    this.startUpdateScheduler();
  }

  public static getInstance(
    cacheManager: CacheManager,
    config?: UpdateConfig,
    sources?: Map<PriceSourceType, PriceSourceTool>
  ): CacheUpdater {
    if (!CacheUpdater.instance) {
      CacheUpdater.instance = new CacheUpdater(
        cacheManager,
        config || {
          updateInterval: 60000, // 1分钟
          maxConcurrent: 10,
          stalePriceThreshold: 300000, // 5分钟
          priceChangeThreshold: 0.005, // 0.5%
          updateStrategy: "stale"
        },
        sources || new Map()
      );
    }
    return CacheUpdater.instance;
  }

  public async scheduleUpdate(pair: TokenPair, priority: number = 0): Promise<void> {
    // 检查是否已在队列中
    const existingIndex = this.updateQueue.findIndex(task => 
      task.pair.chain === pair.chain &&
      task.pair.baseToken === pair.baseToken &&
      task.pair.quoteToken === pair.quoteToken
    );

    if (existingIndex >= 0) {
      // 更新优先级
      this.updateQueue[existingIndex].priority = Math.max(
        this.updateQueue[existingIndex].priority,
        priority
      );
      return;
    }

    // 添加到队列
    this.updateQueue.push({
      pair,
      lastUpdate: Date.now(),
      priority
    });

    // 按优先级排序
    this.updateQueue.sort((a, b) => b.priority - a.priority);

    // 如果没有正在更新，启动更新
    if (!this.isUpdating) {
      this.processUpdateQueue();
    }
  }

  private async processUpdateQueue(): Promise<void> {
    if (this.isUpdating || this.updateQueue.length === 0) {
      return;
    }

    try {
      this.isUpdating = true;

      // 获取当前批次
      const batch = this.updateQueue.splice(0, this.config.maxConcurrent);
      
      // 并行处理更新
      await Promise.all(batch.map(task => this.updatePair(task.pair)));

      logger.info("Cache Updater", `Updated ${batch.length} pairs`);
    } catch (error) {
      if (error instanceof Error) {
        logger.error("Cache Updater", `Update failed: ${error.message}`);
      }
    } finally {
      this.isUpdating = false;

      // 如果队列中还有任务，继续处理
      if (this.updateQueue.length > 0) {
        this.processUpdateQueue();
      }
    }
  }

  private async updatePair(pair: TokenPair): Promise<void> {
    try {
      // 获取当前缓存的价格
      const cachedPrice = await this.cacheManager.get(pair);

      // 从所有数据源获取最新价格
      const newPrices = await Promise.all(
        Array.from(this.sources.values())
          .filter(source => source.isSupported(pair))
          .map(source => source.getPrice(pair))
      );

      // 过滤掉无效价格
      const validPrices = newPrices.filter(price => price !== null) as PriceData[];

      if (validPrices.length === 0) {
        logger.warn("Cache Updater", `No valid prices found for ${pair.baseToken}/${pair.quoteToken}`);
        return;
      }

      // 根据更新策略决定是否更新
      if (this.shouldUpdate(cachedPrice, validPrices)) {
        // 选择最佳价格
        const bestPrice = this.selectBestPrice(validPrices);
        
        // 更新缓存
        await this.cacheManager.set(pair, bestPrice);
        
        logger.info(
          "Cache Updater",
          `Updated price for ${pair.baseToken}/${pair.quoteToken}: ${bestPrice.price}`
        );
      }
    } catch (error) {
      if (error instanceof Error) {
        logger.error(
          "Cache Updater",
          `Failed to update price for ${pair.baseToken}/${pair.quoteToken}: ${error.message}`
        );
      }
    }
  }

  private shouldUpdate(cachedPrice: PriceData | null, newPrices: PriceData[]): boolean {
    if (!cachedPrice) {
      return true;
    }

    switch (this.config.updateStrategy) {
      case "all":
        return true;
      
      case "stale":
        return Date.now() - cachedPrice.timestamp > this.config.stalePriceThreshold;
      
      case "changed":
        // 计算价格变化
        const avgNewPrice = newPrices.reduce((sum, p) => sum + p.price, 0) / newPrices.length;
        const priceChange = Math.abs(avgNewPrice - cachedPrice.price) / cachedPrice.price;
        return priceChange > this.config.priceChangeThreshold;
      
      default:
        return true;
    }
  }

  private selectBestPrice(prices: PriceData[]): PriceData {
    // 按置信度排序
    prices.sort((a, b) => b.confidence - a.confidence);
    
    // 选择置信度最高的价格
    return prices[0];
  }

  public addSource(source: PriceSourceTool): void {
    this.sources.set(source.type, source);
  }

  public removeSource(type: PriceSourceType): void {
    this.sources.delete(type);
  }

  private startUpdateScheduler(): void {
    setInterval(async () => {
      // 检查所有缓存的价格是否需要更新
      const stats = await this.cacheManager.getCacheStats();
      if (stats.l1Size + stats.l2Size > 0) {
        // TODO: 实现缓存遍历和更新检查
      }
    }, this.config.updateInterval);
  }

  public getUpdateStats(): {
    queueLength: number;
    isUpdating: boolean;
    sourcesCount: number;
  } {
    return {
      queueLength: this.updateQueue.length,
      isUpdating: this.isUpdating,
      sourcesCount: this.sources.size
    };
  }

  public updateConfig(config: Partial<UpdateConfig>): void {
    this.config = {
      ...this.config,
      ...config
    };
  }
} 