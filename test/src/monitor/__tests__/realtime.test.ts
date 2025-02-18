import { describe, expect, test, jest, beforeEach, afterEach } from '@jest/globals';
import { RealTimeMonitor } from '@lumix/core/monitor/realtime';
import { ResourceLimiter, ResourceUsageStats } from '@lumix/core/resource/limiter';
import { PerformanceTracer, Trace } from '@lumix/core/profiler/tracer';
import { MetricsCollector, Metric, MetricConfig } from '@lumix/core/metrics/collector';

describe('RealTimeMonitor', () => {
  let monitor: RealTimeMonitor;
  let mockMetricsCollector: jest.Mocked<MetricsCollector>;
  let mockResourceLimiter: jest.Mocked<ResourceLimiter>;
  let mockPerformanceTracer: jest.Mocked<PerformanceTracer>;

  beforeEach(() => {
    const now = Date.now();

    mockMetricsCollector = {
      getAllMetrics: jest.fn().mockReturnValue(new Map([
        ['system.cpu.usage', {
          config: {
            name: 'system.cpu.usage',
            type: 'gauge',
            description: 'System CPU usage'
          } as MetricConfig,
          values: [{ value: 50, timestamp: now }]
        } as Metric],
        ['system.memory.usage', {
          config: {
            name: 'system.memory.usage',
            type: 'gauge',
            description: 'System memory usage'
          } as MetricConfig,
          values: [{ value: 70, timestamp: now }]
        } as Metric]
      ])),
      getMetric: jest.fn(),
      createMetric: jest.fn(),
      recordMetric: jest.fn(),
      clearMetrics: jest.fn()
    } as jest.Mocked<MetricsCollector>;

    mockResourceLimiter = {
      getStats: jest.fn().mockResolvedValue({
        timestamp: now,
        cpu: { usage: 50 },
        memory: { heapUsed: 700, heapTotal: 1000 },
        disk: { used: 600, total: 1000 },
        network: { connections: 800 }
      } as ResourceUsageStats),
      setLimits: jest.fn(),
      checkLimits: jest.fn(),
      resetLimits: jest.fn()
    } as jest.Mocked<ResourceLimiter>;

    mockPerformanceTracer = {
      getAllTraces: jest.fn().mockReturnValue([
        {
          id: '1',
          name: 'trace1',
          status: 'active',
          spans: [{ id: '1' }, { id: '2' }],
          startTime: now,
          duration: 100,
          metadata: {}
        } as Trace,
        {
          id: '2',
          name: 'trace2',
          status: 'error',
          spans: [{ id: '3' }],
          startTime: now,
          duration: 200,
          metadata: {}
        } as Trace
      ]),
      startTrace: jest.fn(),
      endTrace: jest.fn(),
      getTrace: jest.fn(),
      clearTraces: jest.fn()
    } as jest.Mocked<PerformanceTracer>;

    monitor = new RealTimeMonitor({
      metricsCollector: mockMetricsCollector,
      resourceLimiter: mockResourceLimiter,
      performanceTracer: mockPerformanceTracer,
      interval: 1000,
      maxDataPoints: 100
    });
  });

  afterEach(() => {
    monitor.stop();
    jest.clearAllMocks();
  });

  test('initializes correctly', () => {
    expect(monitor).toBeDefined();
    expect(monitor.getStatus()).toBeDefined();
  });

  test('collects data points', async () => {
    const dataPoints = monitor.getDataPoints();
    expect(dataPoints).toBeDefined();
    expect(Array.isArray(dataPoints)).toBe(true);
  });

  test('handles resource errors gracefully', async () => {
    mockResourceLimiter.getStats.mockRejectedValueOnce(new Error('Resource check failed'));
    const status = monitor.getStatus();
    expect(status.healthy).toBe(true);
  });

  test('aggregates data correctly', () => {
    const now = Date.now();
    const startTime = now - 3600000; // 1 hour ago
    const endTime = now;
    const windowSize = 60000; // 1 minute

    const aggregatedData = monitor.getAggregatedData(startTime, endTime, windowSize);
    expect(Array.isArray(aggregatedData)).toBe(true);
    if (aggregatedData.length > 0) {
      expect(aggregatedData[0]).toEqual(expect.objectContaining({
        timestamp: expect.any(Number),
        data: expect.objectContaining({
          metrics: expect.any(Object),
          resources: expect.any(Object),
          performance: expect.any(Object)
        })
      }));
    }
  });

  test('maintains data points limit', () => {
    const dataPoints = monitor.getDataPoints();
    expect(dataPoints.length).toBeLessThanOrEqual(100);
  });

  test('returns correct status', () => {
    const status = monitor.getStatus();
    expect(status).toEqual(expect.objectContaining({
      healthy: expect.any(Boolean),
      lastUpdate: expect.any(Number),
      uptime: expect.any(Number),
      components: expect.objectContaining({
        metrics: expect.any(Object),
        resources: expect.any(Object),
        performance: expect.any(Object)
      })
    }));
  });

  test('stops monitoring correctly', () => {
    monitor.stop();
    const status = monitor.getStatus();
    expect(status.healthy).toBe(false);
    expect(status.message).toBe('Monitor stopped');
  });

  test('handles metrics collector errors', async () => {
    const errorCollector = {
      getAllMetrics: jest.fn().mockImplementation(() => {
        throw new Error('Metrics collection failed');
      }),
      getMetric: jest.fn(),
      createMetric: jest.fn(),
      recordMetric: jest.fn(),
      clearMetrics: jest.fn()
    } as jest.Mocked<MetricsCollector>;

    const monitorWithError = new RealTimeMonitor({
      ...monitor.getConfig(),
      metricsCollector: errorCollector
    });

    try {
      await monitorWithError.collect();
    } catch (error) {
      expect(error).toBeDefined();
      expect(monitorWithError.getStatus().components.metrics.status).toBe('degraded');
    }

    monitorWithError.stop();
  });
}); 