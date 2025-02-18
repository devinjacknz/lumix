import { BaseError } from '../types/errors';

// Types
export interface CacheConfig {
  maxSize?: number;
  ttl?: number; // Time to live in milliseconds
  namespace?: string;
}

export interface CacheEntry<T> {
  value: T;
  timestamp: number;
  expiresAt: number;
}

// Error class
export class CacheError extends BaseError {
  code: string;
  details?: Record<string, any>;

  constructor(message: string, details?: Record<string, any>) {
    super(message);
    this.name = 'CacheError';
    this.code = '4000'; // Cache error code range: 4000-4999
    this.details = details;
  }
}

// Main cache manager
export class CacheManager<T = any> {
  private cache: Map<string, CacheEntry<T>>;
  private config: Required<CacheConfig>;

  constructor(config: CacheConfig = {}) {
    this.cache = new Map();
    this.config = {
      maxSize: config.maxSize || 1000,
      ttl: config.ttl || 3600000, // Default 1 hour
      namespace: config.namespace || 'default'
    };
  }

  /**
   * Set a value in the cache
   */
  set(key: string, value: T): void {
    this.cleanup();

    if (this.cache.size >= this.config.maxSize) {
      // Remove oldest entry if cache is full
      const oldestKey = this.getOldestKey();
      if (oldestKey) this.cache.delete(oldestKey);
    }

    const now = Date.now();
    const entry: CacheEntry<T> = {
      value,
      timestamp: now,
      expiresAt: now + this.config.ttl
    };

    this.cache.set(this.getNamespacedKey(key), entry);
  }

  /**
   * Get a value from the cache
   */
  get(key: string): T | undefined {
    const entry = this.cache.get(this.getNamespacedKey(key));
    
    if (!entry) return undefined;
    
    if (this.isExpired(entry)) {
      this.cache.delete(this.getNamespacedKey(key));
      return undefined;
    }

    return entry.value;
  }

  /**
   * Check if a key exists in the cache
   */
  has(key: string): boolean {
    const entry = this.cache.get(this.getNamespacedKey(key));
    if (!entry) return false;
    if (this.isExpired(entry)) {
      this.cache.delete(this.getNamespacedKey(key));
      return false;
    }
    return true;
  }

  /**
   * Delete a value from the cache
   */
  delete(key: string): boolean {
    return this.cache.delete(this.getNamespacedKey(key));
  }

  /**
   * Clear all entries from the cache
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache size
   */
  size(): number {
    this.cleanup();
    return this.cache.size;
  }

  /**
   * Get cache stats
   */
  stats(): {
    size: number;
    maxSize: number;
    ttl: number;
    namespace: string;
  } {
    return {
      size: this.size(),
      maxSize: this.config.maxSize,
      ttl: this.config.ttl,
      namespace: this.config.namespace
    };
  }

  /**
   * Update cache configuration
   */
  updateConfig(config: Partial<CacheConfig>): void {
    this.config = {
      ...this.config,
      ...config
    };
    this.cleanup();
  }

  private getNamespacedKey(key: string): string {
    return `${this.config.namespace}:${key}`;
  }

  private isExpired(entry: CacheEntry<T>): boolean {
    return Date.now() > entry.expiresAt;
  }

  private cleanup(): void {
    for (const [key, entry] of this.cache.entries()) {
      if (this.isExpired(entry)) {
        this.cache.delete(key);
      }
    }
  }

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

// Export secure cache implementation
export { SecureCache } from './secure';
