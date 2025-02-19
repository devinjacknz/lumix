import { logger } from "@lumix/core";
import { TokenPair, PriceSourceType } from "../types";
import { CacheManager } from "./cache-manager";
import { PriceSourceTool } from "./price-source";

export interface WarmupConfig {
  interval: number;
  maxConcurrent: number;
  retryAttempts: number;
  retryDelay: number;
  priorityPairs: TokenPair[];
}

export class CacheWarmer {
  private static instance: CacheWarmer;
  private cacheManager: CacheManager;
  private config: WarmupConfig;
  private sources: Map<PriceSourceType, PriceSourceTool>;
  private isWarming: boolean;
  private lastWarmup: number;

  private constructor(
    cacheManager: CacheManager,
    config: WarmupConfig,
    sources: Map<PriceSourceType, PriceSourceTool>
  ) {
    this.cacheManager = cacheManager;
    this.config = config;
    this.sources = sources;
    this.isWarming = false;
    this.lastWarmup = 0;

    // 启动定时预热
    this.startWarmupSchedule();
  }

  public static getInstance(
    cacheManager: CacheManager,
    config?: WarmupConfig,
    sources?: Map<PriceSourceType, PriceSourceTool>
  ): CacheWarmer {
    if (!CacheWarmer.instance) {
      CacheWarmer.instance = new CacheWarmer(
        cacheManager,
        config || {
          interval: 300000, // 5分钟
          maxConcurrent: 5,
          retryAttempts: 3,
          retryDelay: 1000,
          priorityPairs: []
        },
        sources || new Map()
      );
    }
    return CacheWarmer.instance;
  }

  public async warmup(pairs?: TokenPair[]): Promise<void> {
    if (this.isWarming) {
      logger.warn("Cache Warmer", "Warmup already in progress");
      return;
    }

    try {
      this.isWarming = true;
      const targetPairs = pairs || this.config.priorityPairs;
      
      // 按批次处理
      for (let i = 0; i < targetPairs.length; i += this.config.maxConcurrent) {
        const batch = targetPairs.slice(i, i + this.config.maxConcurrent);
        await Promise.all(batch.map(pair => this.warmupPair(pair)));
      }

      this.lastWarmup = Date.now();
      logger.info("Cache Warmer", `Cache warmup completed for ${targetPairs.length} pairs`);
    } catch (error) {
      if (error instanceof Error) {
        logger.error("Cache Warmer", `Cache warmup failed: ${error.message}`);
      }
    } finally {
      this.isWarming = false;
    }
  }

  private async warmupPair(pair: TokenPair): Promise<void> {
    for (let attempt = 1; attempt <= this.config.retryAttempts; attempt++) {
      try {
        // 从每个数据源获取价格
        const pricePromises = Array.from(this.sources.values()).map(async source => {
          if (source.isSupported(pair)) {
            const priceData = await source.getPrice(pair);
            if (priceData) {
              await this.cacheManager.set(pair, priceData);
            }
          }
        });

        await Promise.all(pricePromises);
        return;
      } catch (error) {
        if (error instanceof Error) {
          logger.warn(
            "Cache Warmer",
            `Warmup attempt ${attempt} failed for pair ${pair.baseToken}/${pair.quoteToken}: ${error.message}`
          );
          
          if (attempt < this.config.retryAttempts) {
            await new Promise(resolve => setTimeout(resolve, this.config.retryDelay));
          }
        }
      }
    }

    logger.error(
      "Cache Warmer",
      `Failed to warm up cache for pair ${pair.baseToken}/${pair.quoteToken} after ${this.config.retryAttempts} attempts`
    );
  }

  public addSource(source: PriceSourceTool): void {
    this.sources.set(source.type, source);
  }

  public removeSource(type: PriceSourceType): void {
    this.sources.delete(type);
  }

  public addPriorityPair(pair: TokenPair): void {
    if (!this.config.priorityPairs.some(p => 
      p.chain === pair.chain &&
      p.baseToken === pair.baseToken &&
      p.quoteToken === pair.quoteToken
    )) {
      this.config.priorityPairs.push(pair);
    }
  }

  public removePriorityPair(pair: TokenPair): void {
    this.config.priorityPairs = this.config.priorityPairs.filter(p =>
      p.chain !== pair.chain ||
      p.baseToken !== pair.baseToken ||
      p.quoteToken !== pair.quoteToken
    );
  }

  private startWarmupSchedule(): void {
    setInterval(async () => {
      if (!this.isWarming && Date.now() - this.lastWarmup >= this.config.interval) {
        await this.warmup();
      }
    }, Math.min(this.config.interval, 60000)); // 最多每分钟检查一次
  }

  public getWarmupStats(): {
    lastWarmup: number;
    isWarming: boolean;
    priorityPairsCount: number;
    sourcesCount: number;
  } {
    return {
      lastWarmup: this.lastWarmup,
      isWarming: this.isWarming,
      priorityPairsCount: this.config.priorityPairs.length,
      sourcesCount: this.sources.size
    };
  }

  public updateConfig(config: Partial<WarmupConfig>): void {
    this.config = {
      ...this.config,
      ...config
    };
  }
} 