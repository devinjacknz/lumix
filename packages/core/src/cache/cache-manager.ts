import { EventEmitter } from 'events';
import { RedisClientType, createClient } from 'redis';
import LRU from 'lru-cache';

export interface CacheConfig {
  redis?: {
    url: string;
    password?: string;
    db?: number;
    maxRetries?: number;
    connectTimeout?: number;
  };
  memory?: {
    maxSize: number;
    maxAge: number;
    updateAgeOnGet?: boolean;
  };
  defaultTTL: number;
  namespace?: string;
}

export interface CacheStats {
  hits: number;
  misses: number;
  keys: number;
  size: number;
  lastEvicted?: string;
}

export interface CacheEntry<T> {
  key: string;
  value: T;
  ttl?: number;
  createdAt: number;
  lastAccessed?: number;
  metadata?: Record<string, any>;
}

export type CacheLayer = 'memory' | 'redis';

export class CacheManager extends EventEmitter {
  private memoryCache: LRU<string, any>;
  private redisClient: RedisClientType;
  private stats: Map<CacheLayer, CacheStats>;
  private isRedisConnected: boolean = false;

  constructor(private config: CacheConfig) {
    super();
    this.initializeCache();
    this.stats = new Map();
    this.resetStats();
  }

  private async initializeCache() {
    // 初始化内存缓存
    if (this.config.memory) {
      this.memoryCache = new LRU({
        max: this.config.memory.maxSize,
        maxAge: this.config.memory.maxAge,
        updateAgeOnGet: this.config.memory.updateAgeOnGet,
        dispose: (key, value) => {
          this.emit('evicted', { layer: 'memory', key, value });
          const stats = this.stats.get('memory')!;
          stats.lastEvicted = key;
        },
      });
    }

    // 初始化Redis缓存
    if (this.config.redis) {
      this.redisClient = createClient({
        url: this.config.redis.url,
        password: this.config.redis.password,
        database: this.config.redis.db,
      });

      this.redisClient.on('connect', () => {
        this.isRedisConnected = true;
        this.emit('redis:connected');
      });

      this.redisClient.on('error', (error) => {
        this.isRedisConnected = false;
        this.emit('redis:error', error);
      });

      this.redisClient.on('end', () => {
        this.isRedisConnected = false;
        this.emit('redis:disconnected');
      });

      await this.redisClient.connect();
    }
  }

  private resetStats() {
    this.stats.set('memory', {
      hits: 0,
      misses: 0,
      keys: 0,
      size: 0,
    });

    this.stats.set('redis', {
      hits: 0,
      misses: 0,
      keys: 0,
      size: 0,
    });
  }

  private getNamespacedKey(key: string): string {
    return this.config.namespace ? `${this.config.namespace}:${key}` : key;
  }

  async set<T>(
    key: string,
    value: T,
    options: {
      ttl?: number;
      layer?: CacheLayer;
      metadata?: Record<string, any>;
    } = {}
  ): Promise<void> {
    const namespacedKey = this.getNamespacedKey(key);
    const ttl = options.ttl || this.config.defaultTTL;
    const entry: CacheEntry<T> = {
      key: namespacedKey,
      value,
      ttl,
      createdAt: Date.now(),
      metadata: options.metadata,
    };

    // 存储到内存缓存
    if (!options.layer || options.layer === 'memory') {
      this.memoryCache.set(namespacedKey, entry, {
        ttl: ttl * 1000,
      });
      const stats = this.stats.get('memory')!;
      stats.keys = this.memoryCache.size;
      stats.size = this.calculateSize(entry);
    }

    // 存储到Redis
    if (
      (!options.layer || options.layer === 'redis') &&
      this.isRedisConnected
    ) {
      await this.redisClient.set(
        namespacedKey,
        JSON.stringify(entry),
        {
          EX: ttl,
        }
      );
      const stats = this.stats.get('redis')!;
      stats.keys++;
      stats.size += this.calculateSize(entry);
    }

    this.emit('set', { key: namespacedKey, entry });
  }

