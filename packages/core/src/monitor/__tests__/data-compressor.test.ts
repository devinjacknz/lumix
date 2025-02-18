import { DataCompressor } from '../data-compressor';
import { MonitorDataPoint } from '../realtime';

describe('DataCompressor', () => {
  let compressor: DataCompressor;
  let mockDataPoints: MonitorDataPoint[];

  beforeEach(() => {
    compressor = new DataCompressor({
      enabled: true,
      level: 6,
      threshold: 100
    });

    // 创建模拟数据点
    mockDataPoints = Array.from({ length: 10 }, (_, i) => ({
      timestamp: Date.now() + i * 1000,
      metrics: {
        'cpu.usage': 45.6789,
        'memory.usage': 78.9012,
        'disk.usage': 34.5678,
        'network.usage': 89.0123
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
        errorRate: 0.0123456,
        avgDuration: 123.4567
      }
    }));
  });

  test('initializes with correct configuration', () => {
    expect(compressor).toBeDefined();
    const stats = compressor.getStats();
    expect(stats.processedCount).toBe(0);
    expect(stats.compressionRatio).toBe(0);
  });

  test('compresses and decompresses data correctly', async () => {
    const compressed = await compressor.compress(mockDataPoints);
    expect(compressed).toBeInstanceOf(Buffer);

    const decompressed = await compressor.decompress(compressed);
    expect(decompressed).toHaveLength(mockDataPoints.length);
    expect(decompressed[0].timestamp).toBe(mockDataPoints[0].timestamp);
  });

  test('optimizes numeric values', async () => {
    const compressed = await compressor.compress(mockDataPoints);
    const decompressed = await compressor.decompress(compressed);

    // 检查数值优化
    expect(decompressed[0].resources.cpu).toBeCloseTo(45.7, 1);
    expect(decompressed[0].resources.memory).toBeCloseTo(78.9, 1);
    expect(decompressed[0].metrics['cpu.usage']).toBeCloseTo(45.68, 2);
    expect(decompressed[0].performance.errorRate).toBeCloseTo(0.0123, 4);
  });

  test('respects compression threshold', async () => {
    // 小数据不压缩
    const smallData = [mockDataPoints[0]];
    const compressed = await compressor.compress(smallData);
    const decompressed = await compressor.decompress(compressed);

    expect(decompressed).toHaveLength(1);
    expect(JSON.parse(compressed.toString())).toHaveLength(1);
  });

  test('handles compression errors gracefully', async () => {
    // 创建无效数据
    const invalidData = [{ ...mockDataPoints[0], metrics: undefined }];
    
    await expect(async () => {
      await compressor.compress(invalidData);
    }).rejects.toThrow();
  });

  test('handles decompression errors gracefully', async () => {
    // 创建无效的压缩数据
    const invalidBuffer = Buffer.from('invalid data');
    
    await expect(async () => {
      await compressor.decompress(invalidBuffer);
    }).rejects.toThrow();
  });

  test('maintains compression statistics', async () => {
    // 压缩大量数据
    const largeData = Array.from({ length: 100 }, () => mockDataPoints[0]);
    await compressor.compress(largeData);

    const stats = compressor.getStats();
    expect(stats.processedCount).toBe(1);
    expect(stats.originalSize).toBeGreaterThan(0);
    expect(stats.compressedSize).toBeGreaterThan(0);
    expect(stats.totalSaved).toBeGreaterThan(0);
    expect(stats.compressionRatio).toBeGreaterThan(0);
    expect(stats.avgCompressionTime).toBeGreaterThan(0);
  });

  test('disables compression when configured', async () => {
    const disabledCompressor = new DataCompressor({ enabled: false });
    const data = mockDataPoints;
    
    const result = await disabledCompressor.compress(data);
    expect(JSON.parse(result.toString())).toHaveLength(data.length);
  });

  test('optimizes all numeric fields correctly', async () => {
    const compressed = await compressor.compress(mockDataPoints);
    const decompressed = await compressor.decompress(compressed);
    const original = mockDataPoints[0];
    const optimized = decompressed[0];

    // 检查资源数据优化
    Object.entries(original.resources).forEach(([key, value]) => {
      expect(optimized.resources[key]).toBeCloseTo(value, 1);
    });

    // 检查指标数据优化
    Object.entries(original.metrics).forEach(([key, value]) => {
      expect(optimized.metrics[key]).toBeCloseTo(value, 2);
    });

    // 检查性能数据优化
    expect(optimized.performance.errorRate).toBeCloseTo(original.performance.errorRate, 4);
    expect(optimized.performance.avgDuration).toBeCloseTo(original.performance.avgDuration, 1);
    expect(optimized.performance.activeTraces).toBe(original.performance.activeTraces);
    expect(optimized.performance.activeSpans).toBe(original.performance.activeSpans);
  });
}); 