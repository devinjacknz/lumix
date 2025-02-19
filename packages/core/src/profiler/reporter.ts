import { BaseError } from '../types/errors';
import { Trace, Span, SpanType } from './tracer';

/**
 * 报告生成器错误
 */
export class ReporterError extends BaseError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ReporterError';
  }
}

/**
 * 报告配置
 */
export interface ReportConfig {
  // 基础配置
  title?: string;
  description?: string;
  format?: 'html' | 'json' | 'markdown';
  outputPath?: string;

  // 过滤配置
  minDuration?: number;
  maxTraces?: number;
  includeTypes?: SpanType[];
  excludeTypes?: SpanType[];

  // 分析配置
  analyzePatterns?: boolean;
  analyzeTrends?: boolean;
  analyzeBottlenecks?: boolean;

  // 可视化配置
  includeCharts?: boolean;
  chartTheme?: 'light' | 'dark';
  chartTypes?: Array<'timeline' | 'histogram' | 'pie' | 'flame'>;
}

/**
 * 性能统计
 */
export interface PerformanceStats {
  // 基础统计
  totalTraces: number;
  totalSpans: number;
  totalErrors: number;
  totalDuration: number;

  // 时间统计
  avgDuration: number;
  minDuration: number;
  maxDuration: number;
  p50Duration: number;
  p90Duration: number;
  p95Duration: number;
  p99Duration: number;

  // 类型统计
  spansByType: Record<SpanType, number>;
  errorsByType: Record<SpanType, number>;
  durationByType: Record<SpanType, {
    total: number;
    avg: number;
    min: number;
    max: number;
  }>;

  // 错误统计
  topErrors: Array<{
    message: string;
    count: number;
    type: SpanType;
  }>;
}

/**
 * 性能报告
 */
export interface PerformanceReport {
  // 基础信息
  title: string;
  description: string;
  timestamp: number;
  duration: number;

  // 统计信息
  stats: PerformanceStats;

  // 瓶颈分析
  bottlenecks: Array<{
    type: SpanType;
    name: string;
    duration: number;
    impact: number;
    recommendation?: string;
  }>;

  // 模式分析
  patterns: Array<{
    name: string;
    description: string;
    frequency: number;
    avgDuration: number;
    spans: Array<{
      type: SpanType;
      name: string;
    }>;
  }>;

  // 趋势分析
  trends: Array<{
    metric: string;
    values: number[];
    timestamps: number[];
    change: number;
  }>;
}

/**
 * 性能报告生成器
 */
export class PerformanceReporter {
  private config: Required<ReportConfig>;

  constructor(config: ReportConfig = {}) {
    this.config = {
      title: config.title || 'Performance Report',
      description: config.description || 'Detailed analysis of system performance',
      format: config.format || 'html',
      outputPath: config.outputPath || './report',
      minDuration: config.minDuration || 0,
      maxTraces: config.maxTraces || 1000,
      includeTypes: config.includeTypes || Object.values(SpanType),
      excludeTypes: config.excludeTypes || [],
      analyzePatterns: config.analyzePatterns ?? true,
      analyzeTrends: config.analyzeTrends ?? true,
      analyzeBottlenecks: config.analyzeBottlenecks ?? true,
      includeCharts: config.includeCharts ?? true,
      chartTheme: config.chartTheme || 'light',
      chartTypes: config.chartTypes || ['timeline', 'histogram', 'pie', 'flame']
    };
  }

  /**
   * 生成报告
   */
  generateReport(traces: Trace[]): PerformanceReport {
    // 过滤追踪
    const filteredTraces = this.filterTraces(traces);

    // 计算统计信息
    const stats = this.calculateStats(filteredTraces);

    // 分析瓶颈
    const bottlenecks = this.config.analyzeBottlenecks
      ? this.analyzeBottlenecks(filteredTraces, stats)
      : [];

    // 分析模式
    const patterns = this.config.analyzePatterns
      ? this.analyzePatterns(filteredTraces)
      : [];

    // 分析趋势
    const trends = this.config.analyzeTrends
      ? this.analyzeTrends(filteredTraces)
      : [];

    return {
      title: this.config.title,
      description: this.config.description,
      timestamp: Date.now(),
      duration: this.calculateReportDuration(filteredTraces),
      stats,
      bottlenecks,
      patterns,
      trends
    };
  }

