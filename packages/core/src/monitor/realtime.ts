import { EventEmitter } from 'events';
import { BaseError } from '../types/errors';
import { MetricsCollector } from '../metrics/collector';
import { ResourceLimiter } from '../resource/limiter';
import { PerformanceTracer } from '../profiler/tracer';
import { StreamProcessor, StreamProcessorConfig } from './stream-processor';

/**
 * 监控器错误
 */
export class MonitorError extends BaseError {
  constructor(message: string) {
    super(message);
    this.name = 'MonitorError';
  }
}

/**
 * 监控配置
 */
export interface MonitorConfig {
  // 基础配置
  enabled?: boolean;
  interval?: number;
  maxDataPoints?: number;

  // 组件配置
  metricsCollector?: MetricsCollector;
  resourceLimiter?: ResourceLimiter;
  performanceTracer?: PerformanceTracer;

  // 存储配置
  storageLimit?: number;
  retentionPeriod?: number;

  // 聚合配置
  aggregationWindow?: number;
  aggregationFunctions?: Array<'avg' | 'min' | 'max' | 'sum' | 'count'>;

  // 流处理器配置
  streamProcessor?: StreamProcessorConfig;
}

/**
 * 监控数据点
 */
export interface MonitorDataPoint {
  timestamp: number;
  metrics: Record<string, number>;
  resources: {
    cpu: number;
    memory: number;
    disk: number;
    network: number;
  };
  performance: {
    activeTraces: number;
    activeSpans: number;
    errorRate: number;
    avgDuration: number;
  };
  metadata?: Record<string, any>;
}

/**
 * 监控状态
 */
export interface MonitorStatus {
  healthy: boolean;
  message?: string;
  lastUpdate: number;
  uptime: number;
  components: Record<string, {
    status: 'up' | 'down' | 'degraded';
    message?: string;
    lastCheck: number;
  }>;
}

/**
 * 实时监控器
 */
export class RealTimeMonitor extends EventEmitter {
  private config: Required<MonitorConfig>;
  private metricsCollector?: MetricsCollector;
  private resourceLimiter?: ResourceLimiter;
  private performanceTracer?: PerformanceTracer;
  private dataPoints: MonitorDataPoint[];
  private status: MonitorStatus;
  private startTime: number;
  private interval?: NodeJS.Timeout;
  private streamProcessor?: StreamProcessor;

  constructor(config: MonitorConfig = {}) {
    super();
    this.config = {
      enabled: config.enabled ?? true,
      interval: config.interval || 1000, // 1秒
      maxDataPoints: config.maxDataPoints || 3600, // 1小时的数据点
      metricsCollector: config.metricsCollector,
      resourceLimiter: config.resourceLimiter,
      performanceTracer: config.performanceTracer,
      storageLimit: config.storageLimit || 100 * 1024 * 1024, // 100MB
      retentionPeriod: config.retentionPeriod || 24 * 60 * 60 * 1000, // 24小时
      aggregationWindow: config.aggregationWindow || 60000, // 1分钟
      aggregationFunctions: config.aggregationFunctions || ['avg', 'min', 'max'],
      streamProcessor: config.streamProcessor || {}
    };

    this.dataPoints = [];
    this.startTime = Date.now();
    this.status = this.initializeStatus();

    // 初始化流处理器
    this.initializeStreamProcessor();

    if (this.config.enabled) {
      this.start();
    }
  }

  /**
   * 初始化状态
   */
  private initializeStatus(): MonitorStatus {
    return {
      healthy: true,
      lastUpdate: Date.now(),
      uptime: 0,
      components: {
        metrics: {
          status: 'up',
          lastCheck: Date.now()
        },
        resources: {
          status: 'up',
          lastCheck: Date.now()
        },
        performance: {
          status: 'up',
          lastCheck: Date.now()
        },
        processor: {
          status: 'up',
          lastCheck: Date.now()
        }
      }
    };
  }

