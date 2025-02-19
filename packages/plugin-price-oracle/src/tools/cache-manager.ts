import { logger } from "@lumix/core";
import { TokenPair, PriceData } from "../types";

export interface CacheConfig {
  l1: {
    enabled: boolean;
    maxSize: number;
    ttl: number;
  };
  l2: {
    enabled: boolean;
    maxSize: number;
    ttl: number;
  };
  persistent: {
    enabled: boolean;
    path: string;
    syncInterval: number;
  };
}

interface CacheEntry {
  data: PriceData;
  timestamp: number;
  hits: number;
  lastAccess: number;
}

export class CacheManager {
  private static instance: CacheManager;
  private l1Cache: Map<string, CacheEntry>;
  private l2Cache: Map<string, CacheEntry>;
  private persistentData: Map<string, CacheEntry>;
  private config: CacheConfig;
  private lastSync: number;

  private constructor(config: CacheConfig) {
    this.config = config;
    this.l1Cache = new Map();
    this.l2Cache = new Map();
    this.persistentData = new Map();
    this.lastSync = Date.now();

    // 启动持久化同步
    if (config.persistent.enabled) {
      this.startPersistentSync();
    }
  }

  public static getInstance(config?: CacheConfig): CacheManager {
    if (!CacheManager.instance) {
      CacheManager.instance = new CacheManager(config || {
        l1: {
          enabled: true,
          maxSize: 1000,
          ttl: 60000 // 1分钟
        },
        l2: {
          enabled: true,
          maxSize: 10000,
          ttl: 300000 // 5分钟
        },
        persistent: {
          enabled: true,
          path: "./cache",
          syncInterval: 300000 // 5分钟
        }
      });
    }
    return CacheManager.instance;
  }

  public async get(pair: TokenPair): Promise<PriceData | null> {
    const key = this.generateKey(pair);
    
    // 1. 检查 L1 缓存
    if (this.config.l1.enabled) {
      const l1Data = this.getFromL1(key);
      if (l1Data) {
        return l1Data;
      }
    }

    // 2. 检查 L2 缓存
    if (this.config.l2.enabled) {
      const l2Data = this.getFromL2(key);
      if (l2Data) {
        // 提升到 L1 缓存
        this.promoteToL1(key, l2Data);
        return l2Data;
      }
    }

    // 3. 检查持久化存储
    if (this.config.persistent.enabled) {
      const persistentData = await this.getFromPersistent(key);
      if (persistentData) {
        // 提升到缓存
        this.promoteToCache(key, persistentData);
        return persistentData;
      }
    }

    return null;
  }

  public async set(pair: TokenPair, data: PriceData): Promise<void> {
    const key = this.generateKey(pair);
    const entry: CacheEntry = {
      data,
      timestamp: Date.now(),
      hits: 0,
      lastAccess: Date.now()
    };

    // 1. 更新 L1 缓存
    if (this.config.l1.enabled) {
      this.setInL1(key, entry);
    }

    // 2. 更新 L2 缓存
    if (this.config.l2.enabled) {
      this.setInL2(key, entry);
    }

    // 3. 更新持久化存储
    if (this.config.persistent.enabled) {
      await this.setInPersistent(key, entry);
    }
  }

  private getFromL1(key: string): PriceData | null {
    const entry = this.l1Cache.get(key);
    if (!entry) return null;

    // 检查 TTL
    if (Date.now() - entry.timestamp > this.config.l1.ttl) {
      this.l1Cache.delete(key);
      return null;
    }

    // 更新访问统计
    entry.hits++;
    entry.lastAccess = Date.now();
    return entry.data;
  }

  private getFromL2(key: string): PriceData | null {
    const entry = this.l2Cache.get(key);
    if (!entry) return null;

    // 检查 TTL
    if (Date.now() - entry.timestamp > this.config.l2.ttl) {
      this.l2Cache.delete(key);
      return null;
    }

    // 更新访问统计
    entry.hits++;
    entry.lastAccess = Date.now();
    return entry.data;
  }

