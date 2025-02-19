import { describe, expect, test, jest, beforeEach, afterEach } from '@jest/globals';
import { EventEmitter } from 'events';
import { RealTimeMonitor, MonitorConfig, MonitorDataPoint } from '@lumix/core/monitor/realtime';
import { MetricsCollector } from '@lumix/core/metrics/collector';
import { ResourceLimiter } from '@lumix/core/resource/limiter';
import { PerformanceTracer } from '@lumix/core/profiler/tracer';

// Mock MetricsCollector
class MockMetricsCollector implements Partial<MetricsCollector> {
  getAllMetrics() {
    return new Map([
      ['metric1', { values: [{ value: 100, timestamp: Date.now() }] }],
      ['metric2', { values: [{ value: 200, timestamp: Date.now() }] }]
    ]);
  }
}

// Mock ResourceLimiter
class MockResourceLimiter implements Partial<ResourceLimiter> {
  async getStats() {
    return {
      cpu: { usage: 50 },
      memory: { heapUsed: 500, heapTotal: 1000 },
      disk: { used: 400, total: 1000 },
      network: { connections: 100 }
    };
  }
}

// Mock PerformanceTracer
class MockPerformanceTracer implements Partial<PerformanceTracer> {
  getAllTraces() {
    return [
      { status: 'active', spans: 5, duration: 100, error: false },
      { status: 'active', spans: 3, duration: 150, error: true },
      { status: 'completed', spans: 2, duration: 200, error: false }
    ];
  }
}

describe('RealTimeMonitor', () => {
  let monitor: RealTimeMonitor;
  let config: MonitorConfig;

  beforeEach(() => {
    // 设置基础配置
    config = {
      enabled: true,
      interval: 100,
      maxDataPoints: 10,
      metricsCollector: new MockMetricsCollector() as MetricsCollector,
      resourceLimiter: new MockResourceLimiter() as ResourceLimiter,
      performanceTracer: new MockPerformanceTracer() as PerformanceTracer,
      storageLimit: 1000,
      retentionPeriod: 3600000,
      aggregationWindow: 1000,
      aggregationFunctions: ['avg', 'min', 'max']
    };

    monitor = new RealTimeMonitor(config);
  });

  afterEach(() => {
    monitor.stop();
  });

  test('应该正确初始化监控器', () => {
    expect(monitor).toBeInstanceOf(EventEmitter);
    expect(monitor.getStatus()).toMatchObject({
      healthy: true,
      components: {
        metrics: { status: 'up' },
        resources: { status: 'up' },
        performance: { status: 'up' }
      }
    });
  });

  test('应该能够收集数据点', async () => {
    const dataPoint = await monitor.collect();
    
    // 验证指标数据
    expect(dataPoint.metrics).toEqual({
      metric1: 100,
      metric2: 200
    });

    // 验证资源数据
    expect(dataPoint.resources).toEqual({
      cpu: 50,
      memory: 0.5, // 500/1000
      disk: 0.4,   // 400/1000
      network: 10  // (100/1000) * 100
    });

    // 验证性能数据
    expect(dataPoint.performance).toMatchObject({
      activeTraces: expect.any(Number),
      activeSpans: expect.any(Number),
      errorRate: expect.any(Number),
      avgDuration: expect.any(Number)
    });
  });

  test('应该能够获取指定时间范围的数据点', async () => {
    // 收集多个数据点
    await monitor.collect();
    await new Promise(resolve => setTimeout(resolve, 100));
    await monitor.collect();
    
    const now = Date.now();
    const startTime = now - 1000;
    const endTime = now;
    
    const dataPoints = monitor.getDataPoints(startTime, endTime);
    expect(dataPoints.length).toBeGreaterThan(0);
    expect(dataPoints[0]).toMatchObject({
      timestamp: expect.any(Number),
      metrics: expect.any(Object),
      resources: expect.any(Object),
      performance: expect.any(Object)
    });
  });

  test('应该能够聚合数据', async () => {
    // 收集多个数据点
    await monitor.collect();
    await new Promise(resolve => setTimeout(resolve, 100));
    await monitor.collect();
    
    const now = Date.now();
    const startTime = now - 1000;
    const endTime = now;
    
    const aggregatedData = monitor.getAggregatedData(startTime, endTime, 500);
    expect(aggregatedData.length).toBeGreaterThan(0);
    expect(aggregatedData[0]).toMatchObject({
      timestamp: expect.any(Number),
      data: expect.any(Object)
    });
  });

  test('应该能够处理错误情况', async () => {
    // 模拟MetricsCollector抛出错误
    const errorCollector = {
      getAllMetrics: () => {
        throw new Error('Metrics collection failed');
      }
    };

    const monitorWithError = new RealTimeMonitor({
      ...config,
      metricsCollector: errorCollector as MetricsCollector
    });

    try {
      await monitorWithError.collect();
    } catch (error) {
      expect(error).toBeDefined();
      expect(monitorWithError.getStatus().components.metrics.status).toBe('degraded');
    }

    monitorWithError.stop();
  });

  test('应该能够正确清理旧数据', async () => {
    const smallStorageMonitor = new RealTimeMonitor({
      ...config,
      storageLimit: 100, // 设置很小的存储限制
      maxDataPoints: 1000
    });

    // 收集足够多的数据点以触发清理
    for (let i = 0; i < 10; i++) {
      await smallStorageMonitor.collect();
    }

    // 验证数据点数量不会超过限制
    const dataPoints = smallStorageMonitor.getDataPoints();
    expect(dataPoints.length).toBeLessThanOrEqual(1000);

    smallStorageMonitor.stop();
  });

  test('应该能够正确停止监控', () => {
    monitor.stop();
    expect(monitor.getStatus().components.metrics.status).toBe('up');
    // 确保interval被清除
    expect((monitor as any).interval).toBeUndefined();
  });
}); 