  async get<T>(
    key: string,
    options: {
      layer?: CacheLayer;
      updateStats?: boolean;
    } = {}
  ): Promise<T | null> {
    const namespacedKey = this.getNamespacedKey(key);
    let result: CacheEntry<T> | null = null;

    // 从内存缓存获取
    if (!options.layer || options.layer === 'memory') {
      result = this.memoryCache.get(namespacedKey) as CacheEntry<T> | null;
      if (options.updateStats) {
        const stats = this.stats.get('memory')!;
        result ? stats.hits++ : stats.misses++;
      }
    }

    // 如果内存中没有，从Redis获取
    if (
      !result &&
      (!options.layer || options.layer === 'redis') &&
      this.isRedisConnected
    ) {
      const data = await this.redisClient.get(namespacedKey);
      if (data) {
        result = JSON.parse(data) as CacheEntry<T>;
        // 可选：将Redis中的数据加载到内存缓存
        if (!options.layer) {
          this.memoryCache.set(namespacedKey, result);
        }
      }
      if (options.updateStats) {
        const stats = this.stats.get('redis')!;
        result ? stats.hits++ : stats.misses++;
      }
    }

    if (result) {
      result.lastAccessed = Date.now();
      this.emit('hit', { key: namespacedKey, entry: result });
      return result.value;
    }

    this.emit('miss', { key: namespacedKey });
    return null;
  }

  async delete(key: string): Promise<boolean> {
    const namespacedKey = this.getNamespacedKey(key);
    let deleted = false;

    // 从内存缓存删除
    if (this.memoryCache.delete(namespacedKey)) {
      const stats = this.stats.get('memory')!;
      stats.keys = this.memoryCache.size;
      deleted = true;
    }

    // 从Redis删除
    if (this.isRedisConnected) {
      const redisDeleted = await this.redisClient.del(namespacedKey);
      if (redisDeleted > 0) {
        const stats = this.stats.get('redis')!;
        stats.keys--;
        deleted = true;
      }
    }

    if (deleted) {
      this.emit('deleted', { key: namespacedKey });
    }

    return deleted;
  }

  async clear(layer?: CacheLayer): Promise<void> {
    if (!layer || layer === 'memory') {
      this.memoryCache.clear();
      const stats = this.stats.get('memory')!;
      stats.keys = 0;
      stats.size = 0;
    }

    if ((!layer || layer === 'redis') && this.isRedisConnected) {
      if (this.config.namespace) {
        const pattern = `${this.config.namespace}:*`;
        const keys = await this.redisClient.keys(pattern);
        if (keys.length > 0) {
          await this.redisClient.del(keys);
        }
      } else {
        await this.redisClient.flushDb();
      }
      const stats = this.stats.get('redis')!;
      stats.keys = 0;
      stats.size = 0;
    }

    this.emit('cleared', { layer });
  }

  async keys(pattern?: string): Promise<string[]> {
    const keys: Set<string> = new Set();

    // 获取内存缓存的键
    for (const key of this.memoryCache.keys()) {
      if (!pattern || key.includes(pattern)) {
        keys.add(key);
      }
    }

    // 获取Redis的键
    if (this.isRedisConnected) {
      const redisPattern = pattern ? `*${pattern}*` : '*';
      const redisKeys = await this.redisClient.keys(redisPattern);
      redisKeys.forEach(key => keys.add(key));
    }

    return Array.from(keys);
  }

  async ttl(key: string): Promise<number | null> {
    const namespacedKey = this.getNamespacedKey(key);
    
    // 检查内存缓存
    const memoryEntry = this.memoryCache.get(namespacedKey) as CacheEntry<any>;
    if (memoryEntry) {
      const age = Date.now() - memoryEntry.createdAt;
      return Math.max(0, (memoryEntry.ttl || this.config.defaultTTL) - age / 1000);
    }

    // 检查Redis
    if (this.isRedisConnected) {
      const ttl = await this.redisClient.ttl(namespacedKey);
      if (ttl > -1) {
        return ttl;
      }
    }

    return null;
  }

  async touch(key: string, ttl?: number): Promise<boolean> {
    const namespacedKey = this.getNamespacedKey(key);
    let touched = false;

    // 更新内存缓存
    const memoryEntry = this.memoryCache.get(namespacedKey) as CacheEntry<any>;
    if (memoryEntry) {
      memoryEntry.lastAccessed = Date.now();
      if (ttl !== undefined) {
        memoryEntry.ttl = ttl;
        this.memoryCache.set(namespacedKey, memoryEntry, {
          ttl: ttl * 1000,
        });
      }
      touched = true;
    }

    // 更新Redis
    if (this.isRedisConnected) {
      const exists = await this.redisClient.exists(namespacedKey);
      if (exists) {
        if (ttl !== undefined) {
          await this.redisClient.expire(namespacedKey, ttl);
        }
        touched = true;
      }
    }

    return touched;
  }

