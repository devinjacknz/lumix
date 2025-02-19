import { logger } from './logger';
import { metricsManager } from './metrics';

export interface ProfilerConfig {
  enabled: boolean;
  sampleRate: number;
  maxStackDepth: number;
  excludedModules?: string[];
}

export interface ProfilerStats {
  functionName: string;
  module: string;
  calls: number;
  totalTime: number;
  avgTime: number;
  minTime: number;
  maxTime: number;
  lastCalled: number;
}

export interface ProfilerTrace {
  functionName: string;
  module: string;
  startTime: number;
  endTime: number;
  duration: number;
  args?: any[];
  result?: any;
  error?: Error;
  parentId?: string;
  childIds: string[];
}

export class Profiler {
  private static instance: Profiler;
  private config: Required<ProfilerConfig>;
  private stats: Map<string, ProfilerStats> = new Map();
  private traces: Map<string, ProfilerTrace> = new Map();
  private activeTraces: Set<string> = new Set();

  private constructor(config: Partial<ProfilerConfig> = {}) {
    this.config = {
      enabled: config.enabled ?? true,
      sampleRate: config.sampleRate ?? 1.0,
      maxStackDepth: config.maxStackDepth ?? 10,
      excludedModules: config.excludedModules ?? []
    };

    // Register metrics
    metricsManager.registerMetric({
      name: 'function_calls_total',
      type: 'counter',
      description: 'Total number of function calls',
      labels: ['function', 'module']
    });

    metricsManager.registerMetric({
      name: 'function_duration_seconds',
      type: 'histogram',
      description: 'Function execution duration in seconds',
      labels: ['function', 'module']
    });
  }

  public static getInstance(config?: Partial<ProfilerConfig>): Profiler {
    if (!Profiler.instance) {
      Profiler.instance = new Profiler(config);
    }
    return Profiler.instance;
  }

  public startTrace(functionName: string, module: string, args?: any[]): string {
    if (!this.shouldProfile(module)) {
      return '';
    }

    const traceId = this.generateTraceId();
    const parentId = this.findActiveParent();

    const trace: ProfilerTrace = {
      functionName,
      module,
      startTime: Date.now(),
      endTime: 0,
      duration: 0,
      args,
      childIds: [],
      parentId
    };

    if (parentId) {
      const parentTrace = this.traces.get(parentId);
      if (parentTrace) {
        parentTrace.childIds.push(traceId);
      }
    }

    this.traces.set(traceId, trace);
    this.activeTraces.add(traceId);

    return traceId;
  }

  public endTrace(traceId: string, result?: any, error?: Error): void {
    if (!traceId || !this.traces.has(traceId)) {
      return;
    }

    const trace = this.traces.get(traceId)!;
    trace.endTime = Date.now();
    trace.duration = trace.endTime - trace.startTime;
    trace.result = result;
    trace.error = error;

    this.activeTraces.delete(traceId);
    this.updateStats(trace);
    this.recordMetrics(trace);

    logger.debug('profiler', `Function ${trace.functionName} completed`, {
      module: trace.module,
      duration: trace.duration,
      error: error?.message
    });
  }

  private shouldProfile(module: string): boolean {
    if (!this.config.enabled) return false;
    if (this.config.excludedModules.includes(module)) return false;
    if (this.activeTraces.size >= this.config.maxStackDepth) return false;
    return Math.random() <= this.config.sampleRate;
  }

  private generateTraceId(): string {
    return Math.random().toString(36).substring(2, 15);
  }

  private findActiveParent(): string | undefined {
    const activeTraceIds = Array.from(this.activeTraces);
    return activeTraceIds[activeTraceIds.length - 1];
  }

  private updateStats(trace: ProfilerTrace): void {
    const key = `${trace.module}:${trace.functionName}`;
    const existing = this.stats.get(key);

    if (existing) {
      existing.calls++;
      existing.totalTime += trace.duration;
      existing.avgTime = existing.totalTime / existing.calls;
      existing.minTime = Math.min(existing.minTime, trace.duration);
      existing.maxTime = Math.max(existing.maxTime, trace.duration);
      existing.lastCalled = trace.endTime;
    } else {
      this.stats.set(key, {
        functionName: trace.functionName,
        module: trace.module,
        calls: 1,
        totalTime: trace.duration,
        avgTime: trace.duration,
        minTime: trace.duration,
        maxTime: trace.duration,
        lastCalled: trace.endTime
      });
    }
  }

  private recordMetrics(trace: ProfilerTrace): void {
    const labels = {
      function: trace.functionName,
      module: trace.module
    };

    metricsManager.increment('function_calls_total', 1, labels);
    metricsManager.observe('function_duration_seconds', trace.duration / 1000, labels);
  }

  public getStats(options?: {
    module?: string;
    minCalls?: number;
    startTime?: number;
    endTime?: number;
  }): ProfilerStats[] {
    let stats = Array.from(this.stats.values());

    if (options) {
      if (options.module) {
        stats = stats.filter(s => s.module === options.module);
      }
      if (options.minCalls) {
        stats = stats.filter(s => s.calls >= options.minCalls);
      }
      if (options.startTime) {
        stats = stats.filter(s => s.lastCalled >= options.startTime!);
      }
      if (options.endTime) {
        stats = stats.filter(s => s.lastCalled <= options.endTime!);
      }
    }

    return stats;
  }

  public getTrace(traceId: string): ProfilerTrace | undefined {
    return this.traces.get(traceId);
  }

  public getTraceTree(traceId: string): ProfilerTrace[] {
    const trace = this.traces.get(traceId);
    if (!trace) return [];

    const result: ProfilerTrace[] = [trace];
    for (const childId of trace.childIds) {
      result.push(...this.getTraceTree(childId));
    }

    return result;
  }

  public clearStats(): void {
    this.stats.clear();
    this.traces.clear();
    this.activeTraces.clear();
    logger.info('profiler', 'Cleared all profiling data');
  }

  public getConfig(): Required<ProfilerConfig> {
    return { ...this.config };
  }

  public setConfig(config: Partial<ProfilerConfig>): void {
    this.config = {
      ...this.config,
      ...config
    };
    logger.info('profiler', 'Updated profiler configuration', config);
  }
}

export const profiler = Profiler.getInstance(); 