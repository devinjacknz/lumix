import { RealTimeMonitor } from './realtime';
import { ResourceLimiter } from '../resource/limiter';
import { MetricsCollector } from '../metrics/collector';
import { PerformanceTracer } from '../profiler/tracer';

describe('RealTimeMonitor', () => {
  let mockResourceLimiter: jest.Mocked<ResourceLimiter>;
  let mockMetricsCollector: jest.Mocked<MetricsCollector>;
  let mockPerformanceTracer: jest.Mocked<PerformanceTracer>;
  let monitor: RealTimeMonitor;

  beforeEach(() => {
    mockResourceLimiter = {
      getStats: jest.fn().mockResolvedValue({
        cpu: { usage: 50 },
        memory: { heapUsed: 700, heapTotal: 1000 },
        disk: { used: 600, total: 1000 },
        network: { connections: 500 }
      })
    } as jest.Mocked<ResourceLimiter>;

    mockMetricsCollector = {
      getAllMetrics: jest.fn().mockReturnValue(new Map([
        ['system.cpu', { values: [{ value: 50 }] }],
        ['system.memory', { values: [{ value: 70 }] }],
        ['system.disk', { values: [{ value: 60 }] }]
      ])),
      observe: jest.fn(),
      clear: jest.fn()
    } as jest.Mocked<MetricsCollector>;

    mockPerformanceTracer = {
      getAllTraces: jest.fn().mockReturnValue([])
    } as jest.Mocked<PerformanceTracer>;

    monitor = new RealTimeMonitor({
      enabled: true,
      interval: 100,
      maxDataPoints: 10,
      metricsCollector: mockMetricsCollector,
      resourceLimiter: mockResourceLimiter,
      performanceTracer: mockPerformanceTracer
    });
  });

  afterEach(() => {
    monitor.stop();
  });

  it('should start monitoring successfully', async () => {
    await monitor.start();
    expect(mockResourceLimiter.getStats).toHaveBeenCalled();
    expect(mockMetricsCollector.getAllMetrics).toHaveBeenCalled();
    expect(mockPerformanceTracer.getAllTraces).toHaveBeenCalled();
  });

  it('should handle resource check failure', async () => {
    mockResourceLimiter.getStats.mockRejectedValueOnce(new Error('Resource check failed'));
    await expect(monitor.start()).rejects.toThrow('Resource check failed');
  });

  it('should record metrics correctly', async () => {
    await monitor.start();
    const metrics = mockMetricsCollector.getAllMetrics();
    expect(metrics.get('system.cpu')?.values[0].value).toBe(50);
    expect(metrics.get('system.memory')?.values[0].value).toBe(70);
    expect(metrics.get('system.disk')?.values[0].value).toBe(60);
  });

  it('should clear metrics on stop', async () => {
    await monitor.start();
    monitor.stop();
    expect(mockMetricsCollector.clear).toHaveBeenCalled();
  });
}); 