  /**
   * 初始化流处理器
   */
  private initializeStreamProcessor(): void {
    this.streamProcessor = new StreamProcessor(this.config.streamProcessor);

    // 处理批次数据
    this.streamProcessor.on('batch', (batch: MonitorDataPoint[]) => {
      // 更新数据点
      this.updateDataPoints(batch);
      // 发送数据更新事件
      this.emit('data', batch);
    });

    // 处理错误
    this.streamProcessor.on('error', (error: Error) => {
      this.updateComponentStatus('processor', 'degraded', String(error));
      this.emit('error', error);
    });

    // 处理统计信息
    this.streamProcessor.on('processed', (stats) => {
      this.updateComponentStatus('processor', 'up');
      this.emit('stats', stats);
    });
  }

  /**
   * 更新数据点
   */
  private updateDataPoints(batch: MonitorDataPoint[]): void {
    this.dataPoints.push(...batch);

    // 保持数据点数量在限制内
    while (this.dataPoints.length > this.config.maxDataPoints) {
      this.dataPoints.shift();
    }

    // 清理过期数据
    const cutoffTime = Date.now() - this.config.retentionPeriod;
    this.dataPoints = this.dataPoints.filter(point => point.timestamp >= cutoffTime);
  }

  /**
   * 启动监控
   */
  private start(): void {
    this.interval = setInterval(async () => {
      try {
        await this.collect();
        this.updateStatus('healthy');
      } catch (error) {
        this.updateStatus('degraded', error instanceof Error ? error.message : String(error));
        this.emit('error', error);
      }
    }, this.config.interval);
  }

  /**
   * 收集数据
   */
  async collect(): Promise<MonitorDataPoint> {
    const timestamp = Date.now();
    const dataPoint: MonitorDataPoint = {
      timestamp,
      metrics: await this.collectMetrics(),
      resources: await this.collectResources(),
      performance: await this.collectPerformance()
    };

    // 使用流处理器处理数据
    if (this.streamProcessor) {
      await this.streamProcessor.addDataPoint(dataPoint);
    } else {
      this.updateDataPoints([dataPoint]);
      this.emit('data', dataPoint);
    }

    return dataPoint;
  }

  /**
   * 收集指标
   */
  private async collectMetrics(): Promise<Record<string, number>> {
    const metrics: Record<string, number> = {};

    if (this.metricsCollector) {
      try {
        const collector = this.metricsCollector;
        const allMetrics = collector.getAllMetrics();

        for (const [name, metric] of allMetrics.entries()) {
          if (metric.values.length > 0) {
            const lastValue = metric.values[metric.values.length - 1];
            metrics[name] = lastValue.value;
          }
        }

        this.updateComponentStatus('metrics', 'up');
      } catch (error) {
        this.updateComponentStatus('metrics', 'degraded', String(error));
        throw error;
      }
    }

    return metrics;
  }

  /**
   * 收集资源使用情况
   */
  private async collectResources(): Promise<MonitorDataPoint['resources']> {
    const resources = {
      cpu: 0,
      memory: 0,
      disk: 0,
      network: 0
    };

    if (this.resourceLimiter) {
      try {
        const limiter = this.resourceLimiter;
        const stats = await limiter.getStats();

        resources.cpu = stats.cpu.usage;
        resources.memory = stats.memory.heapUsed / stats.memory.heapTotal;
        resources.disk = stats.disk.used / stats.disk.total;
        resources.network = (stats.network.connections / 1000) * 100; // 假设最大连接数为 1000

        this.updateComponentStatus('resources', 'up');
      } catch (error) {
        this.updateComponentStatus('resources', 'degraded', String(error));
        throw error;
      }
    }

    return resources;
  }

  /**
   * 收集性能数据
   */
  private async collectPerformance(): Promise<MonitorDataPoint['performance']> {
    const performance = {
      activeTraces: 0,
      activeSpans: 0,
      errorRate: 0,
      avgDuration: 0
    };

    if (this.performanceTracer) {
      try {
        const tracer = this.performanceTracer;
        const traces = tracer.getAllTraces();
        const activeTraces = traces.filter(t => t.status === 'active');
        const recentTraces = traces.filter(t =>
          t.startTime > Date.now() - this.config.aggregationWindow
        );

        performance.activeTraces = activeTraces.length;
        performance.activeSpans = activeTraces.reduce(
          (sum, t) => sum + t.spans.length,
          0
        );
        performance.errorRate = recentTraces.length > 0
          ? recentTraces.filter(t => t.status === 'error').length / recentTraces.length
          : 0;
        performance.avgDuration = recentTraces.length > 0
          ? recentTraces.reduce((sum, t) => sum + (t.duration || 0), 0) / recentTraces.length
          : 0;

        this.updateComponentStatus('performance', 'up');
      } catch (error) {
        this.updateComponentStatus('performance', 'degraded', String(error));
        throw error;
      }
    }

    return performance;
  }

