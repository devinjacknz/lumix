import { EventEmitter } from 'events';
import { logger } from './logger';
import { PerformanceMonitor, PerformanceMetrics } from './performance';
import { configManager } from '../config';
import { AlertManager, AlertType, AlertSeverity } from './alerts';
import os from 'os';

export interface OptimizationConfig {
  enabled: boolean;
  autoOptimize: boolean;
  optimizationInterval: number;
  thresholds: {
    memory: {
      heapUsage: number;
      gcFrequency: number;
    };
    cpu: {
      usage: number;
      loadAverage: number;
    };
    cache: {
      size: number;
      hitRate: number;
    };
    connection: {
      poolSize: number;
      waitTime: number;
    };
  };
  strategies: {
    memory: {
      gcThreshold: number;
      cacheCleanupThreshold: number;
    };
    cpu: {
      batchSize: number;
      workerCount: number;
    };
    cache: {
      maxSize: number;
      ttl: number;
    };
    connection: {
      minPool: number;
      maxPool: number;
    };
  };
}

export class PerformanceOptimizer extends EventEmitter {
  private static instance: PerformanceOptimizer;
  private config: OptimizationConfig;
  private performanceMonitor: PerformanceMonitor;
  private alertManager: AlertManager;
  private optimizationInterval?: NodeJS.Timeout;
  private lastOptimization: Record<string, number> = {};
  private optimizationHistory: Array<{
    timestamp: number;
    type: string;
    action: string;
    impact: {
      before: any;
      after: any;
    };
  }> = [];

  private constructor() {
    super();
    this.config = this.loadConfig();
    this.performanceMonitor = PerformanceMonitor.getInstance();
    this.alertManager = AlertManager.getInstance();
  }

  public static getInstance(): PerformanceOptimizer {
    if (!PerformanceOptimizer.instance) {
      PerformanceOptimizer.instance = new PerformanceOptimizer();
    }
    return PerformanceOptimizer.instance;
  }

  private loadConfig(): OptimizationConfig {
    return {
      enabled: true,
      autoOptimize: true,
      optimizationInterval: 5 * 60 * 1000, // 5分钟
      thresholds: {
        memory: {
          heapUsage: 80, // 80%
          gcFrequency: 10 // 每分钟10次
        },
        cpu: {
          usage: 70, // 70%
          loadAverage: 0.7 // 0.7
        },
        cache: {
          size: 80, // 80%
          hitRate: 50 // 50%
        },
        connection: {
          poolSize: 80, // 80%
          waitTime: 1000 // 1秒
        }
      },
      strategies: {
        memory: {
          gcThreshold: 75, // 75%
          cacheCleanupThreshold: 70 // 70%
        },
        cpu: {
          batchSize: 100,
          workerCount: 4
        },
        cache: {
          maxSize: 1000,
          ttl: 3600
        },
        connection: {
          minPool: 5,
          maxPool: 20
        }
      },
      ...configManager.getConfig('optimization')
    };
  }

  public async start(): Promise<void> {
    if (!this.config.enabled) {
      logger.info('Optimizer', 'Performance optimization is disabled');
      return;
    }

    try {
      if (this.config.autoOptimize) {
        this.optimizationInterval = setInterval(
          () => this.optimize(),
          this.config.optimizationInterval
        );
      }

      logger.info('Optimizer', 'Performance optimizer started');
    } catch (error) {
      logger.error('Optimizer', 'Failed to start performance optimizer', error);
      throw error;
    }
  }

  public async stop(): Promise<void> {
    if (this.optimizationInterval) {
      clearInterval(this.optimizationInterval);
    }
    logger.info('Optimizer', 'Performance optimizer stopped');
  }

