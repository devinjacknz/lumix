import { EventEmitter } from 'events';
import { BaseError } from '../types/errors';
import { MetricsCollector, MetricType } from '../metrics/collector';

/**
 * 性能追踪器错误
 */
export class TracerError extends BaseError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'TracerError';
  }
}

/**
 * 追踪配置
 */
export interface TracerConfig {
  // 基础配置
  enabled?: boolean;
  sampleRate?: number;
  maxTraces?: number;
  maxSpans?: number;

  // 过滤配置
  minDuration?: number;
  excludePatterns?: string[];
  includePatterns?: string[];

  // 存储配置
  storageLimit?: number;
  retentionPeriod?: number;

  // 指标配置
  metricsEnabled?: boolean;
  metricsCollector?: MetricsCollector;
  metricsPrefix?: string;
}

/**
 * 追踪范围类型
 */
export enum SpanType {
  HTTP = 'http',
  DATABASE = 'database',
  CACHE = 'cache',
  QUEUE = 'queue',
  RPC = 'rpc',
  INTERNAL = 'internal'
}

/**
 * 追踪范围
 */
export interface Span {
  id: string;
  traceId: string;
  parentId?: string;
  name: string;
  type: SpanType;
  startTime: number;
  endTime?: number;
  duration?: number;
  status: 'success' | 'error';
  error?: Error;
  metadata: Record<string, any>;
  tags: Record<string, string>;
  events: Array<{
    name: string;
    timestamp: number;
    metadata?: Record<string, any>;
  }>;
}

/**
 * 追踪
 */
export interface Trace {
  id: string;
  name: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  status: 'active' | 'completed' | 'error';
  error?: Error;
  metadata: Record<string, any>;
  spans: Span[];
}

/**
 * 性能追踪器
 */
export class PerformanceTracer extends EventEmitter {
  private config: Required<TracerConfig>;
  private traces: Map<string, Trace>;
  private activeSpans: Map<string, Span>;
  private metricsCollector?: MetricsCollector;

  constructor(config: TracerConfig = {}) {
    super();
    this.traces = new Map();
    this.activeSpans = new Map();
    this.config = {
      enabled: config.enabled ?? true,
      sampleRate: config.sampleRate || 1,
      maxTraces: config.maxTraces || 1000,
      maxSpans: config.maxSpans || 100,
      minDuration: config.minDuration || 0,
      excludePatterns: config.excludePatterns || [],
      includePatterns: config.includePatterns || [],
      storageLimit: config.storageLimit || 100 * 1024 * 1024, // 100MB
      retentionPeriod: config.retentionPeriod || 24 * 60 * 60 * 1000, // 24小时
      metricsEnabled: config.metricsEnabled ?? true,
      metricsCollector: config.metricsCollector,
      metricsPrefix: config.metricsPrefix || 'tracer'
    };

    if (this.config.metricsEnabled) {
      this.initializeMetrics();
    }
  }

  /**
   * 初始化指标
   */
  private initializeMetrics(): void {
    this.metricsCollector = this.config.metricsCollector || new MetricsCollector();

    // 追踪指标
    this.metricsCollector.createMetric({
      name: `${this.config.metricsPrefix}_traces_total`,
      type: MetricType.COUNTER,
      description: 'Total number of traces',
      labels: ['status']
    });

    this.metricsCollector.createMetric({
      name: `${this.config.metricsPrefix}_spans_total`,
      type: MetricType.COUNTER,
      description: 'Total number of spans',
      labels: ['type', 'status']
    });

    this.metricsCollector.createMetric({
      name: `${this.config.metricsPrefix}_duration_seconds`,
      type: MetricType.HISTOGRAM,
      description: 'Duration of traces and spans',
      labels: ['type'],
      buckets: [0.01, 0.05, 0.1, 0.5, 1, 5]
    });

    this.metricsCollector.createMetric({
      name: `${this.config.metricsPrefix}_errors_total`,
      type: MetricType.COUNTER,
      description: 'Total number of errors',
      labels: ['type']
    });
  }

  /**
   * 开始追踪
   */
  startTrace(name: string, metadata: Record<string, any> = {}): string {
    if (!this.config.enabled) return '';

    // 采样检查
    if (Math.random() > this.config.sampleRate) return '';

    // 存储限制检查
    if (this.traces.size >= this.config.maxTraces) {
      this.cleanupOldTraces();
    }

    const traceId = this.generateId();
    const trace: Trace = {
      id: traceId,
      name,
      startTime: Date.now(),
      status: 'active',
      metadata,
      spans: []
    };

    this.traces.set(traceId, trace);
    this.emit('traceStarted', trace);

    if (this.metricsCollector) {
      this.metricsCollector.record(
        `${this.config.metricsPrefix}_traces_total`,
        1,
        { status: 'active' }
      );
    }

    return traceId;
  }

