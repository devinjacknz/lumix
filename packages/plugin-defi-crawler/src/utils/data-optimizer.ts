import { logger } from "@lumix/core";

export interface DataProcessingConfig {
  batchSize?: number;
  cacheEnabled?: boolean;
  cacheTTL?: number;
  compressionEnabled?: boolean;
  retryAttempts?: number;
  retryDelay?: number;
  validationEnabled?: boolean;
  parallelProcessing?: boolean;
  maxParallelTasks?: number;
}

export class DataOptimizer {
  private static instance: DataOptimizer;
  private cache: Map<string, {
    data: any;
    timestamp: number;
  }>;
  private processingQueue: Array<() => Promise<any>>;
  private isProcessing: boolean;

  private constructor(private config: DataProcessingConfig = {}) {
    this.cache = new Map();
    this.processingQueue = [];
    this.isProcessing = false;

    // 设置默认配置
    this.config = {
      batchSize: 100,
      cacheEnabled: true,
      cacheTTL: 3600000, // 1小时
      compressionEnabled: true,
      retryAttempts: 3,
      retryDelay: 1000,
      validationEnabled: true,
      parallelProcessing: true,
      maxParallelTasks: 5,
      ...config
    };
  }

  public static getInstance(config?: DataProcessingConfig): DataOptimizer {
    if (!DataOptimizer.instance) {
      DataOptimizer.instance = new DataOptimizer(config);
    }
    return DataOptimizer.instance;
  }

  public async processData<T>(
    data: T[],
    processor: (item: T) => Promise<any>,
    options: {
      cacheKey?: string;
      validation?: (item: T) => boolean;
      transform?: (result: any) => any;
    } = {}
  ): Promise<any[]> {
    try {
      // 1. 检查缓存
      if (this.config.cacheEnabled && options.cacheKey) {
        const cached = this.getCachedData(options.cacheKey);
        if (cached) return cached;
      }

      // 2. 数据验证
      let validData = data;
      if (this.config.validationEnabled && options.validation) {
        validData = data.filter(options.validation);
        logger.debug("Data Optimizer", `Filtered ${data.length - validData.length} invalid items`);
      }

      // 3. 批处理
      const batches = this.createBatches(validData, this.config.batchSize);
      const results = [];

      // 4. 处理数据
      if (this.config.parallelProcessing) {
        // 并行处理
        const batchPromises = batches.map(batch =>
          this.processBatchWithRetry(batch, processor, options.transform)
        );

        // 控制并发数
        const batchResults = await this.processInParallel(
          batchPromises,
          this.config.maxParallelTasks
        );
        results.push(...batchResults.flat());
      } else {
        // 串行处理
        for (const batch of batches) {
          const batchResult = await this.processBatchWithRetry(
            batch,
            processor,
            options.transform
          );
          results.push(...batchResult);
        }
      }

      // 5. 缓存结果
      if (this.config.cacheEnabled && options.cacheKey) {
        this.cacheData(options.cacheKey, results);
      }

      return results;
    } catch (error) {
      if (error instanceof Error) {
        logger.error("Data Optimizer", `Data processing failed: ${error.message}`);
      }
      throw error;
    }
  }

  private createBatches<T>(data: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < data.length; i += batchSize) {
      batches.push(data.slice(i, i + batchSize));
    }
    return batches;
  }

  private async processBatchWithRetry<T>(
    batch: T[],
    processor: (item: T) => Promise<any>,
    transform?: (result: any) => any
  ): Promise<any[]> {
    let attempts = 0;
    while (attempts < this.config.retryAttempts) {
      try {
        const results = await Promise.all(
          batch.map(async item => {
            const result = await processor(item);
            return transform ? transform(result) : result;
          })
        );
        return results;
      } catch (error) {
        attempts++;
        if (attempts === this.config.retryAttempts) throw error;
        await this.delay(this.config.retryDelay * attempts);
      }
    }
    return [];
  }

  private async processInParallel<T>(
    tasks: Promise<T>[],
    maxParallel: number
  ): Promise<T[]> {
    const results: T[] = [];
    const chunks = this.createBatches(tasks, maxParallel);

    for (const chunk of chunks) {
      const chunkResults = await Promise.all(chunk);
      results.push(...chunkResults);
    }

    return results;
  }

  private getCachedData(key: string): any | null {
    const cached = this.cache.get(key);
    if (!cached) return null;

    const now = Date.now();
    if (now - cached.timestamp > this.config.cacheTTL) {
      this.cache.delete(key);
      return null;
    }

    return cached.data;
  }

  private cacheData(key: string, data: any): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  public clearCache(): void {
    this.cache.clear();
  }

  public getCacheSize(): number {
    return this.cache.size;
  }

  public getProcessingQueueLength(): number {
    return this.processingQueue.length;
  }

  public updateConfig(newConfig: Partial<DataProcessingConfig>): void {
    this.config = {
      ...this.config,
      ...newConfig
    };
  }
} 