import { MetricsCollector, MetricConfig, MetricType } from './collector';

describe('MetricsCollector', () => {
  let collector: MetricsCollector;

  beforeEach(() => {
    collector = new MetricsCollector();
  });

  afterEach(() => {
    collector.clearMetrics();
  });

  it('should create a metric successfully', () => {
    const config: MetricConfig = {
      name: 'test_metric',
      type: MetricType.COUNTER,
      description: 'Test metric'
    };

    collector.createMetric(config);
    const metric = collector.getMetric('test_metric');
    
    expect(metric).toBeDefined();
    expect(metric?.config).toEqual(expect.objectContaining(config));
  });

  it('should record metric values correctly', () => {
    const config: MetricConfig = {
      name: 'test_metric',
      type: MetricType.GAUGE,
      description: 'Test metric',
      labels: ['label1']
    };

    collector.createMetric(config);
    collector.record('test_metric', 42, { label1: 'value1' });

    const metric = collector.getMetric('test_metric');
    expect(metric?.values).toHaveLength(1);
    expect(metric?.values[0]).toEqual(
      expect.objectContaining({
        value: 42,
        labels: expect.objectContaining({ label1: 'value1' })
      })
    );
  });

  it('should throw error for non-existent metric', () => {
    expect(() => {
      collector.record('non_existent', 42);
    }).toThrow('Metric non_existent not found');
  });

  it('should throw error for invalid metric value', () => {
    const config: MetricConfig = {
      name: 'test_metric',
      type: MetricType.GAUGE,
      description: 'Test metric'
    };

    collector.createMetric(config);
    expect(() => {
      collector.record('test_metric', NaN);
    }).toThrow('Invalid metric value');
  });

  it('should clear all metrics', () => {
    const config: MetricConfig = {
      name: 'test_metric',
      type: MetricType.COUNTER,
      description: 'Test metric'
    };

    collector.createMetric(config);
    collector.record('test_metric', 42);
    collector.clearMetrics();

    expect(collector.getAllMetrics().size).toBe(0);
  });
});