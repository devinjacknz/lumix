import { EventEmitter } from 'events';
import { MonitorDataPoint } from './realtime';
import { logger } from '../utils/logger';
import { DataCompressor, CompressionConfig } from './data-compressor';
import { ParallelProcessor, ParallelProcessorConfig } from './parallel-processor';

/**
 * 数据流处理配置
 */
export interface StreamProcessorConfig {
  batchSize?: number;
  flushInterval?: number;
  maxQueueSize?: number;
  processingTimeout?: number;
  retryAttempts?: number;
  retryDelay?: number;
  compression?: CompressionConfig;
  parallel?: ParallelProcessorConfig;
}

/**
 * 数据处理状态
 */
export interface ProcessingStats {
  processedCount: number;
  errorCount: number;
  avgProcessingTime: number;
  queueSize: number;
  lastProcessedTimestamp?: number;
  compression?: {
    enabled: boolean;
    ratio: number;
    savedBytes: number;
  };
}

/**
 * 数据流处理器
 * 用于高效处理大量实时监控数据
 */
export class StreamProcessor extends EventEmitter {
  private config: Required<StreamProcessorConfig>;
  private queue: MonitorDataPoint[];
  private processing: boolean;
  private stats: ProcessingStats;
  private flushTimer?: NodeJS.Timeout;
  private compressor: DataCompressor;
  private parallelProcessor?: ParallelProcessor;

  constructor(config: StreamProcessorConfig = {}) {
    super();
    this.config = {
      batchSize: config.batchSize || 1000,
      flushInterval: config.flushInterval || 5000,
      maxQueueSize: config.maxQueueSize || 10000,
      processingTimeout: config.processingTimeout || 30000,
      retryAttempts: config.retryAttempts || 3,
      retryDelay: config.retryDelay || 1000,
      compression: config.compression || {},
      parallel: config.parallel || {}
    };

    this.queue = [];
    this.processing = false;
    this.stats = {
      processedCount: 0,
      errorCount: 0,
      avgProcessingTime: 0,
      queueSize: 0,
      compression: {
        enabled: this.config.compression.enabled ?? true,
        ratio: 0,
        savedBytes: 0
      }
    };

    // 初始化压缩器
    this.compressor = new DataCompressor(this.config.compression);

    // 初始化并行处理器
    if (this.config.parallel.workerCount !== 0) {
      this.initializeParallelProcessor();
    }

    this.startFlushTimer();
  }

  /**
   * 初始化并行处理器
   */
  private initializeParallelProcessor(): void {
    this.parallelProcessor = new ParallelProcessor(this.config.parallel);

    // 处理并行处理结果
    this.parallelProcessor.on('processingComplete', (result) => {
      this.handleParallelProcessingResult(result);
    });

    // 处理并行处理错误
    this.parallelProcessor.on('error', (error) => {
      this.stats.errorCount++;
      this.emit('error', error);
    });
  }

  /**
   * 处理并行处理结果
   */
  private async handleParallelProcessingResult(result: {
    processed: MonitorDataPoint[];
    aggregated: Record<string, number>;
  }): Promise<void> {
    try {
      // 压缩处理后的数据
      const compressedData = await this.compressor.compress(result.processed);

      // 发送处理后的数据
      await this.sendBatch(compressedData);

      // 更新压缩统计信息
      this.updateCompressionStats();

      // 更新处理统计信息
      this.updateStats(result.processed.length, Date.now());

      // 发送处理完成事件
      this.emit('processed', {
        batchSize: result.processed.length,
        processingTime: Date.now(),
        compressionStats: this.compressor.getStats(),
        aggregatedMetrics: result.aggregated
      });
    } catch (error) {
      this.stats.errorCount++;
      this.emit('error', error);
    }
  }

  /**
   * 添加数据点到处理队列
   */
  public async addDataPoint(dataPoint: MonitorDataPoint): Promise<void> {
    if (this.queue.length >= this.config.maxQueueSize) {
      logger.warn('StreamProcessor', 'Queue size limit reached, dropping oldest data point');
      this.queue.shift();
    }

    this.queue.push(dataPoint);
    this.stats.queueSize = this.queue.length;

    if (this.queue.length >= this.config.batchSize) {
      await this.processBatch();
    }
  }

