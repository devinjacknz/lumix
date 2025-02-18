import { EventEmitter } from 'events';
import { ChainProtocol } from '../chain/abstract';
import { CacheManager } from '../cache/cache-manager';
import { WorkerPool } from '../parallel/worker-pool';

export interface NetworkConfig {
  rpcEndpoints: {
    [key in ChainProtocol]: string[];
  };
  maxConcurrentRequests: number;
  requestTimeout: number;
  retryStrategy: {
    maxAttempts: number;
    baseDelay: number;
    maxDelay: number;
  };
  batchingStrategy: {
    maxBatchSize: number;
    maxDelay: number;
  };
  caching: {
    enabled: boolean;
    ttl: number;
  };
  compression: {
    enabled: boolean;
    threshold: number;
  };
  loadBalancing: {
    strategy: 'round-robin' | 'weighted' | 'latency-based';
    checkInterval: number;
  };
}

export interface NetworkStats {
  requests: {
    total: number;
    successful: number;
    failed: number;
    cached: number;
    batched: number;
  };
  latency: {
    avg: number;
    min: number;
    max: number;
    p95: number;
  };
  bandwidth: {
    in: number;
    out: number;
  };
  endpoints: {
    [url: string]: {
      latency: number;
      reliability: number;
      usage: number;
    };
  };
}

export interface RequestOptions {
  method: string;
  params?: any[];
  timeout?: number;
  priority?: number;
  retries?: number;
  cache?: boolean;
  batch?: boolean;
}

export interface BatchedRequest {
  id: string;
  method: string;
  params: any[];
  resolve: (result: any) => void;
  reject: (error: Error) => void;
  timestamp: number;
}

export class NetworkOptimizer extends EventEmitter {
  private endpoints: Map<ChainProtocol, string[]> = new Map();
  private endpointStats: Map<string, {
    latency: number[];
    errors: number;
    requests: number;
    lastCheck: number;
  }> = new Map();
  private batchQueues: Map<string, BatchedRequest[]> = new Map();
  private batchTimers: Map<string, NodeJS.Timeout> = new Map();
  private requestCount: number = 0;
  private activeRequests: number = 0;

  constructor(
    private config: NetworkConfig,
    private cache: CacheManager,
    private workerPool: WorkerPool
  ) {
    super();
    this.initializeEndpoints();
    this.startEndpointMonitoring();
  }

  private initializeEndpoints() {
    // 初始化每个链的RPC端点
    for (const [protocol, urls] of Object.entries(this.config.rpcEndpoints)) {
      this.endpoints.set(protocol as ChainProtocol, [...urls]);
      
      // 初始化端点统计
      urls.forEach(url => {
        this.endpointStats.set(url, {
          latency: [],
          errors: 0,
          requests: 0,
          lastCheck: Date.now(),
        });
      });
    }
  }

  private startEndpointMonitoring() {
    setInterval(() => {
      this.checkEndpoints();
    }, this.config.loadBalancing.checkInterval);
  }

  private async checkEndpoints() {
    for (const [protocol, urls] of this.endpoints.entries()) {
      for (const url of urls) {
        try {
          const startTime = Date.now();
          await this.sendRequest(protocol, {
            method: 'net_version',
            params: [],
          });
          const latency = Date.now() - startTime;

          const stats = this.endpointStats.get(url)!;
          stats.latency.push(latency);
          if (stats.latency.length > 100) {
            stats.latency.shift();
          }
          stats.lastCheck = Date.now();
        } catch (error) {
          const stats = this.endpointStats.get(url)!;
          stats.errors++;
        }
      }
    }

    this.updateEndpointPriorities();
  }

  private updateEndpointPriorities() {
    for (const [protocol, urls] of this.endpoints.entries()) {
      // 根据策略对端点进行排序
      const sortedUrls = [...urls].sort((a, b) => {
        const statsA = this.endpointStats.get(a)!;
        const statsB = this.endpointStats.get(b)!;

        switch (this.config.loadBalancing.strategy) {
          case 'latency-based':
            return this.getAverageLatency(statsA) - this.getAverageLatency(statsB);
          case 'weighted':
            return this.calculateEndpointScore(statsB) - this.calculateEndpointScore(statsA);
          case 'round-robin':
          default:
            return statsA.requests - statsB.requests;
        }
      });

      this.endpoints.set(protocol, sortedUrls);
    }
  }

  private getAverageLatency(stats: { latency: number[] }): number {
    if (stats.latency.length === 0) return Infinity;
    return stats.latency.reduce((a, b) => a + b, 0) / stats.latency.length;
  }

  private calculateEndpointScore(stats: {
    latency: number[];
    errors: number;
    requests: number;
  }): number {
    const avgLatency = this.getAverageLatency(stats);
    const reliability = 1 - stats.errors / (stats.requests || 1);
    return reliability * (1000 / (avgLatency || 1000));
  }

