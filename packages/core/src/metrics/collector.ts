import { EventEmitter } from 'events';
import { BaseError } from '../types/errors';

/**
 * 指标收集器错误
 */
export class MetricsCollectorError extends BaseError {
  constructor(message: string) {
    super(message);
    this.name = 'MetricsCollectorError';
  }
}

/**
 * 指标类型
 */
export enum MetricType {
  COUNTER = 'counter',
  GAUGE = 'gauge',
  HISTOGRAM = 'histogram',
  SUMMARY = 'summary'
}

/**
 * 指标标签
 */
export type MetricLabels = Record<string, string>;

/**
 * 指标值
 */
export interface MetricValue {
  value: number;
  timestamp: number;
  labels?: MetricLabels;
}

/**
 * 指标配置
 */
export interface MetricConfig {
  name: string;
  type: MetricType;
  description: string;
  unit?: string;
  labels?: string[];
  buckets?: number[];
  quantiles?: number[];
}

/**
 * 指标
 */
export interface Metric {
  config: MetricConfig;
  values: MetricValue[];
}

/**
 * 收集器配置
 */
export interface CollectorConfig {
  // 存储配置
  maxMetrics?: number;
  maxValuesPerMetric?: number;
  cleanupInterval?: number;

  // 聚合配置
  aggregationInterval?: number;
  defaultBuckets?: number[];
  defaultQuantiles?: number[];

  // 标签配置
  commonLabels?: MetricLabels;
  maxLabels?: number;

  // 导出配置
  exportFormat?: 'prometheus' | 'json' | 'influx';
  timestampPrecision?: 'ms' | 's';
}

/**
 * 指标收集器
 */
export class MetricsCollector extends EventEmitter {
  private config: Required<CollectorConfig>;
  private metrics: Map<string, Metric>;
  private cleanupInterval!: NodeJS.Timeout;
  private aggregationInterval!: NodeJS.Timeout;

  constructor(config: CollectorConfig = {}) {
    super();
    this.metrics = new Map();
    this.config = {
      maxMetrics: config.maxMetrics || 1000,
      maxValuesPerMetric: config.maxValuesPerMetric || 1000,
      cleanupInterval: config.cleanupInterval || 60000, // 1分钟
      aggregationInterval: config.aggregationInterval || 10000, // 10秒
      defaultBuckets: config.defaultBuckets || [0.1, 0.5, 1, 2, 5, 10],
      defaultQuantiles: config.defaultQuantiles || [0.5, 0.9, 0.95, 0.99],
      commonLabels: config.commonLabels || {},
      maxLabels: config.maxLabels || 10,
      exportFormat: config.exportFormat || 'prometheus',
      timestampPrecision: config.timestampPrecision || 'ms'
    };

    this.startCleanup();
    this.startAggregation();
  }

  /**
   * 创建或更新指标
   */
  createMetric(config: MetricConfig): void {
    // 验证指标名称
    if (!config.name || config.name.trim().length === 0) {
      throw new MetricsCollectorError('Metric name cannot be empty');
    }

    if (this.metrics.size >= this.config.maxMetrics) {
      throw new MetricsCollectorError('Maximum number of metrics reached');
    }

    // 验证标签数量
    if (config.labels && config.labels.length > this.config.maxLabels) {
      throw new MetricsCollectorError('Too many labels defined');
    }

    // 设置默认值
    const metric: Metric = {
      config: {
        ...config,
        buckets: config.buckets || this.config.defaultBuckets,
        quantiles: config.quantiles || this.config.defaultQuantiles
      },
      values: []
    };

    this.metrics.set(config.name, metric);
    this.emit('metricCreated', config.name);
  }

  /**
   * 记录指标值
   */
  record(name: string, value: number, labels?: MetricLabels): void {
    const metric = this.metrics.get(name);
    if (!metric) {
      throw new MetricsCollectorError(`Metric ${name} not found`);
    }

    // 验证值
    if (typeof value !== 'number' || isNaN(value) || !isFinite(value)) {
      throw new MetricsCollectorError('Invalid metric value');
    }

    // 验证标签
    this.validateLabels(metric.config, labels);

    // 添加公共标签
    const finalLabels = {
      ...this.config.commonLabels,
      ...labels
    };

    // 添加值
    const metricValue: MetricValue = {
      value,
      timestamp: Date.now(),
      labels: finalLabels
    };

    metric.values.push(metricValue);

    // 限制值的数量
    if (metric.values.length > this.config.maxValuesPerMetric) {
      metric.values.shift();
    }

