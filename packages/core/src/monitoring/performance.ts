import { EventEmitter } from 'events';
import { logger } from './logger';
import { metricsService } from './metrics';
import { AlertManager, AlertType, AlertSeverity } from './alerts';
import { configManager } from '../config';

export interface PerformanceMetrics {
  timestamp: number;
  duration: number;
  memory: NodeJS.MemoryUsage;
  cpu: {
    user: number;
    system: number;
    total: number;
  };
  gc?: {
    collections: number;
    duration: number;
    type: string;
  };
}

export interface PerformanceConfig {
  enabled: boolean;
  sampleInterval: number;
  retentionPeriod: number;
  thresholds: {
    responseTime: number;
    cpuUsage: number;
    memoryUsage: number;
    gcPause: number;
  };
}

export class PerformanceMonitor extends EventEmitter {
  private static instance: PerformanceMonitor;
  private metrics: PerformanceMetrics[];
  private config: PerformanceConfig;
  private monitoringInterval?: NodeJS.Timeout;
  private alertManager: AlertManager;
  private startTime: number;
  private lastGC?: {
    collections: number;
    duration: number;
    type: string;
  };

  private constructor() {
    super();
    this.metrics = [];
    this.config = this.loadConfig();
    this.alertManager = AlertManager.getInstance();
    this.startTime = Date.now();
  }

  public static getInstance(): PerformanceMonitor {
    if (!PerformanceMonitor.instance) {
      PerformanceMonitor.instance = new PerformanceMonitor();
    }
    return PerformanceMonitor.instance;
  }

  private loadConfig(): PerformanceConfig {
    console.debug('Loading performance config...');
    console.debug('Config manager state:', { 
      configManager,
      hasGetConfig: configManager && typeof configManager.getConfig === 'function'
    });

    const defaultConfig = {
      thresholds: {
        cpu: 80, // 80% CPU usage
        memory: 85, // 85% memory usage
        latency: 1000, // 1 second
        gcPause: 100 // 100ms
      }
    };

    try {
      return {
        ...defaultConfig,
        ...(configManager?.getConfig?.('performance') || {})
      };
    } catch (error) {
      console.warn('Failed to load performance config:', error);
      return defaultConfig;
    }
  }

  public async start(): Promise<void> {
    if (!this.config.enabled) {
      logger.info('Performance', 'Performance monitoring is disabled');
      return;
    }

    try {
      // 启用 GC 钩子
      if ((global as any).gc) {
        this.enableGCHook();
      }

      // 启动监控循环
      this.monitoringInterval = setInterval(
        () => this.collectMetrics(),
        this.config.sampleInterval
      );

      logger.info('Performance', 'Performance monitoring started');
    } catch (error) {
      logger.error('Performance', 'Failed to start performance monitoring', error);
      throw error;
    }
  }

  public async stop(): Promise<void> {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }

    // 禁用 GC 钩子
    this.disableGCHook();

