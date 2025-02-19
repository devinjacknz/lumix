import { EventEmitter } from 'events';
import { BaseError } from '../types/errors';
import { ResourceLimiter, ResourceType } from '../resource/limiter';

/**
 * GC 优化器错误
 */
export class GCOptimizerError extends BaseError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'GCOptimizerError';
  }
}

/**
 * GC 策略
 */
export enum GCStrategy {
  AGGRESSIVE = 'aggressive',
  BALANCED = 'balanced',
  CONSERVATIVE = 'conservative',
  ADAPTIVE = 'adaptive'
}

/**
 * GC 优化器配置
 */
export interface GCOptimizerConfig {
  // 策略配置
  strategy?: GCStrategy;
  minHeapSize?: number;
  maxHeapSize?: number;
  heapGrowthRate?: number;

  // 触发配置
  memoryThreshold?: number;
  timeThreshold?: number;
  allocationThreshold?: number;

  // 优化配置
  compactionThreshold?: number;
  fragmentationThreshold?: number;
  generationalThreshold?: number;

  // 监控配置
  monitoringEnabled?: boolean;
  monitoringInterval?: number;
  alertThreshold?: number;
}

/**
 * GC 统计
 */
export interface GCStats {
  strategy: GCStrategy;
  heapSize: number;
  heapUsed: number;
  collections: number;
  lastCollection: number;
  avgCollectionTime: number;
  compactions: number;
  fragmentationRatio: number;
  promotedObjects: number;
  timestamp: number;
}

/**
 * GC 优化器
 */
export class GCOptimizer extends EventEmitter {
  private config: Required<GCOptimizerConfig>;
  private resourceLimiter: ResourceLimiter;
  private monitoringInterval?: NodeJS.Timer;
  private lastCollection: number;
  private collectionTimes: number[];
  private stats: GCStats;

  constructor(
    resourceLimiter: ResourceLimiter,
    config: GCOptimizerConfig = {}
  ) {
    super();
    this.resourceLimiter = resourceLimiter;
    this.config = {
      strategy: config.strategy || GCStrategy.ADAPTIVE,
      minHeapSize: config.minHeapSize || 16 * 1024 * 1024, // 16MB
      maxHeapSize: config.maxHeapSize || 1024 * 1024 * 1024, // 1GB
      heapGrowthRate: config.heapGrowthRate || 1.5,

      memoryThreshold: config.memoryThreshold || 0.8,
      timeThreshold: config.timeThreshold || 60000, // 1分钟
      allocationThreshold: config.allocationThreshold || 1000,

      compactionThreshold: config.compactionThreshold || 0.5,
      fragmentationThreshold: config.fragmentationThreshold || 0.3,
      generationalThreshold: config.generationalThreshold || 3,

      monitoringEnabled: config.monitoringEnabled || false,
      monitoringInterval: config.monitoringInterval || 5000,
      alertThreshold: config.alertThreshold || 0.9
    };

    this.lastCollection = 0;
    this.collectionTimes = [];
    this.stats = this.initializeStats();

    if (this.config.monitoringEnabled) {
      this.startMonitoring();
    }

    // 添加 V8 GC 钩子
    this.setupGCHooks();
  }

  /**
   * 初始化统计信息
   */
  private initializeStats(): GCStats {
    const memUsage = process.memoryUsage();
    return {
      strategy: this.config.strategy,
      heapSize: memUsage.heapTotal,
      heapUsed: memUsage.heapUsed,
      collections: 0,
      lastCollection: 0,
      avgCollectionTime: 0,
      compactions: 0,
      fragmentationRatio: 0,
      promotedObjects: 0,
      timestamp: Date.now()
    };
  }

  /**
   * 设置 GC 钩子
   */
  private setupGCHooks(): void {
    // 注意：这需要使用 --expose-gc 标志启动 Node.js
    if (global.gc) {
      const originalGc = global.gc;
      (global as any).gc = () => {
        const startTime = process.hrtime();
        originalGc();
        const [seconds, nanoseconds] = process.hrtime(startTime);
        const duration = seconds * 1000 + nanoseconds / 1000000;
        this.handleGCComplete(duration);
      };
    }
  }