  /**
   * 过滤追踪
   */
  private filterTraces(traces: Trace[]): Trace[] {
    return traces
      .filter(trace => {
        // 检查持续时间
        if (trace.duration && trace.duration < this.config.minDuration) {
          return false;
        }

        // 检查类型
        const hasValidType = trace.spans.some(span =>
          this.config.includeTypes.includes(span.type) &&
          !this.config.excludeTypes.includes(span.type)
        );

        return hasValidType;
      })
      .slice(0, this.config.maxTraces);
  }

  /**
   * 计算统计信息
   */
  private calculateStats(traces: Trace[]): PerformanceStats {
    const spans = traces.flatMap(t => t.spans);
    const durations = spans.map(s => s.duration || 0);
    const sortedDurations = [...durations].sort((a, b) => a - b);

    const stats: PerformanceStats = {
      totalTraces: traces.length,
      totalSpans: spans.length,
      totalErrors: spans.filter(s => s.status === 'error').length,
      totalDuration: durations.reduce((a, b) => a + b, 0),

      avgDuration: durations.reduce((a, b) => a + b, 0) / durations.length,
      minDuration: Math.min(...durations),
      maxDuration: Math.max(...durations),
      p50Duration: this.getPercentile(sortedDurations, 50),
      p90Duration: this.getPercentile(sortedDurations, 90),
      p95Duration: this.getPercentile(sortedDurations, 95),
      p99Duration: this.getPercentile(sortedDurations, 99),

      spansByType: this.countByType(spans, s => 1),
      errorsByType: this.countByType(
        spans.filter(s => s.status === 'error'),
        s => 1
      ),
      durationByType: this.calculateDurationByType(spans),

      topErrors: this.getTopErrors(spans)
    };

    return stats;
  }

  /**
   * 分析瓶颈
   */
  private analyzeBottlenecks(
    traces: Trace[],
    stats: PerformanceStats
  ): PerformanceReport['bottlenecks'] {
    const bottlenecks: PerformanceReport['bottlenecks'] = [];
    const spans = traces.flatMap(t => t.spans);

    // 按类型和名称分组
    const groupedSpans = new Map<string, Span[]>();
    for (const span of spans) {
      const key = `${span.type}:${span.name}`;
      const group = groupedSpans.get(key) || [];
      group.push(span);
      groupedSpans.set(key, group);
    }

    // 分析每个组
    for (const [key, group] of groupedSpans.entries()) {
      const [type, name] = key.split(':') as [SpanType, string];
      const totalDuration = group.reduce((sum, s) => sum + (s.duration || 0), 0);
      const avgDuration = totalDuration / group.length;
      const impact = avgDuration / stats.avgDuration;

      if (impact > 1.5) { // 如果平均持续时间超过总平均的 150%
        bottlenecks.push({
          type,
          name,
          duration: avgDuration,
          impact,
          recommendation: this.getRecommendation(type, impact)
        });
      }
    }

    return bottlenecks.sort((a, b) => b.impact - a.impact);
  }

  /**
   * 分析模式
   */
  private analyzePatterns(traces: Trace[]): PerformanceReport['patterns'] {
    const patterns: PerformanceReport['patterns'] = [];
    const sequences = new Map<string, Array<{
      spans: Span[];
      duration: number;
    }>>();

    // 查找重复的 span 序列
    for (const trace of traces) {
      for (let i = 0; i < trace.spans.length - 1; i++) {
        for (let j = i + 1; j <= Math.min(i + 5, trace.spans.length); j++) {
          const sequence = trace.spans.slice(i, j);
          const key = sequence.map(s => `${s.type}:${s.name}`).join('->');
          const duration = sequence.reduce((sum, s) => sum + (s.duration || 0), 0);

          const existing = sequences.get(key) || [];
          existing.push({ spans: sequence, duration });
          sequences.set(key, existing);
        }
      }
    }

    // 分析频繁模式
    for (const [key, occurrences] of sequences.entries()) {
      if (occurrences.length >= 3) { // 至少出现 3 次
        const avgDuration = occurrences.reduce((sum, o) => sum + o.duration, 0) / occurrences.length;
        patterns.push({
          name: `Pattern-${patterns.length + 1}`,
          description: `Frequent sequence: ${key}`,
          frequency: occurrences.length,
          avgDuration,
          spans: occurrences[0].spans.map(s => ({
            type: s.type,
            name: s.name
          }))
        });
      }
    }

    return patterns.sort((a, b) => b.frequency - a.frequency);
  }