  async request(
    protocol: ChainProtocol,
    options: RequestOptions
  ): Promise<any> {
    const cacheKey = this.getCacheKey(protocol, options);

    // 检查缓存
    if (this.config.caching.enabled && options.cache !== false) {
      const cached = await this.cache.get(cacheKey);
      if (cached) {
        return cached;
      }
    }

    // 检查是否可以批处理
    if (this.config.batchingStrategy.enabled && options.batch !== false) {
      return this.batchRequest(protocol, options);
    }

    // 执行请求
    return this.executeRequest(protocol, options);
  }

  private async executeRequest(
    protocol: ChainProtocol,
    options: RequestOptions,
    attempt: number = 1
  ): Promise<any> {
    // 等待有可用的请求槽
    while (this.activeRequests >= this.config.maxConcurrentRequests) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    this.activeRequests++;
    const requestId = `${protocol}-${Date.now()}-${this.requestCount++}`;

    try {
      // 选择端点
      const endpoint = await this.selectEndpoint(protocol);
      const stats = this.endpointStats.get(endpoint)!;
      stats.requests++;

      // 准备请求数据
      const requestData = {
        jsonrpc: '2.0',
        id: requestId,
        method: options.method,
        params: options.params || [],
      };

      // 压缩请求（如果启用）
      const compressedData = this.config.compression.enabled
        ? await this.compressRequest(requestData)
        : requestData;

      // 发送请求
      const startTime = Date.now();
      const response = await this.sendRequest(endpoint, compressedData);
      const latency = Date.now() - startTime;

      // 更新统计信息
      stats.latency.push(latency);
      if (stats.latency.length > 100) {
        stats.latency.shift();
      }

      // 解压响应（如果需要）
      const result = this.config.compression.enabled
        ? await this.decompressResponse(response)
        : response;

      // 缓存结果
      if (this.config.caching.enabled && options.cache !== false) {
        const cacheKey = this.getCacheKey(protocol, options);
        await this.cache.set(cacheKey, result, {
          ttl: this.config.caching.ttl,
        });
      }

      return result;
    } catch (error) {
      // 更新错误统计
      const endpoint = this.endpoints.get(protocol)![0];
      const stats = this.endpointStats.get(endpoint)!;
      stats.errors++;

      // 重试逻辑
      if (
        attempt < (options.retries || this.config.retryStrategy.maxAttempts) &&
        this.shouldRetry(error)
      ) {
        const delay = this.calculateRetryDelay(attempt);
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.executeRequest(protocol, options, attempt + 1);
      }

      throw error;
    } finally {
      this.activeRequests--;
    }
  }

