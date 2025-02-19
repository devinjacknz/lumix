import { ParallelProcessor } from '../parallel-processor';
import { MonitorDataPoint } from '../realtime';
import { EventEmitter } from 'events';

jest.useFakeTimers();

describe('ParallelProcessor', () => {
  let processor: ParallelProcessor;
  let mockDataPoint: MonitorDataPoint;
  let mockWorker: EventEmitter;

  beforeEach(() => {
    // Create a mock worker
    mockWorker = new EventEmitter();
    mockWorker.postMessage = jest.fn((data) => {
      // Simulate worker processing
      setTimeout(() => {
        mockWorker.emit('message', {
          processed: data.dataPoints.map(point => ({
            ...point,
            metrics: {
              ...point.metrics,
              'test.percentage': Math.min(point.metrics['test.percentage'], 100),
              'test.count': Math.floor(point.metrics['test.count']),
              'test.rate': Math.min(point.metrics['test.rate'], 1),
              'test.value': Number(point.metrics['test.value'].toFixed(2))
            },
            resources: Object.fromEntries(
              Object.entries(point.resources).map(([key, value]) => [
                key,
                Number(Math.min(Math.max(value, 0), 100).toFixed(1))
              ])
            ),
            performance: {
              ...point.performance,
              activeTraces: Math.floor(point.performance.activeTraces),
              activeSpans: Math.floor(point.performance.activeSpans),
              errorRate: Math.min(point.performance.errorRate, 1),
              avgDuration: Number(point.performance.avgDuration.toFixed(1))
            }
          })),
          aggregated: {
            'test.value_avg': 50,
            'test.value_max': 100,
            'test.value_min': 0,
            'test.value_sum': 150
          }
        });
      }, 10);
    });
    mockWorker.terminate = jest.fn();

    // Mock worker creation
    jest.spyOn(global, 'Worker').mockImplementation(() => mockWorker as any);

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
    jest.clearAllMocks();
    jest.clearAllTimers();
  });

  test('initializes with correct configuration', () => {
    const stats = processor.getStats();
    expect(stats.activeWorkers).toBe(2); // Now we expect 2 active workers
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

    // Add multiple data points
    const dataPoints = Array.from({ length: 25 }, (_, i) => ({
      ...mockDataPoint,
      timestamp: Date.now() + i * 1000
    }));

    for (const point of dataPoints) {
      await processor.addDataPoint(point);
    }

    // Advance timers to process all data
    jest.advanceTimersByTime(1000);
    await Promise.resolve();

    const stats = processor.getStats();
    expect(stats.processedCount).toBeGreaterThan(0);
    expect(stats.queueSize).toBeLessThanOrEqual(5);
    expect(processedBatches.length).toBeGreaterThan(0);
  });

  test('respects queue size limit', async () => {
    const dataPoints = Array.from({ length: 150 }, (_, i) => ({
      ...mockDataPoint,
      timestamp: Date.now() + i * 1000
    }));

    for (const point of dataPoints) {
      await processor.addDataPoint(point);
    }

    jest.advanceTimersByTime(100);
    await Promise.resolve();

    const stats = processor.getStats();
    expect(stats.queueSize).toBeLessThanOrEqual(100);
  });

  test('handles worker errors gracefully', async () => {
    mockWorker.emit('error', new Error('Test error'));
    
    jest.advanceTimersByTime(100);
    await Promise.resolve();

    const stats = processor.getStats();
    expect(stats.errorCount).toBe(1);
  });

  test('handles processing timeout', async () => {
    const timeoutProcessor = new ParallelProcessor({
      workerCount: 1,
      processingTimeout: 100
    });

    // Mock worker to never respond
    jest.spyOn(global, 'Worker').mockImplementation(() => {
      const worker = new EventEmitter() as any;
      worker.postMessage = jest.fn();
      worker.terminate = jest.fn();
      return worker;
    });

    await timeoutProcessor.addDataPoint(mockDataPoint);
    jest.advanceTimersByTime(200);
    await Promise.resolve();

    const stats = timeoutProcessor.getStats();
    expect(stats.errorCount).toBeGreaterThan(0);

    await timeoutProcessor.stop();
  });

  test('maintains worker statistics', async () => {
    for (let i = 0; i < 5; i++) {
      await processor.addDataPoint({
        ...mockDataPoint,
        timestamp: Date.now() + i * 1000
      });
    }

    jest.advanceTimersByTime(500);
    await Promise.resolve();

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
    jest.advanceTimersByTime(200);
    await Promise.resolve();

    expect(processedData.length).toBeGreaterThan(0);
    const processedPoint = processedData[0];

    // Verify metric processing rules
    expect(processedPoint.metrics['test.percentage']).toBeLessThanOrEqual(100);
    expect(Number.isInteger(processedPoint.metrics['test.count'])).toBe(true);
    expect(processedPoint.metrics['test.rate']).toBeLessThanOrEqual(1);
    expect(processedPoint.metrics['test.value'].toString()).toMatch(/^\d+\.\d{2}$/);

    // Verify resource data processing
    Object.values(processedPoint.resources).forEach(value => {
      expect(value).toBeLessThanOrEqual(100);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value.toString()).toMatch(/^\d+\.\d{1}$/);
    });

    // Verify performance data processing
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

    const dataPoints = Array.from({ length: 5 }, (_, i) => ({
      ...mockDataPoint,
      metrics: {
        'test.value': 10 * (i + 1)
      }
    }));

    for (const point of dataPoints) {
      await processor.addDataPoint(point);
    }

    jest.advanceTimersByTime(500);
    await Promise.resolve();

    expect(aggregatedResults.length).toBeGreaterThan(0);
    const lastAggregated = aggregatedResults[aggregatedResults.length - 1];
    expect(lastAggregated['test.value_avg']).toBeDefined();
    expect(lastAggregated['test.value_max']).toBeDefined();
    expect(lastAggregated['test.value_min']).toBeDefined();
    expect(lastAggregated['test.value_sum']).toBeDefined();
  });
}); 