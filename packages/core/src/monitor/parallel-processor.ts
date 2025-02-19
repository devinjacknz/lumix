import { EventEmitter } from 'events';
import { MonitorDataPoint } from './realtime';
import { logger } from '../utils/logger';
import { ThreadPool, ThreadPoolConfig } from './thread-pool';

/**
 * 并行处理配置
 */
export interface ParallelProcessorConfig extends ThreadPoolConfig {
  batchSize?: number;
  maxQueueSize?: number;
}

/**
 * 并行处理统计
 */
export interface ParallelProcessingStats {
  activeWorkers: number;
  queueSize: number;
  processedCount: number;
  errorCount: number;
  avgProcessingTime: number;
  lastProcessedTimestamp?: number;
  workerStats: Array<{
    id: number;
    status: 'idle' | 'busy';
    processedCount: number;
    avgProcessingTime: number;
  }>;
}

/**
 * 并行处理器
 */
export class ParallelProcessor extends EventEmitter {
  private config: Required<ParallelProcessorConfig>;
  private queue: MonitorDataPoint[];
  private threadPool: ThreadPool;
  private stats: ParallelProcessingStats;

  constructor(config: ParallelProcessorConfig = {}) {
    super();
    this.config = {
      batchSize: config.batchSize || 1000,
      maxQueueSize: config.maxQueueSize || 10000,
      minWorkers: config.minWorkers || 2,
      maxWorkers: config.maxWorkers || 8,
      idleTimeout: config.idleTimeout || 60000,
      processingTimeout: config.processingTimeout || 30000,
      scaleUpThreshold: config.scaleUpThreshold || 3,
      scaleDownThreshold: config.scaleDownThreshold || 0.5
    };

    this.queue = [];
    this.stats = this.initializeStats();

    // 初始化线程池
    this.threadPool = new ThreadPool({
      minWorkers: this.config.minWorkers,
      maxWorkers: this.config.maxWorkers,
      idleTimeout: this.config.idleTimeout,
      processingTimeout: this.config.processingTimeout,
      scaleUpThreshold: this.config.scaleUpThreshold,
      scaleDownThreshold: this.config.scaleDownThreshold
    });

    this.setupThreadPoolEvents();
  }

  /**
   * 初始化统计信息
   */
  private initializeStats(): ParallelProcessingStats {
    return {
      activeWorkers: 0,
      queueSize: 0,
      processedCount: 0,
      errorCount: 0,
      avgProcessingTime: 0,
      workerStats: []
    };
  }

  /**
   * 设置线程池事件监听
   */
  private setupThreadPoolEvents(): void {
    this.threadPool.on('taskCompleted', ({ workerId, processingTime, data }) => {
      this.handleProcessingResult(workerId, processingTime, data);
    });

    this.threadPool.on('taskError', ({ workerId, error }) => {
      this.handleProcessingError(workerId, error);
    });

    this.threadPool.on('workerTimeout', ({ workerId }) => {
      this.handleWorkerTimeout(workerId);
    });

    this.threadPool.on('poolScaled', ({ direction, workers }) => {
      logger.info('ParallelProcessor', `Thread pool ${direction}scaled to ${workers} workers`);
    });
  }

  /**
   * 处理处理结果
   */
  private handleProcessingResult(
    workerId: number,
    processingTime: number,
    result: { processed: MonitorDataPoint[]; aggregated: Record<string, number> }
  ): void {
    this.updateStats(processingTime);
    this.emit('processingComplete', result);
  }

  /**
   * 处理处理错误
   */
  private handleProcessingError(workerId: number, error: Error): void {
    this.stats.errorCount++;
    this.emit('error', error);
  }

  /**
   * 处理工作线程超时
   */
  private handleWorkerTimeout(workerId: number): void {
    this.stats.errorCount++;
    this.emit('error', new Error(`Worker ${workerId} processing timeout`));
  }

  /**
   * 更新统计信息
   */
  private updateStats(processingTime: number): void {
    this.stats.processedCount++;
    this.stats.avgProcessingTime = (
      this.stats.avgProcessingTime * (this.stats.processedCount - 1) +
      processingTime
    ) / this.stats.processedCount;
    this.stats.lastProcessedTimestamp = Date.now();

    const poolStats = this.threadPool.getStats();
    this.stats.activeWorkers = poolStats.activeWorkers;
    this.stats.workerStats = poolStats.workerStats;
  }

  /**
   * 添加数据点到处理队列
   */
  public async addDataPoint(dataPoint: MonitorDataPoint): Promise<void> {
    if (this.queue.length >= this.config.maxQueueSize) {
      logger.warn('ParallelProcessor', 'Queue size limit reached, dropping oldest data point');
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
    if (this.queue.length === 0) {
      return;
    }

    const batch = this.queue.splice(0, this.config.batchSize);
    this.stats.queueSize = this.queue.length;

    try {
      await this.threadPool.submitTask({
        type: 'processBatch',
        data: batch
      });
    } catch (error) {
      this.stats.errorCount++;
      this.emit('error', error);
      
      // 如果处理失败，将数据放回队列
      this.queue.unshift(...batch);
      this.stats.queueSize = this.queue.length;
    }
  }

  /**
   * 获取处理统计信息
   */
  public getStats(): ParallelProcessingStats {
    const poolStats = this.threadPool.getStats();
    return {
      ...this.stats,
      activeWorkers: poolStats.activeWorkers,
      workerStats: poolStats.workerStats,
      queueSize: this.queue.length
    };
  }

  /**
   * 停止处理器
   */
  public async stop(): Promise<void> {
    await this.threadPool.shutdown();
    this.queue = [];
    this.stats = this.initializeStats();
  }
} 