  private async batchRequest(
    protocol: ChainProtocol,
    options: RequestOptions
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const batchKey = `${protocol}-${options.method}`;
      const request: BatchedRequest = {
        id: `${Date.now()}-${Math.random()}`,
        method: options.method,
        params: options.params || [],
        resolve,
        reject,
        timestamp: Date.now(),
      };

      // 添加到批处理队列
      let queue = this.batchQueues.get(batchKey);
      if (!queue) {
        queue = [];
        this.batchQueues.set(batchKey, queue);
      }
      queue.push(request);

      // 设置批处理定时器
      if (!this.batchTimers.has(batchKey)) {
        const timer = setTimeout(() => {
          this.processBatch(protocol, batchKey);
        }, this.config.batchingStrategy.maxDelay);
        this.batchTimers.set(batchKey, timer);
      }

      // 如果队列达到最大大小，立即处理
      if (queue.length >= this.config.batchingStrategy.maxBatchSize) {
        clearTimeout(this.batchTimers.get(batchKey)!);
        this.batchTimers.delete(batchKey);
        this.processBatch(protocol, batchKey);
      }
    });
  }

  private async processBatch(protocol: ChainProtocol, batchKey: string) {
    const queue = this.batchQueues.get(batchKey) || [];
    this.batchQueues.delete(batchKey);
    this.batchTimers.delete(batchKey);

    if (queue.length === 0) return;

    try {
      // 准备批处理请求
      const batchRequest = queue.map(request => ({
        jsonrpc: '2.0',
        id: request.id,
        method: request.method,
        params: request.params,
      }));

      // 执行批处理请求
      const results = await this.executeRequest(protocol, {
        method: 'batch',
        params: batchRequest,
      });

      // 分发结果
      const resultMap = new Map(results.map((r: any) => [r.id, r]));
      for (const request of queue) {
        const result = resultMap.get(request.id);
        if (result.error) {
          request.reject(new Error(result.error.message));
        } else {
          request.resolve(result.result);
        }
      }
    } catch (error) {
      // 如果批处理失败，拆分为单独的请求
      for (const request of queue) {
        this.executeRequest(protocol, {
          method: request.method,
          params: request.params,
        }).then(request.resolve).catch(request.reject);
      }
    }
  }

  private async selectEndpoint(protocol: ChainProtocol): Promise<string> {
    const urls = this.endpoints.get(protocol);
    if (!urls || urls.length === 0) {
      throw new Error(`No endpoints available for protocol: ${protocol}`);
    }

    // 根据负载均衡策略选择端点
    switch (this.config.loadBalancing.strategy) {
      case 'latency-based':
        return this.selectEndpointByLatency(urls);
      case 'weighted':
        return this.selectEndpointByWeight(urls);
      case 'round-robin':
      default:
        return this.selectEndpointRoundRobin(urls);
    }
  }

  private selectEndpointByLatency(urls: string[]): string {
    return urls[0]; // 已经按延迟排序
  }

  private selectEndpointByWeight(urls: string[]): string {
    const totalScore = urls.reduce((sum, url) => {
      return sum + this.calculateEndpointScore(this.endpointStats.get(url)!);
    }, 0);

    const random = Math.random() * totalScore;
    let accumulator = 0;

    for (const url of urls) {
      accumulator += this.calculateEndpointScore(this.endpointStats.get(url)!);
      if (accumulator >= random) {
        return url;
      }
    }

    return urls[0];
  }

  private selectEndpointRoundRobin(urls: string[]): string {
    const url = urls[0];
    urls.push(urls.shift()!);
    return url;
  }

  private shouldRetry(error: any): boolean {
    // 判断错误是否可重试
    const retryableErrors = [
      'ETIMEDOUT',
      'ECONNRESET',
      'ECONNREFUSED',
      'ENOTFOUND',
    ];
    return retryableErrors.includes(error.code);
  }

  private calculateRetryDelay(attempt: number): number {
    const { baseDelay, maxDelay } = this.config.retryStrategy;
    const delay = Math.min(
      baseDelay * Math.pow(2, attempt - 1),
      maxDelay
    );
    return delay + Math.random() * delay * 0.1; // 添加随机抖动
  }

  private getCacheKey(protocol: ChainProtocol, options: RequestOptions): string {
    return `${protocol}-${options.method}-${JSON.stringify(options.params)}`;
  }

  private async compressRequest(data: any): Promise<any> {
    // 使用工作线程池进行压缩
    return this.workerPool.executeTask({
      id: `compress-${Date.now()}`,
      type: 'compress',
      data,
    });
  }

  private async decompressResponse(data: any): Promise<any> {
    // 使用工作线程池进行解压
    return this.workerPool.executeTask({
      id: `decompress-${Date.now()}`,
      type: 'decompress',
      data,
    });
  }

  private async sendRequest(endpoint: string, data: any): Promise<any> {
    // 实际的网络请求实现
    return {};
  }

  getStats(): NetworkStats {
    const stats: NetworkStats = {
      requests: {
        total: this.requestCount,
        successful: 0,
        failed: 0,
        cached: 0,
        batched: 0,
      },
      latency: {
        avg: 0,
        min: Infinity,
        max: 0,
        p95: 0,
      },
      bandwidth: {
        in: 0,
        out: 0,
      },
      endpoints: {},
    };

    // 计算端点统计
    for (const [url, endpointStats] of this.endpointStats.entries()) {
      const latencies = endpointStats.latency;
      stats.endpoints[url] = {
        latency: this.getAverageLatency(endpointStats),
        reliability: 1 - endpointStats.errors / (endpointStats.requests || 1),
        usage: endpointStats.requests,
      };

      // 更新延迟统计
      if (latencies.length > 0) {
        stats.latency.min = Math.min(stats.latency.min, ...latencies);
        stats.latency.max = Math.max(stats.latency.max, ...latencies);
        stats.latency.avg =
          latencies.reduce((a, b) => a + b, 0) / latencies.length;
        
        // 计算P95
        const sorted = [...latencies].sort((a, b) => a - b);
        const p95Index = Math.floor(sorted.length * 0.95);
        stats.latency.p95 = sorted[p95Index];
      }

      // 更新请求统计
      stats.requests.successful += endpointStats.requests - endpointStats.errors;
      stats.requests.failed += endpointStats.errors;
    }

    return stats;
  }

  async shutdown(): Promise<void> {
    // 清理所有批处理定时器
    for (const timer of this.batchTimers.values()) {
      clearTimeout(timer);
    }
    this.batchTimers.clear();

    // 处理剩余的批处理请求
    for (const [protocol, batchKey] of this.batchQueues.keys()) {
      await this.processBatch(protocol as ChainProtocol, batchKey);
    }

    // 等待所有活动请求完成
    while (this.activeRequests > 0) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    this.emit('shutdown');
  }
}

export { NetworkOptimizer, NetworkConfig, NetworkStats }; 