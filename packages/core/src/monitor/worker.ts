import { parentPort } from 'worker_threads';
import { MonitorDataPoint } from './realtime';

if (!parentPort) {
  throw new Error('This file must be run as a worker thread');
}

/**
 * 处理数据批次
 */
async function processBatch(batch: MonitorDataPoint[]): Promise<void> {
  try {
    // 对每个数据点进行处理
    const processedData = batch.map(point => ({
      ...point,
      metrics: processMetrics(point.metrics),
      resources: processResources(point.resources),
      performance: processPerformance(point.performance)
    }));

    // 计算聚合指标
    const aggregatedMetrics = calculateAggregatedMetrics(processedData);
    
    // 发送处理结果
    parentPort!.postMessage({
      success: true,
      data: {
        processed: processedData,
        aggregated: aggregatedMetrics
      }
    });
  } catch (error) {
    parentPort!.postMessage({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * 处理指标数据
 */
function processMetrics(metrics: Record<string, number>): Record<string, number> {
  const processed: Record<string, number> = {};
  
  for (const [key, value] of Object.entries(metrics)) {
    // 应用指标处理规则
    processed[key] = applyMetricRules(key, value);
  }
  
  return processed;
}

/**
 * 应用指标处理规则
 */
function applyMetricRules(key: string, value: number): number {
  // 根据指标类型应用不同的处理规则
  if (key.includes('percentage')) {
    return Math.min(100, Math.max(0, value));
  }
  if (key.includes('count')) {
    return Math.max(0, Math.round(value));
  }
  if (key.includes('rate')) {
    return Math.max(0, Number(value.toFixed(4)));
  }
  return Number(value.toFixed(2));
}

/**
 * 处理资源数据
 */
function processResources(resources: MonitorDataPoint['resources']): MonitorDataPoint['resources'] {
  return {
    cpu: Math.min(100, Math.max(0, Number(resources.cpu.toFixed(1)))),
    memory: Math.min(100, Math.max(0, Number(resources.memory.toFixed(1)))),
    disk: Math.min(100, Math.max(0, Number(resources.disk.toFixed(1)))),
    network: Math.min(100, Math.max(0, Number(resources.network.toFixed(1))))
  };
}

/**
 * 处理性能数据
 */
function processPerformance(performance: MonitorDataPoint['performance']): MonitorDataPoint['performance'] {
  return {
    activeTraces: Math.max(0, Math.round(performance.activeTraces)),
    activeSpans: Math.max(0, Math.round(performance.activeSpans)),
    errorRate: Math.min(1, Math.max(0, Number(performance.errorRate.toFixed(4)))),
    avgDuration: Math.max(0, Number(performance.avgDuration.toFixed(1)))
  };
}

/**
 * 计算聚合指标
 */
function calculateAggregatedMetrics(data: MonitorDataPoint[]): Record<string, number> {
  const metrics: Record<string, number[]> = {};
  
  // 收集所有指标
  for (const point of data) {
    for (const [key, value] of Object.entries(point.metrics)) {
      if (!metrics[key]) {
        metrics[key] = [];
      }
      metrics[key].push(value);
    }
  }

  // 计算聚合值
  const aggregated: Record<string, number> = {};
  for (const [key, values] of Object.entries(metrics)) {
    aggregated[`${key}_avg`] = calculateAverage(values);
    aggregated[`${key}_max`] = Math.max(...values);
    aggregated[`${key}_min`] = Math.min(...values);
    aggregated[`${key}_sum`] = values.reduce((a, b) => a + b, 0);
  }

  return aggregated;
}

/**
 * 计算平均值
 */
function calculateAverage(values: number[]): number {
  if (values.length === 0) return 0;
  const sum = values.reduce((a, b) => a + b, 0);
  return Number((sum / values.length).toFixed(2));
}

// 监听消息
parentPort.on('message', async ({ batch }: { batch: MonitorDataPoint[] }) => {
  await processBatch(batch);
}); 