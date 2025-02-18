import { StreamProcessor } from '../stream-processor';
import { MonitorDataPoint } from '../realtime';
import { DataCompressor } from '../data-compressor';

describe('StreamProcessor', () => {
  let processor: StreamProcessor;
  let mockDataPoint: MonitorDataPoint;

  beforeEach(() => {
    processor = new StreamProcessor({
      batchSize: 2,
      flushInterval: 1000,
      maxQueueSize: 5,
      compression: {
        enabled: true,
        threshold: 100,
        level: 6
      }
    });

    mockDataPoint = {
      timestamp: Date.now(),
      metrics: {
        'test.metric': 100
      },
      resources: {
        cpu: 50,
        memory: 60,
        disk: 70,
        network: 80
      },
      performance: {
        activeTraces: 10,
        activeSpans: 100,
        errorRate: 0.05,
        avgDuration: 200
      }
    };
  });

  afterEach(() => {
    processor.stop();
  });

  test('initializes with correct configuration', () => {
    const stats = processor.getStats();
    expect(stats.processedCount).toBe(0);
    expect(stats.errorCount).toBe(0);
    expect(stats.queueSize).toBe(0);
    expect(stats.compression).toBeDefined();
    expect(stats.compression?.enabled).toBe(true);
  });

  test('processes and compresses data points in batches', async () => {
    const processedBatches: Buffer[] = [];
    processor.on('batch', (batch) => {
      processedBatches.push(batch);
    });

    // 添加三个数据点
    await processor.addDataPoint({ ...mockDataPoint, timestamp: 1 });
    await processor.addDataPoint({ ...mockDataPoint, timestamp: 2 });
    await processor.addDataPoint({ ...mockDataPoint, timestamp: 3 });

    // 等待处理完成
    await new Promise(resolve => setTimeout(resolve, 100));

    expect(processedBatches.length).toBe(1);
    expect(processedBatches[0]).toBeInstanceOf(Buffer);
    expect(processor.getStats().queueSize).toBe(1);
  });

  test('respects queue size limit', async () => {
    // 添加超过队列限制的数据点
    for (let i = 0; i < 7; i++) {
      await processor.addDataPoint({ ...mockDataPoint, timestamp: i });
    }

    const stats = processor.getStats();
    expect(stats.queueSize).toBeLessThanOrEqual(5);
  });

  test('handles processing errors and retries', async () => {
    let attempts = 0;
    processor.on('batch', () => {
      if (attempts === 0) {
        attempts++;
        throw new Error('Processing failed');
      }
    });

    processor.on('error', (error) => {
      expect(error.message).toBe('Processing failed');
    });

    await processor.addDataPoint(mockDataPoint);
    await processor.addDataPoint(mockDataPoint);

    // 等待重试完成
    await new Promise(resolve => setTimeout(resolve, 1500));

    const stats = processor.getStats();
    expect(stats.errorCount).toBe(1);
    expect(stats.processedCount).toBe(2);
  });

  test('maintains compression statistics', async () => {
    // 添加大量数据点
    const largeData = Array.from({ length: 100 }, (_, i) => ({
      ...mockDataPoint,
      timestamp: Date.now() + i * 1000
    }));

    for (const point of largeData) {
      await processor.addDataPoint(point);
    }

    // 等待处理完成
    await new Promise(resolve => setTimeout(resolve, 200));

    const stats = processor.getStats();
    expect(stats.compression).toBeDefined();
    expect(stats.compression?.ratio).toBeGreaterThan(0);
    expect(stats.compression?.savedBytes).toBeGreaterThan(0);
  });

  test('processes data with disabled compression', async () => {
    const uncompressedProcessor = new StreamProcessor({
      batchSize: 2,
      compression: { enabled: false }
    });

    const processedBatches: Buffer[] = [];
    uncompressedProcessor.on('batch', (batch) => {
      processedBatches.push(batch);
    });

    await uncompressedProcessor.addDataPoint(mockDataPoint);
    await uncompressedProcessor.addDataPoint(mockDataPoint);

    // 等待处理完成
    await new Promise(resolve => setTimeout(resolve, 100));

    expect(processedBatches.length).toBe(1);
    // 验证数据未被压缩
    const data = JSON.parse(processedBatches[0].toString());
    expect(data).toHaveLength(2);
    expect(data[0].timestamp).toBe(mockDataPoint.timestamp);

    uncompressedProcessor.stop();
  });

  test('handles large batches efficiently', async () => {
    const largeProcessor = new StreamProcessor({
      batchSize: 1000,
      compression: {
        enabled: true,
        level: 9  // 最高压缩级别
      }
    });

    const processedEvents: Array<{
      batchSize: number;
      processingTime: number;
      compressionStats: any;
    }> = [];

    largeProcessor.on('processed', (event) => {
      processedEvents.push(event);
    });

    // 添加大量数据点
    const largeData = Array.from({ length: 1000 }, (_, i) => ({
      ...mockDataPoint,
      timestamp: Date.now() + i * 1000,
      metrics: {
        ...mockDataPoint.metrics,
        [`metric_${i}`]: Math.random() * 100
      }
    }));

    for (const point of largeData) {
      await largeProcessor.addDataPoint(point);
    }

    // 等待处理完成
    await new Promise(resolve => setTimeout(resolve, 500));

    expect(processedEvents.length).toBeGreaterThan(0);
    const lastEvent = processedEvents[processedEvents.length - 1];
    expect(lastEvent.compressionStats.compressionRatio).toBeLessThan(100);
    expect(lastEvent.processingTime).toBeLessThan(1000);

    largeProcessor.stop();
  });

  test('maintains data integrity through compression', async () => {
    const compressor = new DataCompressor();
    const processedBatches: Buffer[] = [];
    
    processor.on('batch', (batch) => {
      processedBatches.push(batch);
    });

    // 添加具有精确数值的数据点
    const preciseDataPoint = {
      ...mockDataPoint,
      metrics: {
        'precise.value': 123.456789
      },
      resources: {
        cpu: 45.6789,
        memory: 78.9012,
        disk: 34.5678,
        network: 89.0123
      },
      performance: {
        activeTraces: 100,
        activeSpans: 1000,
        errorRate: 0.0123456789,
        avgDuration: 123.456789
      }
    };

    await processor.addDataPoint(preciseDataPoint);
    await processor.addDataPoint(preciseDataPoint);

    // 等待处理完成
    await new Promise(resolve => setTimeout(resolve, 100));

    // 解压缩数据
    const decompressedData = await compressor.decompress(processedBatches[0]);
    expect(decompressedData).toHaveLength(2);

    const processedPoint = decompressedData[0];
    // 验证数值精度
    expect(processedPoint.resources.cpu).toBeCloseTo(45.7, 1);
    expect(processedPoint.performance.errorRate).toBeCloseTo(0.0123, 4);
    expect(processedPoint.metrics['precise.value']).toBeCloseTo(123.46, 2);
  });
});

