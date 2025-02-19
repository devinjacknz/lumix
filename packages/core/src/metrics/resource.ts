import { MetricsCollector, MetricType } from './collector';
import { ResourceLimiter, ResourceType } from '../resource/limiter';

/**
 * 资源使用率收集器配置
 */
export interface ResourceMetricsConfig {
  // 收集间隔
  interval?: number;
  
  // 资源限制
  resourceLimiter?: ResourceLimiter;
  
  // 指标配置
  prefix?: string;
  labels?: Record<string, string>;
  
  // 告警阈值
  alertThresholds?: {
    cpu?: number;
    memory?: number;
    disk?: number;
    network?: number;
  };
}

/**
 * 资源使用率收集器
 */
export class ResourceMetricsCollector {
  private config: Required<ResourceMetricsConfig>;
  private collector: MetricsCollector;
  private resourceLimiter?: ResourceLimiter;
  private interval: NodeJS.Timer;

  constructor(config: ResourceMetricsConfig = {}) {
    this.config = {
      interval: config.interval || 5000, // 5秒
      resourceLimiter: config.resourceLimiter,
      prefix: config.prefix || 'resource',
      labels: config.labels || {},
      alertThresholds: {
        cpu: config.alertThresholds?.cpu || 80,
        memory: config.alertThresholds?.memory || 80,
        disk: config.alertThresholds?.disk || 80,
        network: config.alertThresholds?.network || 80
      }
    };

    this.collector = new MetricsCollector({
      commonLabels: this.config.labels
    });

    this.resourceLimiter = config.resourceLimiter;
    this.initializeMetrics();
    this.startCollection();
  }

  /**
   * 初始化指标
   */
  private initializeMetrics(): void {
    // CPU 指标
    this.collector.createMetric({
      name: `${this.config.prefix}_cpu_usage`,
      type: MetricType.GAUGE,
      description: 'CPU usage percentage',
      unit: 'percent',
      labels: ['core']
    });

    this.collector.createMetric({
      name: `${this.config.prefix}_cpu_load`,
      type: MetricType.GAUGE,
      description: 'System load average',
      unit: 'load'
    });

    // 内存指标
    this.collector.createMetric({
      name: `${this.config.prefix}_memory_usage`,
      type: MetricType.GAUGE,
      description: 'Memory usage',
      unit: 'bytes',
      labels: ['type']
    });

    this.collector.createMetric({
      name: `${this.config.prefix}_memory_usage_percent`,
      type: MetricType.GAUGE,
      description: 'Memory usage percentage',
      unit: 'percent'
    });

    // 磁盘指标
    this.collector.createMetric({
      name: `${this.config.prefix}_disk_usage`,
      type: MetricType.GAUGE,
      description: 'Disk usage',
      unit: 'bytes',
      labels: ['mount']
    });

    this.collector.createMetric({
      name: `${this.config.prefix}_disk_usage_percent`,
      type: MetricType.GAUGE,
      description: 'Disk usage percentage',
      unit: 'percent',
      labels: ['mount']
    });

    this.collector.createMetric({
      name: `${this.config.prefix}_disk_io`,
      type: MetricType.COUNTER,
      description: 'Disk I/O operations',
      unit: 'operations',
      labels: ['type', 'device']
    });

    // 网络指标
    this.collector.createMetric({
      name: `${this.config.prefix}_network_traffic`,
      type: MetricType.COUNTER,
      description: 'Network traffic',
      unit: 'bytes',
      labels: ['direction', 'interface']
    });

    this.collector.createMetric({
      name: `${this.config.prefix}_network_connections`,
      type: MetricType.GAUGE,
      description: 'Network connections',
      unit: 'connections',
      labels: ['state']
    });

    // GC 指标
    this.collector.createMetric({
      name: `${this.config.prefix}_gc_count`,
      type: MetricType.COUNTER,
      description: 'Garbage collection count',
      labels: ['type']
    });

    this.collector.createMetric({
      name: `${this.config.prefix}_gc_duration`,
      type: MetricType.HISTOGRAM,
      description: 'Garbage collection duration',
      unit: 'milliseconds',
      labels: ['type'],
      buckets: [10, 50, 100, 500, 1000, 5000]
    });
  }

  /**
   * 启动收集
   */
  private startCollection(): void {
    this.interval = setInterval(async () => {
      await this.collectCPUMetrics();
      await this.collectMemoryMetrics();
      await this.collectDiskMetrics();
      await this.collectNetworkMetrics();
      await this.collectGCMetrics();
    }, this.config.interval);
  }