  /**
   * 更新状态
   */
  private updateStatus(status: 'healthy' | 'degraded', message?: string): void {
    this.status.healthy = status === 'healthy';
    this.status.message = message;
    this.status.lastUpdate = Date.now();
    this.status.uptime = Date.now() - this.startTime;

    this.emit('status', this.status);
  }

  /**
   * 更新组件状态
   */
  private updateComponentStatus(
    component: keyof MonitorStatus['components'],
    status: 'up' | 'down' | 'degraded',
    message?: string
  ): void {
    this.status.components[component] = {
      status,
      message,
      lastCheck: Date.now()
    };
  }

  /**
   * 获取数据点
   */
  getDataPoints(
    startTime?: number,
    endTime?: number
  ): MonitorDataPoint[] {
    let points = this.dataPoints;

    if (startTime) {
      points = points.filter(p => p.timestamp >= startTime);
    }

    if (endTime) {
      points = points.filter(p => p.timestamp <= endTime);
    }

    return points;
  }

  /**
   * 获取聚合数据
   */
  getAggregatedData(
    startTime: number,
    endTime: number,
    windowSize: number = this.config.aggregationWindow
  ): Array<{
    timestamp: number;
    data: Record<string, Record<string, number>>;
  }> {
    const points = this.getDataPoints(startTime, endTime);
    const windows: Record<number, MonitorDataPoint[]> = {};

    // 按时间窗口分组
    for (const point of points) {
      const windowStart = Math.floor(point.timestamp / windowSize) * windowSize;
      windows[windowStart] = windows[windowStart] || [];
      windows[windowStart].push(point);
    }

    // 聚合每个窗口的数据
    return Object.entries(windows).map(([timestamp, windowPoints]) => ({
      timestamp: Number(timestamp),
      data: this.aggregatePoints(windowPoints)
    }));
  }

  /**
   * 聚合数据点
   */
  private aggregatePoints(
    points: MonitorDataPoint[]
  ): Record<string, Record<string, number>> {
    const result: Record<string, Record<string, number>> = {};

    // 聚合指标
    result.metrics = this.aggregateValues(
      points.map(p => p.metrics)
    );

    // 聚合资源
    result.resources = this.aggregateValues(
      points.map(p => p.resources)
    );

    // 聚合性能
    result.performance = this.aggregateValues(
      points.map(p => p.performance)
    );

    return result;
  }

  /**
   * 聚合值
   */
  private aggregateValues(
    values: Record<string, number>[]
  ): Record<string, number> {
    const result: Record<string, number> = {};
    const keys = new Set(values.flatMap(v => Object.keys(v)));

    for (const key of keys) {
      const numbers = values
        .map(v => v[key])
        .filter(n => typeof n === 'number');

      if (numbers.length > 0) {
        for (const fn of this.config.aggregationFunctions) {
          switch (fn) {
            case 'avg':
              result[`${key}_avg`] = numbers.reduce((a, b) => a + b, 0) / numbers.length;
              break;
            case 'min':
              result[`${key}_min`] = Math.min(...numbers);
              break;
            case 'max':
              result[`${key}_max`] = Math.max(...numbers);
              break;
            case 'sum':
              result[`${key}_sum`] = numbers.reduce((a, b) => a + b, 0);
              break;
            case 'count':
              result[`${key}_count`] = numbers.length;
              break;
          }
        }
      }
    }

    return result;
  }

  /**
   * 获取状态
   */
  getStatus(): MonitorStatus {
    return this.status;
  }

  /**
   * 获取处理器统计信息
   */
  getProcessorStats() {
    return this.streamProcessor?.getStats();
  }

  /**
   * 停止监控
   */
  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = undefined;
    }

    if (this.streamProcessor) {
      this.streamProcessor.stop();
    }

    this.status.healthy = false;
    this.emit('stop');
  }
}