describe('StreamProcessor with Parallel Processing', () => {
  let processor: StreamProcessor;
  let mockDataPoint: MonitorDataPoint;

  beforeEach(() => {
    processor = new StreamProcessor({
      batchSize: 10,
      flushInterval: 1000,
      maxQueueSize: 100,
      parallel: {
        workerCount: 2,
        batchSize: 5,
        processingTimeout: 5000
      }
    });

    mockDataPoint = {
      timestamp: Date.now(),
      metrics: {
        'test.percentage': 75.5,
        'test.count': 123.6,
        'test.rate': 0.456789,
        'test.value': 789.123
      },
      resources: {
        cpu: 45.6789,
        memory: 78.9012,
        disk: 34.5678,
        network: 89.0123
      },
      performance: {
        activeTraces: 123.4,
        activeSpans: 456.7,
        errorRate: 0.0123456,
        avgDuration: 234.5678
      }
    };
  });

  afterEach(() => {
    processor.stop();
  });

  test('initializes with parallel processing enabled', () => {
    const stats = processor.getStats();
    expect(stats.parallel).toBeDefined();
    expect(stats.parallel?.workerStats).toHaveLength(2);
  });

  test('processes data points using parallel processor', async () => {
    const processedEvents: Array<{
      batchSize: number;
      processingTime: number;
      compressionStats: any;
      aggregatedMetrics: Record<string, number>;
    }> = [];

    processor.on('processed', (event) => {
      processedEvents.push(event);
    });

    // 添加多个数据点
    const dataPoints = Array.from({ length: 25 }, (_, i) => ({
      ...mockDataPoint,
      timestamp: Date.now() + i * 1000,
      metrics: {
        ...mockDataPoint.metrics,
        [`metric_${i}`]: Math.random() * 100
      }
    }));

    for (const point of dataPoints) {
      await processor.addDataPoint(point);
    }

    // 等待处理完成
    await new Promise(resolve => setTimeout(resolve, 1500));

    expect(processedEvents.length).toBeGreaterThan(0);
    const lastEvent = processedEvents[processedEvents.length - 1];
    expect(lastEvent.aggregatedMetrics).toBeDefined();
    expect(Object.keys(lastEvent.aggregatedMetrics).length).toBeGreaterThan(0);
  });

  test('handles parallel processing errors gracefully', async () => {
    const errorEvents: Error[] = [];
    processor.on('error', (error) => {
      errorEvents.push(error);
    });

    // 添加导致错误的数据点
    const invalidDataPoint = {
      ...mockDataPoint,
      metrics: undefined as any
    };

    await processor.addDataPoint(invalidDataPoint);

    // 等待错误处理完成
    await new Promise(resolve => setTimeout(resolve, 200));

    expect(errorEvents.length).toBeGreaterThan(0);
    const stats = processor.getStats();
    expect(stats.errorCount).toBeGreaterThan(0);
  });

  test('maintains parallel processing statistics', async () => {
    // 添加数据点
    for (let i = 0; i < 20; i++) {
      await processor.addDataPoint({
        ...mockDataPoint,
        timestamp: Date.now() + i * 1000
      });
    }

    // 等待处理完成
    await new Promise(resolve => setTimeout(resolve, 1000));

    const stats = processor.getStats();
    expect(stats.parallel).toBeDefined();
    expect(stats.parallel?.processedCount).toBeGreaterThan(0);
    expect(stats.parallel?.avgProcessingTime).toBeGreaterThan(0);
    expect(stats.parallel?.workerStats.some(w => w.processedCount > 0)).toBe(true);
  });

  test('processes data with compression and parallel processing', async () => {
    const processedEvents: Array<{
      batchSize: number;
      processingTime: number;
      compressionStats: any;
      aggregatedMetrics: Record<string, number>;
    }> = [];

    processor.on('processed', (event) => {
      processedEvents.push(event);
    });

    // 添加大量数据点
    const largeDataPoints = Array.from({ length: 50 }, (_, i) => ({
      ...mockDataPoint,
      timestamp: Date.now() + i * 1000,
      metrics: {
        ...mockDataPoint.metrics,
        [`large_metric_${i}`]: Math.random() * 1000
      }
    }));

    for (const point of largeDataPoints) {
      await processor.addDataPoint(point);
    }

    // 等待处理完成
    await new Promise(resolve => setTimeout(resolve, 2000));

    expect(processedEvents.length).toBeGreaterThan(0);
    const lastEvent = processedEvents[processedEvents.length - 1];
    
    // 验证压缩效果
    expect(lastEvent.compressionStats.ratio).toBeGreaterThan(0);
    expect(lastEvent.compressionStats.savedBytes).toBeGreaterThan(0);

    // 验证聚合指标
    expect(lastEvent.aggregatedMetrics).toBeDefined();
    expect(Object.keys(lastEvent.aggregatedMetrics).length).toBeGreaterThan(0);
  });

  test('handles worker timeout in parallel processing', async () => {
    // 创建一个超时时间很短的处理器
    const timeoutProcessor = new StreamProcessor({
      parallel: {
        workerCount: 1,
        processingTimeout: 100
      }
    });

    const errorEvents: Error[] = [];
    timeoutProcessor.on('error', (error) => {
      errorEvents.push(error);
    });

    // 添加数据点
    await timeoutProcessor.addDataPoint(mockDataPoint);

    // 等待超时发生
    await new Promise(resolve => setTimeout(resolve, 200));

    const stats = timeoutProcessor.getStats();
    expect(stats.parallel?.errorCount).toBeGreaterThan(0);
    expect(errorEvents.length).toBeGreaterThan(0);

    timeoutProcessor.stop();
  });

  test('gracefully handles parallel processor shutdown', async () => {
    // 添加一些数据点
    for (let i = 0; i < 10; i++) {
      await processor.addDataPoint(mockDataPoint);
    }

    // 停止处理器
    processor.stop();

    const stats = processor.getStats();
    expect(stats.parallel?.activeWorkers).toBe(0);
    expect(stats.queueSize).toBe(0);
  });
}); 