  private async getFromPersistent(key: string): Promise<PriceData | null> {
    const entry = this.persistentData.get(key);
    if (!entry) return null;

    // 持久化数据不设置 TTL，但会记录访问统计
    entry.hits++;
    entry.lastAccess = Date.now();
    return entry.data;
  }

  private setInL1(key: string, entry: CacheEntry): void {
    // 检查容量
    if (this.l1Cache.size >= this.config.l1.maxSize) {
      this.evictFromL1();
    }
    this.l1Cache.set(key, entry);
  }

  private setInL2(key: string, entry: CacheEntry): void {
    // 检查容量
    if (this.l2Cache.size >= this.config.l2.maxSize) {
      this.evictFromL2();
    }
    this.l2Cache.set(key, entry);
  }

  private async setInPersistent(key: string, entry: CacheEntry): Promise<void> {
    this.persistentData.set(key, entry);
    
    // 检查是否需要同步到磁盘
    if (Date.now() - this.lastSync > this.config.persistent.syncInterval) {
      await this.syncToDisk();
    }
  }

  private promoteToL1(key: string, data: PriceData): void {
    const entry: CacheEntry = {
      data,
      timestamp: Date.now(),
      hits: 1,
      lastAccess: Date.now()
    };
    this.setInL1(key, entry);
  }

  private promoteToCache(key: string, data: PriceData): void {
    // 提升到 L1 和 L2 缓存
    this.promoteToL1(key, data);
    
    const entry: CacheEntry = {
      data,
      timestamp: Date.now(),
      hits: 1,
      lastAccess: Date.now()
    };
    this.setInL2(key, entry);
  }

  private evictFromL1(): void {
    // 使用 LRU 策略驱逐
    let oldestAccess = Date.now();
    let keyToEvict: string | null = null;

    for (const [key, entry] of this.l1Cache.entries()) {
      if (entry.lastAccess < oldestAccess) {
        oldestAccess = entry.lastAccess;
        keyToEvict = key;
      }
    }

    if (keyToEvict) {
      const evictedEntry = this.l1Cache.get(keyToEvict);
      this.l1Cache.delete(keyToEvict);

      // 如果频繁访问，保存到 L2 缓存
      if (evictedEntry && evictedEntry.hits > 5) {
        this.setInL2(keyToEvict, evictedEntry);
      }
    }
  }

  private evictFromL2(): void {
    // 使用 LRU 策略驱逐
    let oldestAccess = Date.now();
    let keyToEvict: string | null = null;

    for (const [key, entry] of this.l2Cache.entries()) {
      if (entry.lastAccess < oldestAccess) {
        oldestAccess = entry.lastAccess;
        keyToEvict = key;
      }
    }

    if (keyToEvict) {
      const evictedEntry = this.l2Cache.get(keyToEvict);
      this.l2Cache.delete(keyToEvict);

      // 如果频繁访问，保存到持久化存储
      if (evictedEntry && evictedEntry.hits > 10) {
        this.setInPersistent(keyToEvict, evictedEntry);
      }
    }
  }

  private generateKey(pair: TokenPair): string {
    return `${pair.chain}:${pair.baseToken}:${pair.quoteToken}`;
  }

  private async syncToDisk(): Promise<void> {
    try {
      // 实现持久化存储逻辑
      this.lastSync = Date.now();
      logger.info("Cache Manager", "Cache synchronized to disk");
    } catch (error) {
      if (error instanceof Error) {
        logger.error("Cache Manager", `Failed to sync cache to disk: ${error.message}`);
      }
    }
  }

  private startPersistentSync(): void {
    setInterval(async () => {
      await this.syncToDisk();
    }, this.config.persistent.syncInterval);
  }

  public getCacheStats(): {
    l1Size: number;
    l2Size: number;
    persistentSize: number;
  } {
    return {
      l1Size: this.l1Cache.size,
      l2Size: this.l2Cache.size,
      persistentSize: this.persistentData.size
    };
  }

  public async clearCache(): Promise<void> {
    this.l1Cache.clear();
    this.l2Cache.clear();
    this.persistentData.clear();
    await this.syncToDisk();
  }
} 