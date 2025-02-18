import { MetricValue, MetricsCollector, ChainMetrics, SystemMetrics } from './types';
import { ChainType } from '../config/types';
import { Logger } from './logger';

export interface Metric {
  name: string;
  value: number;
  timestamp: number;
  labels?: Record<string, string>;
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