  /**
   * 收集 CPU 指标
   */
  private async collectCPUMetrics(): Promise<void> {
    try {
      const cpuUsage = process.cpuUsage();
      const loadAvg = process.loadavg();

      // 记录 CPU 使用率
      const totalUsage = (cpuUsage.user + cpuUsage.system) / 1000000; // 转换为秒
      this.collector.record(`${this.config.prefix}_cpu_usage`, totalUsage);

      // 记录负载
      this.collector.record(`${this.config.prefix}_cpu_load`, loadAvg[0]);

      // 检查告警阈值
      if (totalUsage > this.config.alertThresholds.cpu) {
        this.emit('alert', {
          type: 'cpu',
          value: totalUsage,
          threshold: this.config.alertThresholds.cpu
        });
      }
    } catch (error) {
      this.emit('error', {
        type: 'cpu',
        error
      });
    }
  }

  /**
   * 收集内存指标
   */
  private async collectMemoryMetrics(): Promise<void> {
    try {
      const memoryUsage = process.memoryUsage();

      // 记录各类内存使用
      Object.entries(memoryUsage).forEach(([type, bytes]) => {
        this.collector.record(
          `${this.config.prefix}_memory_usage`,
          bytes,
          { type }
        );
      });

      // 计算内存使用百分比
      const totalMemory = memoryUsage.heapTotal;
      const usedMemory = memoryUsage.heapUsed;
      const usagePercent = (usedMemory / totalMemory) * 100;

      this.collector.record(
        `${this.config.prefix}_memory_usage_percent`,
        usagePercent
      );

      // 检查告警阈值
      if (usagePercent > this.config.alertThresholds.memory) {
        this.emit('alert', {
          type: 'memory',
          value: usagePercent,
          threshold: this.config.alertThresholds.memory
        });
      }
    } catch (error) {
      this.emit('error', {
        type: 'memory',
        error
      });
    }
  }

  /**
   * 收集磁盘指标
   */
  private async collectDiskMetrics(): Promise<void> {
    try {
      if (this.resourceLimiter) {
        const diskUsage = await this.resourceLimiter.getCurrentUsage(ResourceType.DISK);
        const maxDiskUsage = this.resourceLimiter.getMaxUsage(ResourceType.DISK);
        const usagePercent = (diskUsage / maxDiskUsage) * 100;

        this.collector.record(
          `${this.config.prefix}_disk_usage`,
          diskUsage,
          { mount: '/' }
        );

        this.collector.record(
          `${this.config.prefix}_disk_usage_percent`,
          usagePercent,
          { mount: '/' }
        );

        // 检查告警阈值
        if (usagePercent > this.config.alertThresholds.disk) {
          this.emit('alert', {
            type: 'disk',
            value: usagePercent,
            threshold: this.config.alertThresholds.disk
          });
        }
      }
    } catch (error) {
      this.emit('error', {
        type: 'disk',
        error
      });
    }
  }

  /**
   * 收集网络指标
   */
  private async collectNetworkMetrics(): Promise<void> {
    try {
      if (this.resourceLimiter) {
        const networkUsage = await this.resourceLimiter.getCurrentUsage(ResourceType.NETWORK);
        const maxNetworkUsage = this.resourceLimiter.getMaxUsage(ResourceType.NETWORK);
        const usagePercent = (networkUsage / maxNetworkUsage) * 100;

        this.collector.record(
          `${this.config.prefix}_network_traffic`,
          networkUsage,
          { direction: 'total', interface: 'all' }
        );

        // 检查告警阈值
        if (usagePercent > this.config.alertThresholds.network) {
          this.emit('alert', {
            type: 'network',
            value: usagePercent,
            threshold: this.config.alertThresholds.network
          });
        }
      }
    } catch (error) {
      this.emit('error', {
        type: 'network',
        error
      });
    }
  }

  /**
   * 收集 GC 指标
   */
  private async collectGCMetrics(): Promise<void> {
    try {
      // 注意：需要使用 --expose-gc 标志启动 Node.js
      if (global.gc) {
        const startTime = process.hrtime();
        global.gc();
        const [seconds, nanoseconds] = process.hrtime(startTime);
        const duration = seconds * 1000 + nanoseconds / 1000000;

        this.collector.record(
          `${this.config.prefix}_gc_count`,
          1,
          { type: 'manual' }
        );

        this.collector.record(
          `${this.config.prefix}_gc_duration`,
          duration,
          { type: 'manual' }
        );
      }
    } catch (error) {
      this.emit('error', {
        type: 'gc',
        error
      });
    }
  }

  /**
   * 获取指标收集器
   */
  getCollector(): MetricsCollector {
    return this.collector;
  }

  /**
   * 导出指标
   */
  export(format: 'prometheus' | 'json' | 'influx' = 'prometheus'): string {
    return this.collector.export();
  }

  /**
   * 停止收集
   */
  stop(): void {
    clearInterval(this.interval);
    this.collector.close();
  }

  /**
   * 事件处理
   */
  private emit(event: string, data: any): void {
    this.collector.emit(event, data);
  }
} 