    this.emit('valueRecorded', {
      name,
      value: metricValue
    });
  }

  /**
   * 获取指标值
   */
  getMetric(name: string): Metric | undefined {
    return this.metrics.get(name);
  }

  /**
   * 获取所有指标
   */
  getAllMetrics(): Map<string, Metric> {
    return this.metrics;
  }

  /**
   * 清理所有指标
   */
  clearMetrics(): void {
    this.metrics.clear();
    this.emit('metricsCleared');
  }

  /**
   * 验证标签
   */
  private validateLabels(config: MetricConfig, labels?: MetricLabels): void {
    if (!config.labels) return;

    if (!labels) {
      throw new MetricsCollectorError('Labels are required for this metric');
    }

    // 验证所有必需的标签都存在
    for (const requiredLabel of config.labels) {
      if (!(requiredLabel in labels)) {
        throw new MetricsCollectorError(`Missing required label: ${requiredLabel}`);
      }
    }

    // 验证标签值
    for (const [key, value] of Object.entries(labels)) {
      if (!key || !value) {
        throw new MetricsCollectorError('Invalid label key or value');
      }
    }
  }

  /**
   * 启动清理任务
   */
  private startCleanup(): void {
    this.cleanupInterval = setInterval(
      () => this.cleanupOldData(),
      this.config.cleanupInterval
    );
  }

  /**
   * 清理旧数据
   */
  private cleanupOldData(): void {
    const now = Date.now();
    for (const metric of this.metrics.values()) {
      metric.values = metric.values.filter(v =>
        now - v.timestamp <= this.config.cleanupInterval
      );
    }
  }

  /**
   * 聚合指标值
   */
  private aggregateMetrics(): void {
    for (const [name, metric] of this.metrics.entries()) {
      const now = Date.now();
      const values = metric.values;

      switch (metric.config.type) {
        case MetricType.COUNTER:
          this.aggregateCounter(name, values);
          break;
        case MetricType.GAUGE:
          this.aggregateGauge(name, values);
          break;
        case MetricType.HISTOGRAM:
          this.aggregateHistogram(name, values, metric.config.buckets!);
          break;
        case MetricType.SUMMARY:
          this.aggregateSummary(name, values, metric.config.quantiles!);
          break;
      }

      // 清理旧值
      metric.values = values.filter(v => now - v.timestamp <= this.config.aggregationInterval);
    }
  }

  /**
   * 聚合计数器
   */
  private aggregateCounter(name: string, values: MetricValue[]): void {
    if (values.length === 0) return;

    const sum = values.reduce((acc, v) => acc + v.value, 0);
    this.emit('aggregation', {
      name,
      type: MetricType.COUNTER,
      value: sum
    });
  }

  /**
   * 聚合仪表盘
   */
  private aggregateGauge(name: string, values: MetricValue[]): void {
    if (values.length === 0) return;

    const latest = values[values.length - 1].value;
    this.emit('aggregation', {
      name,
      type: MetricType.GAUGE,
      value: latest
    });
  }

  /**
   * 聚合直方图
   */
  private aggregateHistogram(name: string, values: MetricValue[], buckets: number[]): void {
    if (values.length === 0) return;

    const counts = new Map<number, number>();
    for (const bucket of buckets) {
      counts.set(bucket, 0);
    }

    for (const value of values) {
      for (const bucket of buckets) {
        if (value.value <= bucket) {
          counts.set(bucket, (counts.get(bucket) || 0) + 1);
        }
      }
    }

    this.emit('aggregation', {
      name,
      type: MetricType.HISTOGRAM,
      buckets: Array.from(counts.entries())
    });
  }

  /**
   * 聚合摘要
   */
  private aggregateSummary(name: string, values: MetricValue[], quantiles: number[]): void {
    if (values.length === 0) return;

    const sortedValues = values.map(v => v.value).sort((a, b) => a - b);
    const results = new Map<number, number>();

    for (const q of quantiles) {
      const index = Math.floor(q * sortedValues.length);
      results.set(q, sortedValues[index]);
    }

    this.emit('aggregation', {
      name,
      type: MetricType.SUMMARY,
      quantiles: Array.from(results.entries())
    });
  }

  /**
   * 启动聚合任务
   */
  private startAggregation(): void {
    this.aggregationInterval = setInterval(
      () => this.aggregateMetrics(),
      this.config.aggregationInterval
    );
  }

  /**
   * 停止收集器
   */
  close(): void {
    clearInterval(this.cleanupInterval);
    clearInterval(this.aggregationInterval);
    this.metrics.clear();
    this.emit('closed');
  }
} 