  getStats(layer?: CacheLayer): CacheStats | Map<CacheLayer, CacheStats> {
    if (layer) {
      return this.stats.get(layer)!;
    }
    return this.stats;
  }

  private calculateSize(entry: CacheEntry<any>): number {
    // 简单的大小估算
    return JSON.stringify(entry).length;
  }

  async close(): Promise<void> {
    this.memoryCache.clear();
    if (this.isRedisConnected) {
      await this.redisClient.quit();
    }
    this.emit('closed');
  }

  // 高级功能：批量操作
  async mset(entries: Array<{ key: string; value: any; ttl?: number }>) {
    const pipeline = this.redisClient.multi();
    
    for (const entry of entries) {
      const namespacedKey = this.getNamespacedKey(entry.key);
      const cacheEntry: CacheEntry<any> = {
        key: namespacedKey,
        value: entry.value,
        ttl: entry.ttl || this.config.defaultTTL,
        createdAt: Date.now(),
      };

      // 内存缓存
      this.memoryCache.set(namespacedKey, cacheEntry, {
        ttl: cacheEntry.ttl * 1000,
      });

      // Redis缓存
      pipeline.set(
        namespacedKey,
        JSON.stringify(cacheEntry),
        {
          EX: cacheEntry.ttl,
        }
      );
    }

    if (this.isRedisConnected) {
      await pipeline.exec();
    }
  }

  async mget(keys: string[]): Promise<Array<any | null>> {
    const results: Array<any | null> = [];
    const missedKeys: string[] = [];
    const missedIndexes: number[] = [];

    // 首先检查内存缓存
    for (let i = 0; i < keys.length; i++) {
      const namespacedKey = this.getNamespacedKey(keys[i]);
      const result = this.memoryCache.get(namespacedKey) as CacheEntry<any>;
      
      if (result) {
        results[i] = result.value;
      } else {
        missedKeys.push(namespacedKey);
        missedIndexes.push(i);
        results[i] = null;
      }
    }

    // 如果有未命中的键，从Redis获取
    if (missedKeys.length > 0 && this.isRedisConnected) {
      const redisResults = await this.redisClient.mGet(missedKeys);
      
      for (let i = 0; i < redisResults.length; i++) {
        const result = redisResults[i];
        if (result) {
          const entry = JSON.parse(result) as CacheEntry<any>;
          results[missedIndexes[i]] = entry.value;
          
          // 更新内存缓存
          this.memoryCache.set(missedKeys[i], entry, {
            ttl: entry.ttl * 1000,
          });
        }
      }
    }

    return results;
  }

  // 高级功能：原子操作
  async increment(
    key: string,
    value: number = 1,
    options: { ttl?: number } = {}
  ): Promise<number> {
    const namespacedKey = this.getNamespacedKey(key);
    let result: number;

    if (this.isRedisConnected) {
      result = await this.redisClient.incrBy(namespacedKey, value);
      if (options.ttl) {
        await this.redisClient.expire(namespacedKey, options.ttl);
      }
    } else {
      const current = (this.memoryCache.get(namespacedKey) as CacheEntry<number>)?.value || 0;
      result = current + value;
      await this.set(key, result, options);
    }

    return result;
  }

  // 高级功能：发布/订阅
  async publish(channel: string, message: any): Promise<void> {
    if (this.isRedisConnected) {
      await this.redisClient.publish(
        this.getNamespacedKey(channel),
        JSON.stringify(message)
      );
    }
  }

  async subscribe(channel: string, callback: (message: any) => void): Promise<void> {
    if (this.isRedisConnected) {
      const subscriber = this.redisClient.duplicate();
      await subscriber.connect();
      
      await subscriber.subscribe(
        this.getNamespacedKey(channel),
        (message) => {
          try {
            const parsed = JSON.parse(message);
            callback(parsed);
          } catch (error) {
            callback(message);
          }
        }
      );
    }
  }
}

export { CacheManager, CacheConfig, CacheStats, CacheEntry, CacheLayer }; 