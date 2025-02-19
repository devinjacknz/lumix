import { BaseCache } from '@langchain/core/caches';
import { CacheResult, CacheConfig } from './adapter';
import { CacheError } from './index';

/**
 * LangChain 风格的缓存实现
 */
export class LangChainCache extends BaseCache {
  private cache: Map<string, any>;
  private config: Required<CacheConfig>;

  constructor(config: CacheConfig = {}) {
    super();
    this.cache = new Map();
    this.config = {
      maxSize: config.maxSize || 1000,
      ttl: config.ttl || 3600000, // 1 hour
      namespace: config.namespace || 'default'
    };
  }

  /**
   * 查找缓存
   */
  async lookup(key: string): Promise<CacheResult<any>> {
    try {
      const namespacedKey = this.getNamespacedKey(key);
      const entry = this.cache.get(namespacedKey);

      if (!entry) {
        return { success: true, data: null };
      }

      if (this.isExpired(entry)) {
        this.cache.delete(namespacedKey);
        return { success: true, data: null };
      }

      return { success: true, data: entry.value };
    } catch (error) {
      return {
        success: false,
        error: new CacheError('Failed to lookup cache entry', { cause: error })
      };
    }
  }

  /**
   * 更新缓存
   */
  async update(key: string, value: any): Promise<CacheResult<void>> {
    try {
      this.cleanup();

      if (this.cache.size >= this.config.maxSize) {
        const oldestKey = this.getOldestKey();
        if (oldestKey) this.cache.delete(oldestKey);
      }

      const namespacedKey = this.getNamespacedKey(key);
      this.cache.set(namespacedKey, {
        value,
        timestamp: Date.now(),
        expiresAt: Date.now() + this.config.ttl
      });

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: new CacheError('Failed to update cache entry', { cause: error })
      };
    }
  }

  /**
   * 清理过期条目
   */
  private cleanup(): void {
    for (const [key, entry] of this.cache.entries()) {
      if (this.isExpired(entry)) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * 检查是否过期
   */
  private isExpired(entry: any): boolean {
    return Date.now() > entry.expiresAt;
  }

  /**
   * 获取命名空间键
   */
  private getNamespacedKey(key: string): string {
    return `${this.config.namespace}:${key}`;
  }

  /**
   * 获取最旧的键
   */
  private getOldestKey(): string | undefined {
    let oldestKey: string | undefined;
    let oldestTimestamp = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.timestamp < oldestTimestamp) {
        oldestTimestamp = entry.timestamp;
        oldestKey = key;
      }
    }

    return oldestKey;
  }
} 