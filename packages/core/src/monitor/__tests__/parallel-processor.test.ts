import { ParallelProcessor } from '../parallel-processor';
import { MonitorDataPoint } from '../realtime';

describe('ParallelProcessor', () => {
  let processor: ParallelProcessor;
  let mockDataPoint: MonitorDataPoint;

  beforeEach(() => {
    processor = new ParallelProcessor({
      workerCount: 2,
      batchSize: 10,
      maxQueueSize: 100,
      processingTimeout: 5000
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

  afterEach(async () => {
    await processor.stop();
  });

  test('initializes with correct configuration', () => {
    const stats = processor.getStats();
    expect(stats.activeWorkers).toBe(0);
    expect(stats.processedCount).toBe(0);
    expect(stats.errorCount).toBe(0);
    expect(stats.queueSize).toBe(0);
    expect(stats.workerStats).toHaveLength(2);
  });

  test('processes data points in parallel', async () => {
    const processedBatches: Array<{
      processed: MonitorDataPoint[];
      aggregated: Record<string, number>;
    }> = [];

    processor.on('processingComplete', (result) => {
      processedBatches.push(result);
    });

    // 添加多个数据点
    const dataPoints = Array.from({ length: 25 }, (_, i) => ({
      ...mockDataPoint,
      timestamp: Date.now() + i * 1000
    }));

    for (const point of dataPoints) {
      await processor.addDataPoint(point);
    }

    // 等待处理完成
    await new Promise(resolve => setTimeout(resolve, 1000));

    const stats = processor.getStats();
    expect(stats.processedCount).toBeGreaterThan(0);
    expect(stats.queueSize).toBeLessThanOrEqual(5);
    expect(processedBatches.length).toBeGreaterThan(0);
  });

  test('respects queue size limit', async () => {
    // 添加超过队列限制的数据点
    const dataPoints = Array.from({ length: 150 }, (_, i) => ({
      ...mockDataPoint,
      timestamp: Date.now() + i * 1000
    }));

    for (const point of dataPoints) {
      await processor.addDataPoint(point);
    }

    const stats = processor.getStats();
    expect(stats.queueSize).toBeLessThanOrEqual(100);
  });

  test('handles worker errors gracefully', async () => {
    // 模拟工作线程错误
    const worker = processor['workers'][0].worker;
    worker.emit('error', new Error('Test error'));

    // 等待错误处理完成
    await new Promise(resolve => setTimeout(resolve, 100));

    const stats = processor.getStats();
    expect(stats.errorCount).toBe(1);
    expect(stats.workerStats[0].processedCount).toBe(0);
  });

  test('handles processing timeout', async () => {
    // 创建一个处理超时的处理器
    const timeoutProcessor = new ParallelProcessor({
      workerCount: 1,
      processingTimeout: 100
    });

    // 添加数据点并等待超时
    await timeoutProcessor.addDataPoint(mockDataPoint);
    await new Promise(resolve => setTimeout(resolve, 200));

    const stats = timeoutProcessor.getStats();
    expect(stats.errorCount).toBeGreaterThan(0);

    await timeoutProcessor.stop();
  });

  test('maintains worker statistics', async () => {
    // 添加少量数据点
    for (let i = 0; i < 5; i++) {
      await processor.addDataPoint({
        ...mockDataPoint,
        timestamp: Date.now() + i * 1000
      });
    }

    // 等待处理完成
    await new Promise(resolve => setTimeout(resolve, 500));

    const stats = processor.getStats();
    expect(stats.workerStats).toHaveLength(2);
    expect(stats.workerStats.some(w => w.processedCount > 0)).toBe(true);
    expect(stats.workerStats.every(w => w.avgProcessingTime >= 0)).toBe(true);
  });

  test('processes data with correct rules', async () => {
    const processedData: MonitorDataPoint[] = [];
    
    processor.on('processingComplete', (result) => {
      processedData.push(...result.processed);
    });

    await processor.addDataPoint(mockDataPoint);

    // 等待处理完成
    await new Promise(resolve => setTimeout(resolve, 200));

    const processedPoint = processedData[0];
    expect(processedPoint).toBeDefined();

    // 验证指标处理规则
    expect(processedPoint.metrics['test.percentage']).toBeLessThanOrEqual(100);
    expect(Number.isInteger(processedPoint.metrics['test.count'])).toBe(true);
    expect(processedPoint.metrics['test.rate']).toBeLessThanOrEqual(1);
    expect(processedPoint.metrics['test.value'].toString()).toMatch(/^\d+\.\d{2}$/);

    // 验证资源数据处理
    Object.values(processedPoint.resources).forEach(value => {
      expect(value).toBeLessThanOrEqual(100);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value.toString()).toMatch(/^\d+\.\d{1}$/);
    });

    // 验证性能数据处理
    expect(Number.isInteger(processedPoint.performance.activeTraces)).toBe(true);
    expect(Number.isInteger(processedPoint.performance.activeSpans)).toBe(true);
    expect(processedPoint.performance.errorRate).toBeLessThanOrEqual(1);
    expect(processedPoint.performance.avgDuration.toString()).toMatch(/^\d+\.\d{1}$/);
  });

  test('calculates aggregated metrics correctly', async () => {
    const aggregatedResults: Record<string, number>[] = [];
    
    processor.on('processingComplete', (result) => {
      aggregatedResults.push(result.aggregated);
    });

    // 添加多个具有不同值的数据点
    const dataPoints = Array.from({ length: 5 }, (_, i) => ({
      ...mockDataPoint,
      metrics: {
        'test.value': 10 * (i + 1)
      }
    }));

    for (const point of dataPoints) {
      await processor.addDataPoint(point);
    }

    // 等待处理完成
    await new Promise(resolve => setTimeout(resolve, 500));

    const lastAggregated = aggregatedResults[aggregatedResults.length - 1];
    expect(lastAggregated).toBeDefined();
    expect(lastAggregated['test.value_avg']).toBeDefined();
    expect(lastAggregated['test.value_max']).toBeDefined();
    expect(lastAggregated['test.value_min']).toBeDefined();
    expect(lastAggregated['test.value_sum']).toBeDefined();
  });
}); 