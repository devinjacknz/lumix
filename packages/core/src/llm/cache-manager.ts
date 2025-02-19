import { logger } from '../monitoring';

export interface CacheConfig {
  enabled: boolean;
  ttl: number;
  maxSize: number;
  namespace?: string;
  persistPath?: string;
}

export interface CacheEntry<T> {
  value: T;
  timestamp: number;
  metadata?: Record<string, any>;
}

export class CacheManager {
  private static instance: CacheManager;
  private cache: Map<string, CacheEntry<any>>;
  private config: CacheConfig;
  private size: number = 0;

  private constructor(config: CacheConfig) {
    this.config = {
      enabled: true,
      ttl: 3600000, // 1小时
      maxSize: 1000,
      ...config
    };
    this.cache = new Map();
  }

  public static getInstance(config?: CacheConfig): CacheManager {
    if (!CacheManager.instance) {
      CacheManager.instance = new CacheManager(config || {
        enabled: true,
        ttl: 3600000,
        maxSize: 1000
      });
    }
    return CacheManager.instance;
  }

  public async set<T>(
    key: string,
    value: T,
    metadata?: Record<string, any>
  ): Promise<void> {
    try {
      if (!this.config.enabled) {
        return;
      }

      // 检查缓存大小
      if (this.size >= this.config.maxSize) {
        await this.cleanup();
      }

      const entry: CacheEntry<T> = {
        value,
        timestamp: Date.now(),
        metadata
      };

      this.cache.set(this.getNamespacedKey(key), entry);
      this.size++;

      logger.debug('Cache', `Set cache entry for key: ${key}`);
    } catch (error) {
      if (error instanceof Error) {
        logger.error('Cache', `Failed to set cache entry: ${error.message}`);
      }
      throw error;
    }
  }

  public async get<T>(key: string): Promise<T | null> {
    try {
      if (!this.config.enabled) {
        return null;
      }

      const entry = this.cache.get(this.getNamespacedKey(key));
      if (!entry) {
        return null;
      }

      // 检查是否过期
      if (this.isExpired(entry)) {
        await this.delete(key);
        return null;
      }

      logger.debug('Cache', `Cache hit for key: ${key}`);
      return entry.value as T;
    } catch (error) {
      if (error instanceof Error) {
        logger.error('Cache', `Failed to get cache entry: ${error.message}`);
      }
      throw error;
    }
  }

  public async delete(key: string): Promise<void> {
    try {
      const namespacedKey = this.getNamespacedKey(key);
      if (this.cache.delete(namespacedKey)) {
        this.size--;
        logger.debug('Cache', `Deleted cache entry for key: ${key}`);
      }
    } catch (error) {
      if (error instanceof Error) {
        logger.error('Cache', `Failed to delete cache entry: ${error.message}`);
      }
      throw error;
    }
  }

  public async clear(): Promise<void> {
    try {
      this.cache.clear();
      this.size = 0;
      logger.info('Cache', 'Cache cleared');
    } catch (error) {
      if (error instanceof Error) {
        logger.error('Cache', `Failed to clear cache: ${error.message}`);
      }
      throw error;
    }
  }

  public async cleanup(): Promise<void> {
    try {
      const now = Date.now();
      const entries = Array.from(this.cache.entries());

      // 按时间戳排序
      entries.sort((a, b) => a[1].timestamp - b[1].timestamp);

      // 删除过期和最旧的条目
      for (const [key, entry] of entries) {
        if (this.size <= this.config.maxSize * 0.8) {
          break;
        }

        if (this.isExpired(entry)) {
          await this.delete(key);
        }
      }

      logger.info('Cache', 'Cache cleanup completed');
    } catch (error) {
      if (error instanceof Error) {
        logger.error('Cache', `Failed to cleanup cache: ${error.message}`);
      }
      throw error;
    }
  }

  private getNamespacedKey(key: string): string {
    return this.config.namespace ? `${this.config.namespace}:${key}` : key;
  }

  private isExpired(entry: CacheEntry<any>): boolean {
    return Date.now() - entry.timestamp > this.config.ttl;
  }

  public getStats(): {
    size: number;
    maxSize: number;
    hitRate?: number;
    missRate?: number;
  } {
    return {
      size: this.size,
      maxSize: this.config.maxSize
    };
  }

  public async persist(): Promise<void> {
    if (!this.config.persistPath) {
      return;
    }

    try {
      const data = Array.from(this.cache.entries());
      await fs.promises.writeFile(
        this.config.persistPath,
        JSON.stringify(data),
        'utf-8'
      );
      logger.info('Cache', 'Cache persisted to disk');
    } catch (error) {
      if (error instanceof Error) {
        logger.error('Cache', `Failed to persist cache: ${error.message}`);
      }
      throw error;
    }
  }

  public async restore(): Promise<void> {
    if (!this.config.persistPath) {
      return;
    }

    try {
      const data = await fs.promises.readFile(this.config.persistPath, 'utf-8');
      const entries = JSON.parse(data) as [string, CacheEntry<any>][];
      
      this.cache = new Map(entries);
      this.size = entries.length;
      
      logger.info('Cache', 'Cache restored from disk');
    } catch (error) {
      if (error instanceof Error) {
        logger.error('Cache', `Failed to restore cache: ${error.message}`);
      }
      // 如果恢复失败，使用空缓存继续
      this.cache = new Map();
      this.size = 0;
    }
  }
} 