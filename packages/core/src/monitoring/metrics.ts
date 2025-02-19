import { MetricValue, MetricsCollector, ChainMetrics, SystemMetrics } from './types';
import { ChainType } from '../config/types';
import { Logger } from './logger';

export interface Metric {
  name: string;
  value: number;
  timestamp: number;
  labels?: Record<string, string>;
  type: MetricType;
}

export enum MetricType {
  COUNTER = 'counter',
  GAUGE = 'gauge',
  HISTOGRAM = 'histogram'
}

export interface MetricConfig {
  name: string;
  type: MetricType;
  description?: string;
  labels?: string[];
}

export interface HistogramBucket {
  le: number;
  count: number;
}

export interface HistogramMetric extends Metric {
  type: MetricType.HISTOGRAM;
  buckets: HistogramBucket[];
  sum: number;
  count: number;
}

export interface MetricOptions {
  labels?: Record<string, string>;
}

export class MetricsService implements MetricsCollector {
  private static instance: MetricsService;
  private metrics: Map<string, MetricValue[]>;
  private readonly logger: Logger;
  private readonly retentionPeriod: number = 24 * 60 * 60 * 1000; // 24小时

  private constructor() {
    this.metrics = new Map();
    this.logger = Logger.getInstance();
  }

  public static getInstance(): MetricsService {
    if (!MetricsService.instance) {
      MetricsService.instance = new MetricsService();
    }
    return MetricsService.instance;
  }

  public recordMetric(name: string, value: number, labels?: Record<string, string>): void {
    const metricValue: MetricValue = {
      timestamp: new Date(),
      value,
      labels
    };

    if (!this.metrics.has(name)) {
      this.metrics.set(name, []);
    }

    const metricArray = this.metrics.get(name)!;
    metricArray.push(metricValue);

    // 清理过期数据
    this.cleanupOldMetrics(name);
  }

  private cleanupOldMetrics(name: string): void {
    const cutoffTime = new Date(Date.now() - this.retentionPeriod);
    const metricArray = this.metrics.get(name)!;
    const newMetrics = metricArray.filter(m => m.timestamp > cutoffTime);
    this.metrics.set(name, newMetrics);
  }

  public async getMetrics(): Promise<Record<string, MetricValue[]>> {
    const result: Record<string, MetricValue[]> = {};
    for (const [name, values] of this.metrics.entries()) {
      result[name] = [...values];
    }
    return result;
  }

  public recordChainMetrics(metrics: ChainMetrics): void {
    const { chain, blockHeight, transactionCount, gasPrice, timestamp } = metrics;
    
    this.recordMetric(`${chain}_block_height`, blockHeight, { chain });
    this.recordMetric(`${chain}_transaction_count`, transactionCount, { chain });
    
    if (gasPrice) {
      this.recordMetric(`${chain}_gas_price`, parseFloat(gasPrice), { chain });
    }

    this.logger.info('Metrics', `Recorded chain metrics for ${chain}`, {
      blockHeight,
      transactionCount,
      gasPrice
    });
  }

  public recordSystemMetrics(metrics: SystemMetrics): void {
    const { cpuUsage, memoryUsage, activeConnections, timestamp } = metrics;

    this.recordMetric('system_cpu_usage', cpuUsage);
    this.recordMetric('system_memory_usage', memoryUsage);
    this.recordMetric('system_active_connections', activeConnections);

    // 检查是否超过阈值
    if (cpuUsage > 80) {
      this.logger.warn('Metrics', 'High CPU usage detected', { cpuUsage });
    }
    if (memoryUsage > 80) {
      this.logger.warn('Metrics', 'High memory usage detected', { memoryUsage });
    }
  }

  public getChainMetrics(chain: ChainType, timeRange?: { start: Date; end: Date }): MetricValue[] {
    const metrics: MetricValue[] = [];
    const prefixes = [`${chain}_block_height`, `${chain}_transaction_count`, `${chain}_gas_price`];

    for (const prefix of prefixes) {
      const values = this.metrics.get(prefix) || [];
      if (timeRange) {
        metrics.push(...values.filter(m => 
          m.timestamp >= timeRange.start && m.timestamp <= timeRange.end
        ));
      } else {
        metrics.push(...values);
      }
    }

    return metrics;
  }

  public getSystemMetrics(timeRange?: { start: Date; end: Date }): SystemMetrics[] {
    const result: SystemMetrics[] = [];
    const timestamps = new Set<number>();

    // 收集所有时间戳
    ['system_cpu_usage', 'system_memory_usage', 'system_active_connections'].forEach(metric => {
      const values = this.metrics.get(metric) || [];
      values.forEach(v => timestamps.add(v.timestamp.getTime()));
    });

    // 按时间戳组织数据
    Array.from(timestamps).sort().forEach(ts => {
      const timestamp = new Date(ts);
      if (timeRange && (timestamp < timeRange.start || timestamp > timeRange.end)) {
        return;
      }

      const cpuMetric = this.findMetricValue('system_cpu_usage', timestamp);
      const memoryMetric = this.findMetricValue('system_memory_usage', timestamp);
      const connectionsMetric = this.findMetricValue('system_active_connections', timestamp);

      if (cpuMetric && memoryMetric && connectionsMetric) {
        result.push({
          timestamp,
          cpuUsage: cpuMetric.value,
          memoryUsage: memoryMetric.value,
          activeConnections: connectionsMetric.value
        });
      }
    });

    return result;
  }

  private findMetricValue(name: string, timestamp: Date): MetricValue | undefined {
    const values = this.metrics.get(name) || [];
    return values.find(v => v.timestamp.getTime() === timestamp.getTime());
  }
}

