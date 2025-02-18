import { CacheAdapter, CacheConfig, CacheResult, CacheStats } from './adapter';
import { CacheError } from './index';

interface MemoryCacheEntry<T> {
  value: T;
  size: number;
  hits: number;
  lastAccessed: number;
  expiresAt: number | null;
}

/**
 * 内存优化的缓存实现
 */
export class MemoryCache extends CacheAdapter {
  private cache: Map<string, MemoryCacheEntry<any>>;
  private memoryUsage: number;
  private hits: number;
  private misses: number;
  private compressionThreshold: number;

  constructor(config: CacheConfig = {}) {
    super(config);
    this.cache = new Map();
    this.memoryUsage = 0;
    this.hits = 0;
    this.misses = 0;
    this.compressionThreshold = 1024; // 1KB
  }

  async init(): Promise<CacheResult<void>> {
    try {
      this.cache.clear();
      this.memoryUsage = 0;
      this.hits = 0;
      this.misses = 0;
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: new CacheError('Failed to initialize cache', { cause: error })
      };
    }
  }

  async close(): Promise<CacheResult<void>> {
    try {
      this.cache.clear();
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: new CacheError('Failed to close cache', { cause: error })
      };
    }
  }

  async set<T>(key: string, value: T, ttl?: number): Promise<CacheResult<void>> {
    try {
      await this.evictIfNeeded();

      const size = this.calculateSize(value);
      const now = Date.now();
      
      const entry: MemoryCacheEntry<T> = {
        value: this.shouldCompress(size) ? this.compress(value) : value,
        size,
        hits: 0,
        lastAccessed: now,
        expiresAt: ttl ? now + ttl : null
      };

      const oldEntry = this.cache.get(key);
      if (oldEntry) {
        this.memoryUsage -= oldEntry.size;
      }

      this.cache.set(key, entry);
      this.memoryUsage += size;

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: new CacheError('Failed to set cache entry', { cause: error })
      };
    }
  }

  async get<T>(key: string): Promise<CacheResult<T | null>> {
    try {
      const entry = this.cache.get(key);
      
      if (!entry) {
        this.misses++;
        return { success: true, data: null };
      }

      if (this.isExpired(entry)) {
        this.cache.delete(key);
        this.memoryUsage -= entry.size;
        this.misses++;
        return { success: true, data: null };
      }

      entry.hits++;
      entry.lastAccessed = Date.now();
      this.hits++;

      const value = this.shouldCompress(entry.size) ? 
        this.decompress(entry.value) : 
        entry.value;

      return { success: true, data: value };
    } catch (error) {
      return {
        success: false,
        error: new CacheError('Failed to get cache entry', { cause: error })
      };
    }
  }

  async delete(key: string): Promise<CacheResult<boolean>> {
    try {
      const entry = this.cache.get(key);
      if (entry) {
        this.cache.delete(key);
        this.memoryUsage -= entry.size;
        return { success: true, data: true };
      }
      return { success: true, data: false };
    } catch (error) {
      return {
        success: false,
        error: new CacheError('Failed to delete cache entry', { cause: error })
      };
    }
  }

  async clear(): Promise<CacheResult<void>> {
    try {
      this.cache.clear();
      this.memoryUsage = 0;
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: new CacheError('Failed to clear cache', { cause: error })
      };
    }
  }

  async mget<T>(keys: string[]): Promise<CacheResult<(T | null)[]>> {
    try {
      const results = await Promise.all(
        keys.map(key => this.get<T>(key))
      );
      return {
        success: true,
        data: results.map(result => {
          if (!result.success) return null;
          return result.data ?? null;
        })
      };
    } catch (error) {
      return {
        success: false,
        error: new CacheError('Failed to get multiple cache entries', { cause: error })
      };
    }
  }

  async mset<T>(items: Array<{ key: string; value: T; ttl?: number }>): Promise<CacheResult<void>> {
    try {
      await Promise.all(
        items.map(item => this.set(item.key, item.value, item.ttl))
      );
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: new CacheError('Failed to set multiple cache entries', { cause: error })
      };
    }
  }

  async mdelete(keys: string[]): Promise<CacheResult<boolean[]>> {
    try {
      const results = await Promise.all(
        keys.map(key => this.delete(key))
      );
      return {
        success: true,
        data: results.map(result => {
          if (!result.success) return false;
          return result.data ?? false;
        })
      };
    } catch (error) {
      return {
        success: false,
        error: new CacheError('Failed to delete multiple cache entries', { cause: error })
      };
    }
  }

  async stats(): Promise<CacheResult<CacheStats>> {
    try {
      return {
        success: true,
        data: {
          size: this.cache.size,
          hits: this.hits,
          misses: this.misses,
          memory: this.memoryUsage
        }
      };
    } catch (error) {
      return {
        success: false,
        error: new CacheError('Failed to get cache stats', { cause: error })
      };
    }
  }

  async has(key: string): Promise<CacheResult<boolean>> {
    try {
      const entry = this.cache.get(key);
      if (!entry || this.isExpired(entry)) {
        return { success: true, data: false };
      }
      return { success: true, data: true };
    } catch (error) {
      return {
        success: false,
        error: new CacheError('Failed to check cache key', { cause: error })
      };
    }
  }

  async keys(pattern?: string): Promise<CacheResult<string[]>> {
    try {
      const keys = Array.from(this.cache.keys());
      if (pattern) {
        const regex = new RegExp(pattern.replace('*', '.*'));
        return { 
          success: true, 
          data: keys.filter(key => regex.test(key))
        };
      }
      return { success: true, data: keys };
    } catch (error) {
      return {
        success: false,
        error: new CacheError('Failed to get cache keys', { cause: error })
      };
    }
  }

  async ttl(key: string): Promise<CacheResult<number>> {
    try {
      const entry = this.cache.get(key);
      if (!entry) {
        return { success: true, data: -2 }; // Key doesn't exist
      }
      if (!entry.expiresAt) {
        return { success: true, data: -1 }; // No expiration
      }
      const ttl = entry.expiresAt - Date.now();
      return { success: true, data: Math.max(0, ttl) };
    } catch (error) {
      return {
        success: false,
        error: new CacheError('Failed to get TTL', { cause: error })
      };
    }
  }

  async expire(key: string, ttl: number): Promise<CacheResult<boolean>> {
    try {
      const entry = this.cache.get(key);
      if (!entry) {
        return { success: true, data: false };
      }
      entry.expiresAt = Date.now() + ttl;
      return { success: true, data: true };
    } catch (error) {
      return {
        success: false,
        error: new CacheError('Failed to set expiration', { cause: error })
      };
    }
  }

  private isExpired(entry: MemoryCacheEntry<any>): boolean {
    return entry.expiresAt !== null && entry.expiresAt <= Date.now();
  }

  private calculateSize(value: any): number {
    try {
      const str = JSON.stringify(value);
      return str.length * 2; // Approximate size in bytes (UTF-16)
    } catch {
      return 1024; // Default size if can't calculate
    }
  }

  private shouldCompress(size: number): boolean {
    return size > this.compressionThreshold;
  }

  private compress(value: any): any {
    if (typeof value === 'string') {
      // Simple compression for strings (run-length encoding)
      return value.replace(/(.)\1+/g, (match, char) => `${char}${match.length}`);
    }
    return value;
  }

  private decompress(value: any): any {
    if (typeof value === 'string') {
      // Decompress run-length encoding
      return value.replace(/(.)\d+/g, (match, char) => 
        char.repeat(parseInt(match.slice(1)))
      );
    }
    return value;
  }

  private async evictIfNeeded(): Promise<void> {
    if (this.cache.size >= this.config.maxSize! || 
        this.memoryUsage >= this.config.maxMemory!) {
      // Evict based on LRU and hit rate
      const entries = Array.from(this.cache.entries())
        .map(([key, entry]) => ({
          key,
          score: this.calculateEvictionScore(entry)
        }))
        .sort((a, b) => a.score - b.score);

      // Evict 20% of entries
      const evictCount = Math.ceil(this.cache.size * 0.2);
      for (let i = 0; i < evictCount; i++) {
        const entry = this.cache.get(entries[i].key);
        if (entry) {
          this.cache.delete(entries[i].key);
          this.memoryUsage -= entry.size;
        }
      }
    }
  }

  private calculateEvictionScore(entry: MemoryCacheEntry<any>): number {
    const age = Date.now() - entry.lastAccessed;
    const hitRate = entry.hits / age;
    return hitRate * 0.7 + (1 / entry.size) * 0.3; // Weight hit rate more than size
  }
}
