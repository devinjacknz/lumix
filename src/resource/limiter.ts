import { Logger } from '../monitoring/logger';

export interface ResourceLimiterConfig {
  disk: {
    maxSize: number;
    path: string;
  };
  memory: {
    maxHeapSize: number;
    maxRss: number;
  };
  monitoring: {
    enabled: boolean;
    interval: number;
    alertThreshold: number;
  };
}

export interface ResourceStats {
  used: number;
  total: number;
  files: number;
}

export interface ResourceUsage {
  disk: ResourceStats;
  memory: ResourceStats;
  cpu: {
    usage: number;
    cores: number;
  };
}

export class ResourceLimiter {
  private config: Required<ResourceLimiterConfig>;
  private logger: Logger;
  private monitoringInterval?: NodeJS.Timer;

  constructor(config: ResourceLimiterConfig, logger: Logger) {
    this.config = {
      disk: {
        maxSize: config.disk?.maxSize || 1024 * 1024 * 1024, // 1GB
        path: config.disk?.path || '.',
      },
      memory: {
        maxHeapSize: config.memory?.maxHeapSize || 512 * 1024 * 1024, // 512MB
        maxRss: config.memory?.maxRss || 1024 * 1024 * 1024, // 1GB
      },
      monitoring: {
        enabled: config.monitoring?.enabled ?? true,
        interval: config.monitoring?.interval || 60000, // 1 minute
        alertThreshold: config.monitoring?.alertThreshold || 0.8, // 80%
      },
    };
    this.logger = logger;
  }

  async start(): Promise<void> {
    if (this.config.monitoring.enabled) {
      this.monitoringInterval = setInterval(
        () => this.monitor(),
        this.config.monitoring.interval
      );
    }
  }

  async stop(): Promise<void> {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
    }
  }

  private async monitor(): Promise<void> {
    try {
      const usage = await this.getResourceUsage();

      // Check disk usage
      const diskRatio = usage.disk.used / usage.disk.total;
      if (diskRatio > this.config.monitoring.alertThreshold) {
        this.logger.warn(
          'Resource',
          `High disk usage: ${Math.round(diskRatio * 100)}%`,
          { usage: usage.disk }
        );
      }

      // Check memory usage
      const memoryRatio = usage.memory.used / usage.memory.total;
      if (memoryRatio > this.config.monitoring.alertThreshold) {
        this.logger.warn(
          'Resource',
          `High memory usage: ${Math.round(memoryRatio * 100)}%`,
          { usage: usage.memory }
        );
      }

      // Check CPU usage
      if (usage.cpu.usage > this.config.monitoring.alertThreshold) {
        this.logger.warn(
          'Resource',
          `High CPU usage: ${Math.round(usage.cpu.usage * 100)}%`,
          { usage: usage.cpu }
        );
      }
    } catch (error) {
      this.logger.error(
        'Resource',
        `Resource monitoring error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { error }
      );
    }
  }

  private async getResourceUsage(): Promise<ResourceUsage> {
    const [disk, memory, cpu] = await Promise.all([
      this.getDiskUsage(),
      this.getMemoryUsage(),
      this.getCpuUsage(),
    ]);

    return {
      disk,
      memory,
      cpu,
    };
  }

  private async getDiskUsage(): Promise<ResourceStats> {
    // Implementation depends on platform
    // This is a placeholder that should be implemented
    return {
      used: 0,
      total: this.config.disk.maxSize,
      files: 0,
    };
  }

  private getMemoryUsage(): ResourceStats {
    const memoryUsage = process.memoryUsage();
    return {
      used: memoryUsage.heapUsed,
      total: this.config.memory.maxHeapSize,
      files: 0,
    };
  }

  private async getCpuUsage(): Promise<{ usage: number; cores: number }> {
    // Implementation depends on platform
    // This is a placeholder that should be implemented
    return {
      usage: 0,
      cores: 1,
    };
  }

  async checkDiskSpace(size: number): Promise<boolean> {
    const usage = await this.getDiskUsage();
    return usage.used + size <= usage.total;
  }

  async checkMemory(size: number): Promise<boolean> {
    const usage = this.getMemoryUsage();
    return usage.used + size <= usage.total;
  }
} 