    logger.info('Performance', 'Performance monitoring stopped');
  }

  public getMetrics(timeRange?: { start: number; end: number }): PerformanceMetrics[] {
    if (!timeRange) {
      return [...this.metrics];
    }

    return this.metrics.filter(
      m => m.timestamp >= timeRange.start && m.timestamp <= timeRange.end
    );
  }

  public getAverageMetrics(timeRange?: { start: number; end: number }): {
    responseTime: number;
    cpuUsage: number;
    memoryUsage: number;
    gcPause?: number;
  } {
    const metrics = this.getMetrics(timeRange);
    if (metrics.length === 0) {
      return {
        responseTime: 0,
        cpuUsage: 0,
        memoryUsage: 0
      };
    }

    const sum = metrics.reduce(
      (acc, m) => ({
        responseTime: acc.responseTime + m.duration,
        cpuUsage: acc.cpuUsage + m.cpu.total,
        memoryUsage: acc.memoryUsage + (m.memory.heapUsed / m.memory.heapTotal) * 100,
        gcPause: acc.gcPause + (m.gc?.duration || 0)
      }),
      { responseTime: 0, cpuUsage: 0, memoryUsage: 0, gcPause: 0 }
    );

    const count = metrics.length;
    const gcCount = metrics.filter(m => m.gc).length;

    return {
      responseTime: sum.responseTime / count,
      cpuUsage: sum.cpuUsage / count,
      memoryUsage: sum.memoryUsage / count,
      ...(gcCount > 0 ? { gcPause: sum.gcPause / gcCount } : {})
    };
  }

  private async collectMetrics(): Promise<void> {
    try {
      const startTime = process.hrtime();

      // 收集基础指标
      const metrics: PerformanceMetrics = {
        timestamp: Date.now(),
        duration: 0,
        memory: process.memoryUsage(),
        cpu: this.getCPUUsage(),
        ...(this.lastGC ? { gc: this.lastGC } : {})
      };

      // 计算持续时间
      const [seconds, nanoseconds] = process.hrtime(startTime);
      metrics.duration = seconds * 1000 + nanoseconds / 1000000;

      // 存储指标
      this.metrics.push(metrics);

      // 清理旧指标
      this.cleanupOldMetrics();

      // 检查阈值
      this.checkThresholds(metrics);

      // 发送指标
      this.sendMetricsToService(metrics);

      // 重置 GC 指标
      this.lastGC = undefined;

    } catch (error) {
      logger.error('Performance', 'Failed to collect performance metrics', error);
    }
  }

  private getCPUUsage(): PerformanceMetrics['cpu'] {
    const usage = process.cpuUsage();
    const total = usage.user + usage.system;
    
    return {
      user: usage.user / 1000000, // 转换为秒
      system: usage.system / 1000000,
      total: total / 1000000
    };
  }

  private cleanupOldMetrics(): void {
    const cutoff = Date.now() - this.config.retentionPeriod;
    this.metrics = this.metrics.filter(m => m.timestamp >= cutoff);
  }

  private checkThresholds(metrics: PerformanceMetrics): void {
    // 检查响应时间
    if (metrics.duration > this.config.thresholds.responseTime) {
      this.alertManager.createAlert({
        type: AlertType.PERFORMANCE,
        severity: AlertSeverity.WARNING,
        message: 'High response time detected',
        details: `Response time: ${metrics.duration.toFixed(2)}ms`
      });
    }

    // 检查 CPU 使用率
    if (metrics.cpu.total > this.config.thresholds.cpuUsage) {
      this.alertManager.createAlert({
        type: AlertType.PERFORMANCE,
        severity: AlertSeverity.WARNING,
        message: 'High CPU usage detected',
        details: `CPU usage: ${metrics.cpu.total.toFixed(2)}%`
      });
    }

    // 检查内存使用率
    const memoryUsage = (metrics.memory.heapUsed / metrics.memory.heapTotal) * 100;
    if (memoryUsage > this.config.thresholds.memoryUsage) {
      this.alertManager.createAlert({
        type: AlertType.PERFORMANCE,
        severity: AlertSeverity.WARNING,
        message: 'High memory usage detected',
        details: `Memory usage: ${memoryUsage.toFixed(2)}%`
      });
    }

    // 检查 GC 暂停时间
    if (metrics.gc && metrics.gc.duration > this.config.thresholds.gcPause) {
      this.alertManager.createAlert({
        type: AlertType.PERFORMANCE,
        severity: AlertSeverity.WARNING,
        message: 'Long GC pause detected',
        details: `GC pause: ${metrics.gc.duration.toFixed(2)}ms`
      });
    }
  }

  private sendMetricsToService(metrics: PerformanceMetrics): void {
    // 响应时间指标
    metricsService.recordMetric('performance.response_time', metrics.duration);

    // CPU 指标
    metricsService.recordMetric('performance.cpu.user', metrics.cpu.user);
    metricsService.recordMetric('performance.cpu.system', metrics.cpu.system);
    metricsService.recordMetric('performance.cpu.total', metrics.cpu.total);

    // 内存指标
    metricsService.recordMetric('performance.memory.heapUsed', metrics.memory.heapUsed);
    metricsService.recordMetric('performance.memory.heapTotal', metrics.memory.heapTotal);
    metricsService.recordMetric('performance.memory.rss', metrics.memory.rss);
    metricsService.recordMetric(
      'performance.memory.usage',
      (metrics.memory.heapUsed / metrics.memory.heapTotal) * 100
    );

    // GC 指标
    if (metrics.gc) {
      metricsService.recordMetric('performance.gc.collections', metrics.gc.collections);
      metricsService.recordMetric('performance.gc.duration', metrics.gc.duration);
    }
  }

  private enableGCHook(): void {
    const gc = (global as any).gc;
    if (typeof gc === 'function') {
      // 包装原始 gc 函数
      const originalGc = gc;
      (global as any).gc = () => {
        const startTime = process.hrtime();
        
        // 调用原始 gc
        originalGc();
        
        // 计算持续时间
        const [seconds, nanoseconds] = process.hrtime(startTime);
        const duration = seconds * 1000 + nanoseconds / 1000000;

        // 更新 GC 统计
        this.lastGC = {
          collections: (this.lastGC?.collections || 0) + 1,
          duration,
          type: 'manual'
        };
      };
    }
  }

  private disableGCHook(): void {
    if (typeof (global as any).gc === 'function') {
      delete (global as any).gc;
    }
  }
} 