/**
 * 缓存操作结果接口
 */
export interface CacheResult<T> {
  success: boolean;
  data?: T;
  error?: Error;
}

/**
 * 缓存配置选项
 */
export interface CacheConfig {
  ttl?: number;  // 过期时间(毫秒)
  maxSize?: number;  // 最大缓存条目数
  maxMemory?: number;  // 最大内存使用量(字节)
  serializer?: {
    serialize: (data: unknown) => string;
    deserialize: (data: string) => unknown;
  };
}

/**
 * 缓存统计信息
 */
export interface CacheStats {
  size: number;  // 当前缓存条目数
  hits: number;  // 命中次数
  misses: number;  // 未命中次数
  memory?: number;  // 当前内存使用量(字节)
}

/**
 * 缓存适配器接口
 */
export abstract class CacheAdapter {
  protected config: CacheConfig;

  constructor(config: CacheConfig = {}) {
    this.config = {
      ttl: 0,  // 默认永不过期
      maxSize: Infinity,
      maxMemory: Infinity,
      ...config
    };
  }

  /**
   * 初始化缓存
   */
  abstract init(): Promise<CacheResult<void>>;

  /**
   * 关闭缓存
   */
  abstract close(): Promise<CacheResult<void>>;

  /**
   * 设置缓存
   */
  abstract set<T>(key: string, value: T, ttl?: number): Promise<CacheResult<void>>;

  /**
   * 获取缓存
   */
  abstract get<T>(key: string): Promise<CacheResult<T | null>>;

  /**
   * 删除缓存
   */
  abstract delete(key: string): Promise<CacheResult<boolean>>;

  /**
   * 清空缓存
   */
  abstract clear(): Promise<CacheResult<void>>;

  /**
   * 获取多个缓存
   */
  abstract mget<T>(keys: string[]): Promise<CacheResult<(T | null)[]>>;

  /**
   * 设置多个缓存
   */
  abstract mset<T>(items: Array<{ key: string; value: T; ttl?: number }>): Promise<CacheResult<void>>;

  /**
   * 删除多个缓存
   */
  abstract mdelete(keys: string[]): Promise<CacheResult<boolean[]>>;

  /**
   * 获取缓存统计信息
   */
  abstract stats(): Promise<CacheResult<CacheStats>>;

  /**
   * 检查键是否存在
   */
  abstract has(key: string): Promise<CacheResult<boolean>>;

  /**
   * 获取所有键
   */
  abstract keys(pattern?: string): Promise<CacheResult<string[]>>;

  /**
   * 获取键的剩余生存时间(毫秒)
   */
  abstract ttl(key: string): Promise<CacheResult<number>>;

  /**
   * 更新键的过期时间
   */
  abstract expire(key: string, ttl: number): Promise<CacheResult<boolean>>;
}
