import { MetricsCollector, MetricType } from '../collector';

describe('MetricsCollector', () => {
  let collector: MetricsCollector;
  const mockConfig = {
    maxMetrics: 100,
    maxValuesPerMetric: 1000,
    cleanupInterval: 1000,
    aggregationInterval: 500,
    defaultBuckets: [0.1, 0.5, 1, 2, 5, 10],
    defaultQuantiles: [0.5, 0.9, 0.95, 0.99],
    commonLabels: {},
    maxLabels: 10,
    exportFormat: 'prometheus' as const,
    timestampPrecision: 'ms' as const
  };

  beforeEach(() => {
    collector = new MetricsCollector(mockConfig);
  });

  afterEach(() => {
    collector.clearMetrics();
  });

  test('creates and records counter metric', () => {
    collector.createMetric({
      name: 'test_counter',
      type: MetricType.COUNTER,
      description: 'Test counter'
    });

    collector.record('test_counter', 1);
    collector.record('test_counter', 1);

    const metric = collector.getMetric('test_counter');
    expect(metric).toBeDefined();
    expect(metric!.values.length).toBe(2);
    expect(metric!.values[0].value).toBe(1);
    expect(metric!.values[1].value).toBe(1);
  });

  test('creates and records gauge metric', () => {
    collector.createMetric({
      name: 'test_gauge',
      type: MetricType.GAUGE,
      description: 'Test gauge'
    });

    collector.record('test_gauge', 50);
    collector.record('test_gauge', 75);

    const metric = collector.getMetric('test_gauge');
    expect(metric).toBeDefined();
    expect(metric!.values.length).toBe(2);
    expect(metric!.values[1].value).toBe(75);
  });

  test('creates and records histogram metric', () => {
    collector.createMetric({
      name: 'test_histogram',
      type: MetricType.HISTOGRAM,
      description: 'Test histogram',
      buckets: [10, 20, 30]
    });

    collector.record('test_histogram', 10);
    collector.record('test_histogram', 20);
    collector.record('test_histogram', 30);

    const metric = collector.getMetric('test_histogram');
    expect(metric).toBeDefined();
    expect(metric!.values.length).toBe(3);
    expect(metric!.config.buckets).toEqual([10, 20, 30]);
  });

  test('handles labels correctly', () => {
    collector.createMetric({
      name: 'test_counter',
      type: MetricType.COUNTER,
      description: 'Test counter',
      labels: ['service']
    });

    collector.record('test_counter', 1, { service: 'api' });
    collector.record('test_counter', 1, { service: 'web' });

    const metric = collector.getMetric('test_counter');
    expect(metric).toBeDefined();
    expect(metric!.values.length).toBe(2);
    expect(metric!.values[0].labels).toEqual({ service: 'api' });
    expect(metric!.values[1].labels).toEqual({ service: 'web' });
  });

  test('validates metric names', () => {
    expect(() => collector.createMetric({
      name: '',
      type: MetricType.COUNTER,
      description: 'Invalid metric'
    })).toThrow();
  });

  test('validates metric values', () => {
    collector.createMetric({
      name: 'test',
      type: MetricType.GAUGE,
      description: 'Test gauge'
    });

    expect(() => collector.record('test', NaN)).toThrow();
  });

  test('validates label values', () => {
    collector.createMetric({
      name: 'test',
      type: MetricType.COUNTER,
      description: 'Test counter',
      labels: ['service']
    });

    expect(() => collector.record('test', 1, { '': 'invalid' })).toThrow();
  });

  test('maintains type consistency', () => {
    collector.createMetric({
      name: 'test_metric',
      type: MetricType.COUNTER,
      description: 'Test counter'
    });

    collector.record('test_metric', 1);
    collector.record('test_metric', 1);

    const metric = collector.getMetric('test_metric');
    expect(metric).toBeDefined();
    expect(metric!.config.type).toBe(MetricType.COUNTER);
    expect(metric!.values.length).toBe(2);
  });

  test('handles high throughput', async () => {
    collector.createMetric({
      name: 'high_throughput',
      type: MetricType.COUNTER,
      description: 'High throughput counter'
    });

    const iterations = 1000;
    const promises = [];

    for (let i = 0; i < iterations; i++) {
      promises.push(collector.record('high_throughput', 1));
    }

    await Promise.all(promises);

    const metric = collector.getMetric('high_throughput');
    expect(metric).toBeDefined();
    expect(metric!.values.length).toBe(iterations);
  });
});