interface CacheEntry<T> {
  data: T;
  timestamp: number;
  expiresAt: number;
}

export class AnalysisCache {
  private cache: Map<string, CacheEntry<any>> = new Map();
  private readonly defaultTTL: number = 5 * 60 * 1000; // 5分钟默认过期时间

  set<T>(key: string, data: T, ttl: number = this.defaultTTL): void {
    const now = Date.now();
    this.cache.set(key, {
      data,
      timestamp: now,
      expiresAt: now + ttl
    });
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return entry.data as T;
  }

  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  delete(key: string): void {
    this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  // 清理过期缓存
  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
      }
    }
  }

  // 获取缓存统计信息
  getStats(): {
    totalEntries: number;
    expiredEntries: number;
    averageAge: number;
  } {
    const now = Date.now();
    let expiredCount = 0;
    let totalAge = 0;
    let validEntries = 0;

    for (const entry of this.cache.values()) {
      if (now > entry.expiresAt) {
        expiredCount++;
      } else {
        totalAge += now - entry.timestamp;
        validEntries++;
      }
    }

    return {
      totalEntries: this.cache.size,
      expiredEntries: expiredCount,
      averageAge: validEntries > 0 ? totalAge / validEntries : 0
    };
  }
} 