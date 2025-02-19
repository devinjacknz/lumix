import { MonitorDataPoint } from './realtime';
import { gzip, ungzip } from 'node-gzip';
import { logger } from '../utils/logger';

/**
 * 压缩配置
 */
export interface CompressionConfig {
  enabled?: boolean;
  level?: number;  // 压缩级别 (1-9)
  threshold?: number;  // 压缩阈值（字节）
  algorithm?: 'gzip';  // 压缩算法
}

/**
 * 压缩统计
 */
export interface CompressionStats {
  originalSize: number;
  compressedSize: number;
  compressionRatio: number;
  processedCount: number;
  totalSaved: number;
  avgCompressionTime: number;
}

/**
 * 数据压缩器
 */
export class DataCompressor {
  private config: Required<CompressionConfig>;
  private stats: CompressionStats;

  constructor(config: CompressionConfig = {}) {
    this.config = {
      enabled: config.enabled ?? true,
      level: config.level || 6,
      threshold: config.threshold || 1024,  // 1KB
      algorithm: config.algorithm || 'gzip'
    };

    this.stats = {
      originalSize: 0,
      compressedSize: 0,
      compressionRatio: 0,
      processedCount: 0,
      totalSaved: 0,
      avgCompressionTime: 0
    };
  }

  /**
   * 压缩数据点
   */
  public async compress(dataPoints: MonitorDataPoint[]): Promise<Buffer> {
    if (!this.config.enabled || dataPoints.length === 0) {
      return Buffer.from(JSON.stringify(dataPoints));
    }

    const startTime = Date.now();
    try {
      // 序列化数据
      const serialized = JSON.stringify(this.optimizeDataPoints(dataPoints));
      const originalSize = Buffer.byteLength(serialized);

      // 检查是否达到压缩阈值
      if (originalSize < this.config.threshold) {
        return Buffer.from(serialized);
      }

      // 压缩数据
      const compressed = await gzip(serialized, { level: this.config.level });
      const compressedSize = compressed.length;

      // 更新统计信息
      this.updateStats(originalSize, compressedSize, startTime);

      return compressed;
    } catch (error) {
      logger.error('DataCompressor', 'Compression failed', { error });
      throw error;
    }
  }

  /**
   * 解压数据点
   */
  public async decompress(data: Buffer): Promise<MonitorDataPoint[]> {
    if (!this.config.enabled) {
      return JSON.parse(data.toString());
    }

    try {
      // 尝试解压
      const decompressed = await ungzip(data);
      return JSON.parse(decompressed.toString());
    } catch (error) {
      // 如果解压失败，尝试直接解析
      try {
        return JSON.parse(data.toString());
      } catch (parseError) {
        logger.error('DataCompressor', 'Decompression failed', { error });
        throw error;
      }
    }
  }

  /**
   * 优化数据点
   */
  private optimizeDataPoints(dataPoints: MonitorDataPoint[]): MonitorDataPoint[] {
    return dataPoints.map(point => ({
      ...point,
      metrics: this.optimizeMetrics(point.metrics),
      resources: this.optimizeResources(point.resources),
      performance: this.optimizePerformance(point.performance)
    }));
  }

  /**
   * 优化指标数据
   */
  private optimizeMetrics(metrics: Record<string, number>): Record<string, number> {
    const optimized: Record<string, number> = {};
    for (const [key, value] of Object.entries(metrics)) {
      // 保留两位小数
      optimized[key] = Number(value.toFixed(2));
    }
    return optimized;
  }

  /**
   * 优化资源数据
   */
  private optimizeResources(resources: MonitorDataPoint['resources']): MonitorDataPoint['resources'] {
    return {
      cpu: Number(resources.cpu.toFixed(1)),
      memory: Number(resources.memory.toFixed(1)),
      disk: Number(resources.disk.toFixed(1)),
      network: Number(resources.network.toFixed(1))
    };
  }

  /**
   * 优化性能数据
   */
  private optimizePerformance(performance: MonitorDataPoint['performance']): MonitorDataPoint['performance'] {
    return {
      activeTraces: performance.activeTraces,
      activeSpans: performance.activeSpans,
      errorRate: Number(performance.errorRate.toFixed(4)),
      avgDuration: Number(performance.avgDuration.toFixed(1))
    };
  }

  /**
   * 更新压缩统计信息
   */
  private updateStats(originalSize: number, compressedSize: number, startTime: number): void {
    const compressionTime = Date.now() - startTime;
    const saved = originalSize - compressedSize;

    this.stats.originalSize += originalSize;
    this.stats.compressedSize += compressedSize;
    this.stats.processedCount++;
    this.stats.totalSaved += saved;
    this.stats.compressionRatio = (this.stats.compressedSize / this.stats.originalSize) * 100;
    this.stats.avgCompressionTime = (
      this.stats.avgCompressionTime * (this.stats.processedCount - 1) +
      compressionTime
    ) / this.stats.processedCount;
  }

  /**
   * 获取压缩统计信息
   */
  public getStats(): CompressionStats {
    return { ...this.stats };
  }
} 