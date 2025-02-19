import { describe, expect, test, beforeEach, afterEach } from '@jest/globals';
import { 
  MetricsCollector, 
  MetricType, 
  MetricConfig, 
  MetricsCollectorError,
  Metric 
} from '@lumix/core/metrics/collector';

describe('MetricsCollector', () => {
  let collector: MetricsCollector;

  beforeEach(() => {
    collector = new MetricsCollector({
      maxMetrics: 10,
      maxValuesPerMetric: 5,
      cleanupInterval: 1000,
      aggregationInterval: 500,
      defaultBuckets: [0.1, 1, 10],
      defaultQuantiles: [0.5, 0.9],
      commonLabels: { env: 'test' },
      maxLabels: 5
    });
  });

  afterEach(() => {
    collector.clearMetrics();
  });

  describe('创建指标', () => {
    test('应该能够创建有效的指标', () => {
      const config: MetricConfig = {
        name: 'test_metric',
        type: MetricType.COUNTER,
        description: 'Test metric',
        labels: ['label1', 'label2']
      };

      collector.createMetric(config);
      const metric = collector.getMetric('test_metric');

      expect(metric).toBeDefined();
      expect(metric?.config).toEqual({
        ...config,
        buckets: [0.1, 1, 10],
        quantiles: [0.5, 0.9]
      });
      expect(metric?.values).toEqual([]);
    });

    test('创建指标时应该验证名称', () => {
      const config: MetricConfig = {
        name: '',
        type: MetricType.COUNTER,
        description: 'Test metric'
      };

      expect(() => collector.createMetric(config))
        .toThrow(MetricsCollectorError);
    });

    test('应该限制指标数量', () => {
      // 创建最大数量的指标
      for (let i = 0; i < 10; i++) {
        collector.createMetric({
          name: `metric_${i}`,
          type: MetricType.COUNTER,
          description: `Metric ${i}`
        });
      }

      // 尝试创建超出限制的指标
      expect(() => collector.createMetric({
        name: 'one_more_metric',
        type: MetricType.COUNTER,
        description: 'One more metric'
      })).toThrow(MetricsCollectorError);
    });
  });

  describe('记录指标值', () => {
    beforeEach(() => {
      collector.createMetric({
        name: 'test_counter',
        type: MetricType.COUNTER,
        description: 'Test counter',
        labels: ['service']
      });

      collector.createMetric({
        name: 'test_gauge',
        type: MetricType.GAUGE,
        description: 'Test gauge'
      });
    });

    test('应该能够记录有效的指标值', () => {
      collector.record('test_counter', 1, { service: 'api' });
      const metric = collector.getMetric('test_counter');

      expect(metric?.values.length).toBe(1);
      expect(metric?.values[0]).toMatchObject({
        value: 1,
        labels: {
          env: 'test',
          service: 'api'
        },
        timestamp: expect.any(Number)
      });
    });

    test('记录值时应该验证指标存在', () => {
      expect(() => collector.record('non_existent', 1))
        .toThrow(MetricsCollectorError);
    });

    test('应该验证指标值的有效性', () => {
      expect(() => collector.record('test_counter', NaN))
        .toThrow(MetricsCollectorError);
      expect(() => collector.record('test_counter', Infinity))
        .toThrow(MetricsCollectorError);
    });

    test('应该验证必需的标签', () => {
      expect(() => collector.record('test_counter', 1))
        .toThrow(MetricsCollectorError);
      expect(() => collector.record('test_counter', 1, {}))
        .toThrow(MetricsCollectorError);
    });

    test('应该限制每个指标的值数量', async () => {
      // 记录超过限制的值
      for (let i = 0; i < 6; i++) {
        collector.record('test_gauge', i);
      }

      const metric = collector.getMetric('test_gauge');
      expect(metric?.values.length).toBe(5);
      // 确保保留最新的值
      expect(metric?.values[metric.values.length - 1].value).toBe(5);
    });
  });

  describe('清理和聚合', () => {
    beforeEach(() => {
      collector.createMetric({
        name: 'test_cleanup',
        type: MetricType.COUNTER,
        description: 'Test cleanup'
      });
    });

    test('应该清理旧数据', async () => {
      // 记录一些值
      collector.record('test_cleanup', 1);
      
      // 等待清理间隔
      await new Promise(resolve => setTimeout(resolve, 1100));
      
      const metric = collector.getMetric('test_cleanup');
      expect(metric?.values.length).toBe(0);
    });

    test('应该能够清理所有指标', () => {
      collector.record('test_cleanup', 1);
      collector.clearMetrics();
      
      expect(collector.getAllMetrics().size).toBe(0);
    });
  });
}); 