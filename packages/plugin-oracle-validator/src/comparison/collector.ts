import {
  OracleDataSource,
  PriceDataPoint,
  OracleValidatorError
} from '../types';

export interface CollectorConfig {
  // 并发配置
  maxConcurrentRequests?: number;
  requestTimeout?: number;
  
  // 重试配置
  retryAttempts?: number;
  retryDelay?: number;
  
  // 缓存配置
  cacheEnabled?: boolean;
  cacheExpiration?: number;
  
  // 速率限制配置
  respectRateLimit?: boolean;
  defaultRateLimit?: {
    requests: number;
    interval: number;
  };
}

export interface CollectionResult {
  symbol: string;
  dataPoints: PriceDataPoint[];
  failedSources: Array<{
    id: string;
    error: string;
    retries: number;
  }>;
  metadata: {
    startTime: number;
    endTime: number;
    duration: number;
    successRate: number;
    averageLatency: number;
  };
}

export class DataCollector {
  private config: Required<CollectorConfig>;
  private sources: Map<string, OracleDataSource>;
  private rateLimiters: Map<string, {
    lastRequest: number;
    requestCount: number;
  }>;
  private cache: Map<string, {
    data: PriceDataPoint;
    expires: number;
  }>;

  constructor(config: CollectorConfig = {}) {
    this.config = {
      maxConcurrentRequests: config.maxConcurrentRequests || 5,
      requestTimeout: config.requestTimeout || 5000,
      retryAttempts: config.retryAttempts || 3,
      retryDelay: config.retryDelay || 1000,
      cacheEnabled: config.cacheEnabled ?? true,
      cacheExpiration: config.cacheExpiration || 1000, // 1秒
      respectRateLimit: config.respectRateLimit ?? true,
      defaultRateLimit: config.defaultRateLimit || {
        requests: 10,
        interval: 1000 // 1秒
      }
    };
    
    this.sources = new Map();
    this.rateLimiters = new Map();
    this.cache = new Map();
  }

  /**
   * 添加数据源
   */
  addSource(source: OracleDataSource): void {
    this.sources.set(source.id, source);
    if (source.rateLimit) {
      this.rateLimiters.set(source.id, {
        lastRequest: 0,
        requestCount: 0
      });
    }
  }

  /**
   * 移除数据源
   */
  removeSource(sourceId: string): void {
    this.sources.delete(sourceId);
    this.rateLimiters.delete(sourceId);
  }

  /**
   * 收集数据
   */
  async collectData(symbol: string): Promise<CollectionResult> {
    const startTime = Date.now();
    const dataPoints: PriceDataPoint[] = [];
    const failedSources: CollectionResult['failedSources'] = [];
    const latencies: number[] = [];

    try {
      const activeTasks = new Set<Promise<void>>();
      
      for (const [sourceId, source] of this.sources) {
        // 检查缓存
        if (this.config.cacheEnabled) {
          const cached = this.getFromCache(sourceId, symbol);
          if (cached) {
            dataPoints.push(cached);
            continue;
          }
        }

        // 等待有空闲槽位
        while (activeTasks.size >= this.config.maxConcurrentRequests) {
          await Promise.race(Array.from(activeTasks));
        }

        // 检查速率限制
        if (this.config.respectRateLimit && !this.checkRateLimit(source)) {
          failedSources.push({
            id: sourceId,
            error: 'Rate limit exceeded',
            retries: 0
          });
          continue;
        }

        // 创建数据获取任务
        const task = this.fetchDataWithRetry(source, symbol)
          .then(result => {
            if (result.success) {
              dataPoints.push(result.data);
              latencies.push(result.latency);
              
              if (this.config.cacheEnabled) {
                this.cache.set(`${sourceId}:${symbol}`, {
                  data: result.data,
                  expires: Date.now() + this.config.cacheExpiration
                });
              }
            } else {
              failedSources.push({
                id: sourceId,
                error: result.error,
                retries: result.retries
              });
            }
          })
          .finally(() => {
            activeTasks.delete(task);
          });

        activeTasks.add(task);
      }

      // 等待所有任务完成
      await Promise.all(Array.from(activeTasks));

      return {
        symbol,
        dataPoints,
        failedSources,
        metadata: {
          startTime,
          endTime: Date.now(),
          duration: Date.now() - startTime,
          successRate: dataPoints.length / (dataPoints.length + failedSources.length),
          averageLatency: latencies.length > 0
            ? latencies.reduce((a, b) => a + b) / latencies.length
            : 0
        }
      };
    } catch (error) {
      throw new OracleValidatorError('Failed to collect data', {
        cause: error
      });
    }
  }

  /**
   * 清理过期缓存
   */
  cleanCache(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache) {
      if (entry.expires <= now) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * 从缓存获取数据
   */
  private getFromCache(
    sourceId: string,
    symbol: string
  ): PriceDataPoint | null {
    const key = `${sourceId}:${symbol}`;
    const entry = this.cache.get(key);
    
    if (entry && entry.expires > Date.now()) {
      return entry.data;
    }
    
    this.cache.delete(key);
    return null;
  }

  /**
   * 检查速率限制
   */
  private checkRateLimit(source: OracleDataSource): boolean {
    const rateLimit = source.rateLimit || this.config.defaultRateLimit;
    const limiter = this.rateLimiters.get(source.id);
    
    if (!limiter) {
      this.rateLimiters.set(source.id, {
        lastRequest: Date.now(),
        requestCount: 1
      });
      return true;
    }

    const now = Date.now();
    const elapsed = now - limiter.lastRequest;

    if (elapsed > rateLimit.interval) {
      // 重置计数器
      limiter.lastRequest = now;
      limiter.requestCount = 1;
      return true;
    }

    if (limiter.requestCount >= rateLimit.requests) {
      return false;
    }

    limiter.requestCount++;
    return true;
  }

  /**
   * 带重试的数据获取
   */
  private async fetchDataWithRetry(
    source: OracleDataSource,
    symbol: string,
    attempt: number = 1
  ): Promise<{
    success: boolean;
    data?: PriceDataPoint;
    error?: string;
    retries: number;
    latency: number;
  }> {
    const startTime = Date.now();

    try {
      const response = await this.fetchWithTimeout(
        source.endpoint,
        symbol,
        this.config.requestTimeout
      );

      return {
        success: true,
        data: {
          source: source.id,
          symbol,
          price: BigInt(Math.round(response.price * 1e8)), // 转换为 8 位小数
          timestamp: response.timestamp || Date.now(),
          volume: response.volume ? BigInt(Math.round(response.volume)) : undefined,
          confidence: response.confidence
        },
        retries: attempt - 1,
        latency: Date.now() - startTime
      };
    } catch (error) {
      if (attempt < this.config.retryAttempts) {
        await new Promise(resolve =>
          setTimeout(resolve, this.config.retryDelay * attempt)
        );
        return this.fetchDataWithRetry(source, symbol, attempt + 1);
      }

      return {
        success: false,
        error: error.message,
        retries: attempt - 1,
        latency: Date.now() - startTime
      };
    }
  }

  /**
   * 带超时的数据获取
   */
  private async fetchWithTimeout(
    endpoint: string,
    symbol: string,
    timeout: number
  ): Promise<{
    price: number;
    timestamp?: number;
    volume?: number;
    confidence?: number;
  }> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(
        `${endpoint}?symbol=${encodeURIComponent(symbol)}`,
        {
          signal: controller.signal,
          headers: {
            'Accept': 'application/json'
          }
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data;
    } finally {
      clearTimeout(timeoutId);
    }
  }
} 