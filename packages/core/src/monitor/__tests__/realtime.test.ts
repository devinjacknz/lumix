import { RealTimeMonitor } from '../realtime';
import { MetricsCollector } from '../../metrics/collector';
import { ResourceLimiter } from '../../resource/limiter';
import { PerformanceTracer } from '../../profiler/tracer';

jest.useFakeTimers();

describe('RealTimeMonitor', () => {
  let monitor: RealTimeMonitor;
  let mockMetricsCollector: jest.Mocked<MetricsCollector>;
  let mockResourceLimiter: jest.Mocked<ResourceLimiter>;
  let mockPerformanceTracer: jest.Mocked<PerformanceTracer>;

  beforeEach(() => {
    mockMetricsCollector = {
      getAllMetrics: jest.fn().mockReturnValue(new Map([
        ['system.cpu', { values: [{ value: 50 }] }],
        ['system.memory', { values: [{ value: 60 }] }],
        ['system.disk', { values: [{ value: 70 }] }],
        ['system.network', { values: [{ value: 80 }] }]
      ]))
    } as any;

    mockResourceLimiter = {
      getStats: jest.fn().mockResolvedValue({
        cpu: {
          usage: 50,
          cores: 4,
          load: 0.5
        },
        memory: {
          heapUsed: 100,
          heapTotal: 200,
          rss: 300,
          external: 50
        },
        disk: {
          used: 1000,
          total: 2000,
          files: 100
        },
        network: {
          connections: 100,
          bandwidth: 1000,
          requests: 100
        },
        timestamp: Date.now()
      })
    } as any;

    mockPerformanceTracer = {
      getAllTraces: jest.fn().mockReturnValue([
        {
          status: 'active',
          spans: [{ id: 1 }, { id: 2 }],
          startTime: Date.now(),
          duration: 100
        },
        {
          status: 'error',
          spans: [{ id: 3 }],
          startTime: Date.now(),
          duration: 200
        }
      ])
    } as any;

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
    jest.clearAllTimers();
  });

  test('initializes correctly', () => {
    expect(monitor).toBeDefined();
    expect(monitor.getStatus()).toBeDefined();
  });

  test('stops monitoring', () => {
    monitor.stop();
    expect(monitor.getStatus().healthy).toBe(false);
  });

  test('emits data update event', async () => {
    const dataPromise = new Promise(resolve => {
      monitor.on('data', (data) => {
        expect(data).toEqual(expect.objectContaining({
          timestamp: expect.any(Number),
          metrics: expect.any(Object),
          resources: expect.any(Object),
          performance: expect.any(Object)
        }));
        resolve(data);
      });
    });

    jest.advanceTimersByTime(1000);
    await dataPromise;
  });

  test('maintains data points limit', async () => {
    // Add more data points than the limit
    for (let i = 0; i < 110; i++) {
      jest.advanceTimersByTime(1000);
    }
    await Promise.resolve(); // Let promises resolve

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

  test('handles resource errors gracefully', async () => {
    mockResourceLimiter.getStats.mockRejectedValue(new Error('Test error'));
    jest.advanceTimersByTime(1000);
    await Promise.resolve(); // Let promises resolve
    expect(monitor.getStatus().healthy).toBe(true);
  });

  test('aggregates data correctly', async () => {
    // Add some test data points
    for (let i = 0; i < 5; i++) {
      jest.advanceTimersByTime(1000);
    }
    await Promise.resolve(); // Let promises resolve

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
}); 