  /**
   * 分析趋势
   */
  private analyzeTrends(traces: Trace[]): PerformanceReport['trends'] {
    const trends: PerformanceReport['trends'] = [];
    const timeWindow = 5 * 60 * 1000; // 5分钟窗口
    const now = Date.now();
    const windows: number[] = [];

    // 创建时间窗口
    for (let t = now - timeWindow * 12; t <= now; t += timeWindow) {
      windows.push(t);
    }

    // 分析不同指标的趋势
    const metrics = [
      {
        name: 'Average Duration',
        getValue: (t: Trace) => t.duration || 0
      },
      {
        name: 'Error Rate',
        getValue: (t: Trace) => t.status === 'error' ? 1 : 0
      },
      {
        name: 'Span Count',
        getValue: (t: Trace) => t.spans.length
      }
    ];

    for (const metric of metrics) {
      const values: number[] = [];
      const timestamps: number[] = [];

      for (const windowStart of windows) {
        const windowTraces = traces.filter(t =>
          t.startTime >= windowStart &&
          t.startTime < windowStart + timeWindow
        );

        if (windowTraces.length > 0) {
          const value = windowTraces.reduce((sum, t) => sum + metric.getValue(t), 0) / windowTraces.length;
          values.push(value);
          timestamps.push(windowStart);
        }
      }

      if (values.length >= 2) {
        const change = ((values[values.length - 1] - values[0]) / values[0]) * 100;
        trends.push({
          metric: metric.name,
          values,
          timestamps,
          change
        });
      }
    }

    return trends;
  }

  /**
   * 获取百分位数
   */
  private getPercentile(sorted: number[], percentile: number): number {
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[index];
  }

  /**
   * 按类型统计
   */
  private countByType<T>(
    spans: Span[],
    getValue: (span: Span) => T
  ): Record<SpanType, T> {
    const result = {} as Record<SpanType, T>;
    for (const type of Object.values(SpanType)) {
      const typeSpans = spans.filter(s => s.type === type);
      const value = typeSpans.reduce((sum, s) => sum + getValue(s), 0 as any);
      result[type] = value;
    }
    return result;
  }

  /**
   * 计算每种类型的持续时间统计
   */
  private calculateDurationByType(
    spans: Span[]
  ): PerformanceStats['durationByType'] {
    const result = {} as PerformanceStats['durationByType'];

    for (const type of Object.values(SpanType)) {
      const typeSpans = spans.filter(s => s.type === type);
      const durations = typeSpans.map(s => s.duration || 0);

      if (durations.length > 0) {
        result[type] = {
          total: durations.reduce((a, b) => a + b, 0),
          avg: durations.reduce((a, b) => a + b, 0) / durations.length,
          min: Math.min(...durations),
          max: Math.max(...durations)
        };
      }
    }

    return result;
  }

  /**
   * 获取最常见的错误
   */
  private getTopErrors(
    spans: Span[]
  ): PerformanceStats['topErrors'] {
    const errorCounts = new Map<string, {
      count: number;
      type: SpanType;
    }>();

    for (const span of spans) {
      if (span.error) {
        const message = span.error.message;
        const existing = errorCounts.get(message) || {
          count: 0,
          type: span.type
        };
        existing.count++;
        errorCounts.set(message, existing);
      }
    }

    return Array.from(errorCounts.entries())
      .map(([message, { count, type }]) => ({
        message,
        count,
        type
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }

  /**
   * 获取优化建议
   */
  private getRecommendation(type: SpanType, impact: number): string {
    if (impact > 3) {
      switch (type) {
        case SpanType.HTTP:
          return 'Consider implementing caching or using a CDN';
        case SpanType.DATABASE:
          return 'Optimize database queries or add appropriate indexes';
        case SpanType.CACHE:
          return 'Review cache hit rates and eviction policies';
        case SpanType.QUEUE:
          return 'Consider implementing batch processing';
        case SpanType.RPC:
          return 'Implement request batching or use connection pooling';
        default:
          return 'Review implementation for optimization opportunities';
      }
    }
    return 'Monitor for further performance degradation';
  }

  /**
   * 计算报告持续时间
   */
  private calculateReportDuration(traces: Trace[]): number {
    if (traces.length === 0) return 0;
    const startTime = Math.min(...traces.map(t => t.startTime));
    const endTime = Math.max(...traces.map(t => t.endTime || t.startTime));
    return endTime - startTime;
  }
} 