export class PerformanceMonitor {
  private static collector = MetricsService.getInstance();

  static recordDuration(name: string, startTime: number, labels?: Record<string, string>): void {
    const duration = Date.now() - startTime;
    MetricsService.getInstance().recordMetric(`${name}_duration_ms`, duration, { labels });
  }

  static recordValue(name: string, value: number, labels?: Record<string, string>): void {
    MetricsService.getInstance().recordMetric(name, value, { labels });
  }

  static async measureAsyncOperation<T>(
    name: string,
    operation: () => Promise<T>,
    labels?: Record<string, string>
  ): Promise<T> {
    const startTime = Date.now();
    try {
      const result = await operation();
      this.recordDuration(name, startTime, labels);
      return result;
    } catch (error) {
      this.recordDuration(`${name}_error`, startTime, labels);
      throw error;
    }
  }
}

// Performance monitoring decorator
export function monitor(name: string, labels?: Record<string, string>) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      return PerformanceMonitor.measureAsyncOperation(
        `${name}_${propertyKey}`,
        () => originalMethod.apply(this, args),
        labels
      );
    };

    return descriptor;
  };
}

export class MetricsManager {
  private static instance: MetricsManager;
  private metrics: Map<string, Metric[]> = new Map();
  private metricConfigs: Map<string, MetricConfig> = new Map();

  private constructor() {}

  public static getInstance(): MetricsManager {
    if (!MetricsManager.instance) {
      MetricsManager.instance = new MetricsManager();
    }
    return MetricsManager.instance;
  }

  public registerMetric(config: MetricConfig): void {
    if (this.metricConfigs.has(config.name)) {
      throw new Error(`Metric ${config.name} already registered`);
    }

    this.metricConfigs.set(config.name, config);
    this.metrics.set(config.name, []);
    Logger.getInstance().info('metrics', `Registered metric: ${config.name}`, { type: config.type });
  }

  public increment(name: string, value: number = 1, labels?: Record<string, string>): void {
    this.validateMetric(name, MetricType.COUNTER);
    
    const metrics = this.metrics.get(name)!;
    const lastMetric = metrics[metrics.length - 1];
    
    const newValue = lastMetric ? lastMetric.value + value : value;
    this.recordMetric({
      name,
      value: newValue,
      labels,
      timestamp: Date.now(),
      type: MetricType.COUNTER
    });
  }

  public gauge(name: string, value: number, labels?: Record<string, string>): void {
    this.validateMetric(name, MetricType.GAUGE);
    
    this.recordMetric({
      name,
      value,
      labels,
      timestamp: Date.now(),
      type: MetricType.GAUGE
    });
  }

  public observe(name: string, value: number, labels?: Record<string, string>): void {
    this.validateMetric(name, MetricType.HISTOGRAM);
    
    const metrics = this.metrics.get(name)!;
    const lastMetric = metrics[metrics.length - 1] as HistogramMetric | undefined;
    
    const defaultBuckets = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];
    const buckets = lastMetric?.buckets.map(b => ({ ...b })) || 
      defaultBuckets.map(le => ({ le, count: 0 }));
    
    // Update bucket counts
    for (const bucket of buckets) {
      if (value <= bucket.le) {
        bucket.count++;
      }
    }

    const histogramMetric: HistogramMetric = {
      name,
      value,
      labels,
      timestamp: Date.now(),
      type: MetricType.HISTOGRAM,
      buckets,
      sum: (lastMetric?.sum || 0) + value,
      count: (lastMetric?.count || 0) + 1
    };

    this.recordMetric(histogramMetric);
  }

  private validateMetric(name: string, expectedType: MetricType): void {
    const config = this.metricConfigs.get(name);
    if (!config) {
      throw new Error(`Metric ${name} not registered`);
    }
    if (config.type !== expectedType) {
      throw new Error(`Metric ${name} is of type ${config.type}, expected ${expectedType}`);
    }
  }

  private recordMetric(metric: Metric): void {
    const metrics = this.metrics.get(metric.name)!;
    metrics.push(metric);
    
    // Trim old metrics if needed
    const maxMetrics = 1000; // Configure as needed
    if (metrics.length > maxMetrics) {
      metrics.splice(0, metrics.length - maxMetrics);
    }

    Logger.getInstance().debug('metrics', `Recorded metric: ${metric.name}`, {
      value: metric.value,
      labels: metric.labels
    });
  }

  public getMetrics(options?: {
    name?: string;
    type?: MetricType;
    startTime?: number;
    endTime?: number;
  }): Metric[] {
    let result: Metric[] = [];

    for (const [name, metrics] of this.metrics) {
      if (options?.name && name !== options.name) continue;
      
      let filteredMetrics = metrics;
      
      if (options?.type) {
        filteredMetrics = filteredMetrics.filter(m => m.type === options.type);
      }
      
      if (options?.startTime) {
        filteredMetrics = filteredMetrics.filter(m => m.timestamp >= options.startTime!);
      }
      
      if (options?.endTime) {
        filteredMetrics = filteredMetrics.filter(m => m.timestamp <= options.endTime!);
      }

      result = result.concat(filteredMetrics);
    }

    return result;
  }

  public clearMetrics(): void {
    for (const metrics of this.metrics.values()) {
      metrics.length = 0;
    }
    Logger.getInstance().info('metrics', 'Cleared all metrics');
  }

  public getMetricConfig(name: string): MetricConfig | undefined {
    return this.metricConfigs.get(name);
  }

  public getAllMetricConfigs(): MetricConfig[] {
    return Array.from(this.metricConfigs.values());
  }
}

export const metricsManager = MetricsManager.getInstance();
