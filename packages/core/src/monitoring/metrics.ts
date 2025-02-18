export interface Metric {
  name: string;
  value: number;
  timestamp: number;
  labels?: Record<string, string>;
}

export interface MetricOptions {
  labels?: Record<string, string>;
}

export class MetricsCollector {
  private metrics: Metric[] = [];
  private static instance: MetricsCollector;

  private constructor() {}

  static getInstance(): MetricsCollector {
    if (!MetricsCollector.instance) {
      MetricsCollector.instance = new MetricsCollector();
    }
    return MetricsCollector.instance;
  }

  recordMetric(name: string, value: number, options: MetricOptions = {}): void {
    this.metrics.push({
      name,
      value,
      timestamp: Date.now(),
      labels: options.labels,
    });
  }

  getMetrics(): Metric[] {
    return [...this.metrics];
  }

  getMetricsByName(name: string): Metric[] {
    return this.metrics.filter(metric => metric.name === name);
  }

  clearMetrics(): void {
    this.metrics = [];
  }
}

export class PerformanceMonitor {
  private static collector = MetricsCollector.getInstance();

  static recordDuration(name: string, startTime: number, labels?: Record<string, string>): void {
    const duration = Date.now() - startTime;
    this.collector.recordMetric(`${name}_duration_ms`, duration, { labels });
  }

  static recordValue(name: string, value: number, labels?: Record<string, string>): void {
    this.collector.recordMetric(name, value, { labels });
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