  /**
   * 结束追踪
   */
  endTrace(traceId: string, error?: Error): void {
    const trace = this.traces.get(traceId);
    if (!trace) return;

    trace.endTime = Date.now();
    trace.duration = trace.endTime - trace.startTime;
    trace.status = error ? 'error' : 'completed';
    trace.error = error;

    this.emit('traceEnded', trace);

    if (this.metricsCollector) {
      this.metricsCollector.record(
        `${this.config.metricsPrefix}_traces_total`,
        1,
        { status: trace.status }
      );

      this.metricsCollector.record(
        `${this.config.metricsPrefix}_duration_seconds`,
        trace.duration / 1000,
        { type: 'trace' }
      );

      if (error) {
        this.metricsCollector.record(
          `${this.config.metricsPrefix}_errors_total`,
          1,
          { type: 'trace' }
        );
      }
    }
  }

  /**
   * 开始范围
   */
  startSpan(
    traceId: string,
    name: string,
    type: SpanType,
    metadata: Record<string, any> = {}
  ): string {
    const trace = this.traces.get(traceId);
    if (!trace) return '';

    // 范围限制检查
    if (trace.spans.length >= this.config.maxSpans) {
      throw new TracerError(`Max spans limit reached for trace ${traceId}`);
    }

    const spanId = this.generateId();
    const span: Span = {
      id: spanId,
      traceId,
      name,
      type,
      startTime: Date.now(),
      status: 'success',
      metadata,
      tags: {},
      events: []
    };

    this.activeSpans.set(spanId, span);
    this.emit('spanStarted', span);

    if (this.metricsCollector) {
      this.metricsCollector.record(
        `${this.config.metricsPrefix}_spans_total`,
        1,
        { type, status: 'active' }
      );
    }

    return spanId;
  }

  /**
   * 结束范围
   */
  endSpan(spanId: string, error?: Error): void {
    const span = this.activeSpans.get(spanId);
    if (!span) return;

    const trace = this.traces.get(span.traceId);
    if (!trace) return;

    span.endTime = Date.now();
    span.duration = span.endTime - span.startTime;
    span.status = error ? 'error' : 'success';
    span.error = error;

    trace.spans.push(span);
    this.activeSpans.delete(spanId);
    this.emit('spanEnded', span);

    if (this.metricsCollector) {
      this.metricsCollector.record(
        `${this.config.metricsPrefix}_spans_total`,
        1,
        { type: span.type, status: span.status }
      );

      this.metricsCollector.record(
        `${this.config.metricsPrefix}_duration_seconds`,
        span.duration / 1000,
        { type: 'span' }
      );

      if (error) {
        this.metricsCollector.record(
          `${this.config.metricsPrefix}_errors_total`,
          1,
          { type: 'span' }
        );
      }
    }
  }

  /**
   * 添加事件
   */
  addEvent(
    spanId: string,
    name: string,
    metadata: Record<string, any> = {}
  ): void {
    const span = this.activeSpans.get(spanId);
    if (!span) return;

    const event = {
      name,
      timestamp: Date.now(),
      metadata
    };

    span.events.push(event);
    this.emit('eventAdded', { span, event });
  }

  /**
   * 添加标签
   */
  addTag(spanId: string, key: string, value: string): void {
    const span = this.activeSpans.get(spanId);
    if (!span) return;

    span.tags[key] = value;
    this.emit('tagAdded', { span, key, value });
  }

  /**
   * 获取追踪
   */
  getTrace(traceId: string): Trace | undefined {
    return this.traces.get(traceId);
  }

  /**
   * 获取活动范围
   */
  getActiveSpan(spanId: string): Span | undefined {
    return this.activeSpans.get(spanId);
  }

  /**
   * 获取所有追踪
   */
  getAllTraces(): Trace[] {
    return Array.from(this.traces.values());
  }

  /**
   * 清理旧追踪
   */
  private cleanupOldTraces(): void {
    const now = Date.now();
    for (const [id, trace] of this.traces.entries()) {
      if (now - trace.startTime > this.config.retentionPeriod) {
        this.traces.delete(id);
      }
    }
  }

  /**
   * 生成 ID
   */
  private generateId(): string {
    return Math.random().toString(36).substring(2, 15);
  }

  /**
   * 停止追踪器
   */
  stop(): void {
    this.config.enabled = false;
    this.traces.clear();
    this.activeSpans.clear();
    this.emit('stopped');
  }
} 