  /**
   * 处理数据批次
   */
  private async processBatch(): Promise<void> {
    if (this.processing || this.queue.length === 0) {
      return;
    }

    this.processing = true;
    const startTime = Date.now();
    const batch = this.queue.splice(0, this.config.batchSize);

    try {
      if (this.parallelProcessor) {
        // 使用并行处理器处理数据
        for (const point of batch) {
          await this.parallelProcessor.addDataPoint(point);
        }
      } else {
        // 使用原有的处理逻辑
        const processedBatch = this.preProcessBatch(batch);
        const compressedData = await this.compressor.compress(processedBatch);
        await this.sendBatch(compressedData);
        this.updateCompressionStats();
        this.updateStats(batch.length, startTime);
      }
    } catch (error) {
      this.stats.errorCount++;
      this.emit('error', error);
      
      // 重试处理
      await this.retryProcessing(batch);
    } finally {
      this.processing = false;
      this.stats.queueSize = this.queue.length;
    }
  }

  /**
   * 预处理数据批次
   */
  private preProcessBatch(batch: MonitorDataPoint[]): MonitorDataPoint[] {
    return batch.map(point => ({
      ...point,
      metrics: this.aggregateMetrics(point.metrics),
      resources: this.normalizeResources(point.resources),
      performance: this.calculatePerformance(point.performance)
    }));
  }

  /**
   * 聚合指标数据
   */
  private aggregateMetrics(metrics: Record<string, number>): Record<string, number> {
    // 在这里实现指标聚合逻辑
    return metrics;
  }

  /**
   * 标准化资源数据
   */
  private normalizeResources(resources: MonitorDataPoint['resources']): MonitorDataPoint['resources'] {
    return {
      cpu: Math.min(100, Math.max(0, resources.cpu)),
      memory: Math.min(100, Math.max(0, resources.memory)),
      disk: Math.min(100, Math.max(0, resources.disk)),
      network: Math.min(100, Math.max(0, resources.network))
    };
  }

  /**
   * 计算性能指标
   */
  private calculatePerformance(performance: MonitorDataPoint['performance']): MonitorDataPoint['performance'] {
    return {
      ...performance,
      errorRate: Math.min(1, Math.max(0, performance.errorRate))
    };
  }

  /**
   * 发送处理后的数据批次
   */
  private async sendBatch(compressedData: Buffer): Promise<void> {
    this.emit('batch', compressedData);
  }

  /**
   * 重试处理失败的批次
   */
  private async retryProcessing(batch: MonitorDataPoint[]): Promise<void> {
    let attempts = 0;
    
    while (attempts < this.config.retryAttempts) {
      try {
        await new Promise(resolve => setTimeout(resolve, this.config.retryDelay));
        const processedBatch = this.preProcessBatch(batch);
        const compressedData = await this.compressor.compress(processedBatch);
        await this.sendBatch(compressedData);
        return;
      } catch (error) {
        attempts++;
        logger.error('StreamProcessor', `Retry attempt ${attempts} failed`, { error });
      }
    }

    // 如果所有重试都失败，将数据放回队列
    this.queue.unshift(...batch);
  }

  /**
   * 更新压缩统计信息
   */
  private updateCompressionStats(): void {
    const compressionStats = this.compressor.getStats();
    if (this.stats.compression) {
      this.stats.compression.ratio = compressionStats.compressionRatio;
      this.stats.compression.savedBytes = compressionStats.totalSaved;
    }
  }

  /**
   * 更新处理统计信息
   */
  private updateStats(batchSize: number, startTime: number): void {
    const processingTime = Date.now() - startTime;
    this.stats.processedCount += batchSize;
    this.stats.avgProcessingTime = (
      this.stats.avgProcessingTime * (this.stats.processedCount - batchSize) +
      processingTime * batchSize
    ) / this.stats.processedCount;
    this.stats.lastProcessedTimestamp = Date.now();
  }

  /**
   * 启动定时刷新
   */
  private startFlushTimer(): void {
    this.flushTimer = setInterval(async () => {
      if (this.queue.length > 0) {
        await this.processBatch();
      }
    }, this.config.flushInterval);
  }

  /**
   * 停止处理器
   */
  public stop(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }

    if (this.parallelProcessor) {
      this.parallelProcessor.stop();
    }
  }

  /**
   * 获取处理统计信息
   */
  public getStats(): ProcessingStats & { parallel?: ParallelProcessingStats } {
    const stats = { ...this.stats };
    if (this.parallelProcessor) {
      stats.parallel = this.parallelProcessor.getStats();
    }
    return stats;
  }
} 