  public async optimize(): Promise<void> {
    try {
      const metrics = this.performanceMonitor.getMetrics();
      if (metrics.length === 0) {
        return;
      }

      // 检查并优化内存使用
      await this.optimizeMemory(metrics);

      // 检查并优化 CPU 使用
      await this.optimizeCPU(metrics);

      // 检查并优化缓存
      await this.optimizeCache();

      // 检查并优化连接池
      await this.optimizeConnections();

      // 记录优化历史
      this.recordOptimization('system', 'complete-optimization', {
        metrics: this.performanceMonitor.getAverageMetrics()
      });

    } catch (error) {
      logger.error('Optimizer', 'Optimization failed', error);
      this.alertManager.createAlert({
        type: AlertType.OPTIMIZATION,
        severity: AlertSeverity.ERROR,
        message: 'Performance optimization failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private async optimizeMemory(metrics: PerformanceMetrics[]): Promise<void> {
    const lastMetric = metrics[metrics.length - 1];
    const memoryUsage = (lastMetric.memory.heapUsed / lastMetric.memory.heapTotal) * 100;

    if (memoryUsage > this.config.thresholds.memory.heapUsage) {
      logger.info('Optimizer', `High memory usage detected: ${memoryUsage.toFixed(2)}%`);

      const before = process.memoryUsage();

      // 强制 GC
      if ((global as any).gc && memoryUsage > this.config.strategies.memory.gcThreshold) {
        (global as any).gc();
      }

      // 清理缓存
      if (memoryUsage > this.config.strategies.memory.cacheCleanupThreshold) {
        await this.cleanupCache();
      }

      const after = process.memoryUsage();
      this.recordOptimization('memory', 'gc-and-cache-cleanup', { before, after });
    }
  }

  private async optimizeCPU(metrics: PerformanceMetrics[]): Promise<void> {
    const recentMetrics = metrics.slice(-5); // 最近5个指标
    const avgCpuUsage = recentMetrics.reduce((sum, m) => sum + m.cpu.total, 0) / recentMetrics.length;

    if (avgCpuUsage > this.config.thresholds.cpu.usage) {
      logger.info('Optimizer', `High CPU usage detected: ${avgCpuUsage.toFixed(2)}%`);

      const before = { cpuUsage: avgCpuUsage };

      // 调整批处理大小
      await this.adjustBatchSize();

      // 调整工作线程数
      await this.adjustWorkerCount();

      const after = { cpuUsage: this.performanceMonitor.getMetrics().slice(-1)[0].cpu.total };
      this.recordOptimization('cpu', 'batch-and-worker-adjustment', { before, after });
    }
  }

  private async optimizeCache(): Promise<void> {
    try {
      const cacheStats = await this.getCacheStats();
      const currentSize = cacheStats.size;
      const maxSize = this.config.strategies.cache.maxSize;
      
      if (currentSize > maxSize * 0.8) { // 80% 阈值
        logger.info('Optimizer', `Cache size (${currentSize}) exceeds threshold, cleaning up`);
        
        // 获取所有缓存条目
        const entries = await this.getCacheEntries();
        
        // 按访问频率和最后访问时间排序
        entries.sort((a, b) => {
          const scoreA = a.hits * Math.exp(-0.1 * (Date.now() - a.lastAccess) / 1000);
          const scoreB = b.hits * Math.exp(-0.1 * (Date.now() - b.lastAccess) / 1000);
          return scoreA - scoreB;
        });
        
        // 移除低分条目直到缓存大小降至阈值以下
        let removedCount = 0;
        while (currentSize > maxSize * 0.7 && entries.length > 0) { // 70% 目标
          const entry = entries.shift();
          if (entry) {
            await this.removeFromCache(entry.key);
            removedCount++;
          }
        }
        
        logger.info('Optimizer', `Removed ${removedCount} cache entries`);
      }
    } catch (error) {
      logger.error('Optimizer', 'Cache cleanup failed', error);
    }
  }

  private async optimizeConnections(): Promise<void> {
    try {
      const dbMetrics = await this.getDatabaseMetrics();
      const currentPoolSize = dbMetrics.poolSize;
      const waitTime = dbMetrics.waitTime;
      
      // 检查连接池使用情况
      if (waitTime > this.config.thresholds.connection.waitTime) {
        // 连接等待时间过长，增加连接池大小
        const newPoolSize = Math.min(
          this.config.strategies.connection.maxPool,
          Math.floor(currentPoolSize * 1.2)
        );
        
        if (newPoolSize > currentPoolSize) {
          await this.updateConnectionPool(newPoolSize);
          logger.info('Optimizer', `Increased connection pool size to ${newPoolSize}`);
        }
      } else if (waitTime < this.config.thresholds.connection.waitTime * 0.2) {
        // 连接等待时间很短，可以减少连接池大小
        const newPoolSize = Math.max(
          this.config.strategies.connection.minPool,
          Math.floor(currentPoolSize * 0.8)
        );
        
        if (newPoolSize < currentPoolSize) {
          await this.updateConnectionPool(newPoolSize);
          logger.info('Optimizer', `Decreased connection pool size to ${newPoolSize}`);
        }
      }
    } catch (error) {
      logger.error('Optimizer', 'Failed to optimize connections', error);
    }
  }

  private async cleanupCache(): Promise<void> {
    try {
      const cacheStats = await this.getCacheStats();
      const currentSize = cacheStats.size;
      const maxSize = this.config.strategies.cache.maxSize;
      
      if (currentSize > maxSize * 0.8) { // 80% 阈值
        logger.info('Optimizer', `Cache size (${currentSize}) exceeds threshold, cleaning up`);
        
        // 获取所有缓存条目
        const entries = await this.getCacheEntries();
        
        // 按访问频率和最后访问时间排序
        entries.sort((a, b) => {
          const scoreA = a.hits * Math.exp(-0.1 * (Date.now() - a.lastAccess) / 1000);
          const scoreB = b.hits * Math.exp(-0.1 * (Date.now() - b.lastAccess) / 1000);
          return scoreA - scoreB;
        });
        
        // 移除低分条目直到缓存大小降至阈值以下
        let removedCount = 0;
        while (currentSize > maxSize * 0.7 && entries.length > 0) { // 70% 目标
          const entry = entries.shift();
          if (entry) {
            await this.removeFromCache(entry.key);
            removedCount++;
          }
        }
        
        logger.info('Optimizer', `Removed ${removedCount} cache entries`);
      }
    } catch (error) {
      logger.error('Optimizer', 'Cache cleanup failed', error);
    }
  }

  private async adjustBatchSize(): Promise<void> {
    try {
      const metrics = this.performanceMonitor.getMetrics();
      const recentMetrics = metrics.slice(-5); // 最近5个指标
      
      // 计算平均 CPU 使用率
      const avgCpuUsage = recentMetrics.reduce((sum, m) => sum + m.cpu.total, 0) / recentMetrics.length;
      
      // 根据 CPU 使用率调整批处理大小
      let newBatchSize = this.config.strategies.cpu.batchSize;
      
      if (avgCpuUsage > this.config.thresholds.cpu.usage) {
        // CPU 使用率高，减小批处理大小
        newBatchSize = Math.max(10, Math.floor(newBatchSize * 0.8));
      } else if (avgCpuUsage < this.config.thresholds.cpu.usage * 0.5) {
        // CPU 使用率低，增加批处理大小
        newBatchSize = Math.min(1000, Math.floor(newBatchSize * 1.2));
      }
      
      if (newBatchSize !== this.config.strategies.cpu.batchSize) {
        this.config.strategies.cpu.batchSize = newBatchSize;
        logger.info('Optimizer', `Adjusted batch size to ${newBatchSize}`);
      }
    } catch (error) {
      logger.error('Optimizer', 'Failed to adjust batch size', error);
    }
  }

  private async adjustWorkerCount(): Promise<void> {
    try {
      const metrics = this.performanceMonitor.getMetrics();
      const recentMetrics = metrics.slice(-5);
      
      // 计算平均 CPU 使用率和负载
      const avgCpuUsage = recentMetrics.reduce((sum, m) => sum + m.cpu.total, 0) / recentMetrics.length;
      const loadAverage = os.loadavg()[0];
      
      // 获取 CPU 核心数
      const cpuCount = os.cpus().length;
      
      // 根据 CPU 使用率和负载调整工作线程数
      let newWorkerCount = this.config.strategies.cpu.workerCount;
      
      if (avgCpuUsage > this.config.thresholds.cpu.usage || loadAverage > cpuCount) {
        // 系统负载高，减少工作线程
        newWorkerCount = Math.max(1, Math.floor(newWorkerCount * 0.8));
      } else if (avgCpuUsage < this.config.thresholds.cpu.usage * 0.5 && loadAverage < cpuCount * 0.5) {
        // 系统负载低，增加工作线程
        newWorkerCount = Math.min(cpuCount * 2, Math.floor(newWorkerCount * 1.2));
      }
      
      if (newWorkerCount !== this.config.strategies.cpu.workerCount) {
        this.config.strategies.cpu.workerCount = newWorkerCount;
        await this.updateWorkerPool(newWorkerCount);
        logger.info('Optimizer', `Adjusted worker count to ${newWorkerCount}`);
      }
    } catch (error) {
      logger.error('Optimizer', 'Failed to adjust worker count', error);
    }
  }

  private async updateWorkerPool(newCount: number): Promise<void> {
    // 实现工作线程池更新逻辑
    // TODO: 根据实际的工作线程池实现来更新
  }

  private async updateConnectionPool(newSize: number): Promise<void> {
    // 实现连接池大小更新逻辑
    // TODO: 根据实际的数据库连接池实现来更新
  }

  private async getDatabaseMetrics(): Promise<{ poolSize: number; waitTime: number }> {
    // 实现数据库指标获取逻辑
    // TODO: 根据实际的数据库实现来获取指标
    return {
      poolSize: 10,
      waitTime: 0
    };
  }

  private async getCacheStats(): Promise<{ size: number; hits: number; misses: number }> {
    // 实现缓存统计信息获取逻辑
    // TODO: 根据实际的缓存实现来获取统计信息
    return {
      size: 0,
      hits: 0,
      misses: 0
    };
  }

  private async getCacheEntries(): Promise<Array<{ key: string; hits: number; lastAccess: number }>> {
    // 实现缓存条目获取逻辑
    // TODO: 根据实际的缓存实现来获取条目
    return [];
  }

  private async removeFromCache(key: string): Promise<void> {
    // 实现缓存条目移除逻辑
    // TODO: 根据实际的缓存实现来移除条目
  }

  private recordOptimization(
    type: string,
    action: string,
    impact: { before: any; after: any }
  ): void {
    this.optimizationHistory.push({
      timestamp: Date.now(),
      type,
      action,
      impact
    });

    // 限制历史记录大小
    if (this.optimizationHistory.length > 1000) {
      this.optimizationHistory = this.optimizationHistory.slice(-1000);
    }

    this.lastOptimization[`${type}:${action}`] = Date.now();
  }

  public getOptimizationHistory(): typeof this.optimizationHistory {
    return [...this.optimizationHistory];
  }

  public getLastOptimization(type: string, action: string): number {
    return this.lastOptimization[`${type}:${action}`] || 0;
  }
} 