  /**
   * 处理 GC 完成
   */
  private handleGCComplete(duration: number): void {
    this.stats.collections++;
    this.stats.lastCollection = Date.now();
    this.collectionTimes.push(duration);

    // 保持最近 100 次收集的时间
    if (this.collectionTimes.length > 100) {
      this.collectionTimes.shift();
    }

    this.stats.avgCollectionTime = this.collectionTimes.reduce((a, b) => a + b, 0) / this.collectionTimes.length;

    this.updateStats();
    this.emit('gcComplete', {
      duration,
      stats: this.stats
    });
  }

  /**
   * 更新统计信息
   */
  private updateStats(): void {
    const memUsage = process.memoryUsage();
    this.stats.heapSize = memUsage.heapTotal;
    this.stats.heapUsed = memUsage.heapUsed;
    this.stats.fragmentationRatio = 1 - (memUsage.heapUsed / memUsage.heapTotal);
    this.stats.timestamp = Date.now();
  }

  /**
   * 检查是否需要 GC
   */
  private shouldCollect(): boolean {
    const memUsage = process.memoryUsage();
    const now = Date.now();

    // 检查内存使用阈值
    if (memUsage.heapUsed / memUsage.heapTotal > this.config.memoryThreshold) {
      return true;
    }

    // 检查时间阈值
    if (now - this.lastCollection > this.config.timeThreshold) {
      return true;
    }

    // 检查碎片化阈值
    if (this.stats.fragmentationRatio > this.config.fragmentationThreshold) {
      return true;
    }

    return false;
  }

  /**
   * 执行 GC
   */
  async collect(force: boolean = false): Promise<void> {
    if (!force && !this.shouldCollect()) {
      return;
    }

    try {
      // 请求内存资源
      await this.resourceLimiter.allocate(
        ResourceType.MEMORY,
        process.memoryUsage().heapUsed
      );

      // 执行 GC
      if (global.gc) {
        global.gc();
      }

      // 更新最后收集时间
      this.lastCollection = Date.now();
    } catch (error) {
      throw new GCOptimizerError('Failed to perform garbage collection', {
        cause: error
      });
    } finally {
      // 释放内存资源
      this.resourceLimiter.release(
        ResourceType.MEMORY,
        process.memoryUsage().heapUsed
      );
    }
  }

  /**
   * 强制执行完整 GC
   */
  async forceCollect(): Promise<void> {
    await this.collect(true);
  }

  /**
   * 优化堆内存
   */
  async optimizeHeap(): Promise<void> {
    const memUsage = process.memoryUsage();

    // 检查是否需要压缩
    if (this.stats.fragmentationRatio > this.config.compactionThreshold) {
      this.stats.compactions++;
      await this.forceCollect();
    }

    // 调整堆大小
    const targetHeapSize = Math.min(
      Math.max(
        this.config.minHeapSize,
        memUsage.heapUsed * this.config.heapGrowthRate
      ),
      this.config.maxHeapSize
    );

    // 注意：Node.js 不直接支持设置堆大小
    // 这里可以通过环境变量或启动参数来实现
    this.emit('heapOptimized', {
      oldSize: memUsage.heapTotal,
      newSize: targetHeapSize,
      fragmentation: this.stats.fragmentationRatio
    });
  }

  /**
   * 启动监控
   */
  private startMonitoring(): void {
    this.monitoringInterval = setInterval(async () => {
      this.updateStats();
      this.emit('stats', this.stats);

      // 检查是否需要优化
      if (this.shouldCollect()) {
        await this.optimizeHeap();
      }

      // 检查告警阈值
      if (this.stats.heapUsed / this.stats.heapSize > this.config.alertThreshold) {
        this.emit('memoryAlert', {
          usage: this.stats.heapUsed / this.stats.heapSize,
          threshold: this.config.alertThreshold
        });
      }
    }, this.config.monitoringInterval);
  }

  /**
   * 停止监控
   */
  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }
  }

  /**
   * 获取统计信息
   */
  getStats(): GCStats {
    this.updateStats();
    return this.stats;
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<GCOptimizerConfig>): void {
    this.config = {
      ...this.config,
      ...config
    };
  }

  /**
   * 关闭优化器
   */
  close(): void {
    this.stopMonitoring();
    this.emit('closed');
  }
} 