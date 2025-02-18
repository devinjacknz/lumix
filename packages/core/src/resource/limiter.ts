import { EventEmitter } from 'events';
import { BaseError } from '../types/errors';
import { MemoryPool, MemoryPoolStats } from '../memory/pool';

/**
 * 资源限制器错误
 */
export class ResourceLimiterError extends BaseError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ResourceLimiterError';
  }
}

/**
 * 资源类型
 */
export enum ResourceType {
  CPU = 'cpu',
  MEMORY = 'memory',
  DISK = 'disk',
  NETWORK = 'network'
}

/**
 * 资源限制配置
 */
export interface ResourceLimitConfig {
  // CPU 限制
  cpu?: {
    maxUsage?: number;
    maxCores?: number;
    priority?: number;
  };

  // 内存限制
  memory?: {
    maxHeapSize?: number;
    maxRss?: number;
    maxStack?: number;
    pool?: MemoryPool;
  };

  // 磁盘限制
  disk?: {
    maxSize?: number;
    maxFiles?: number;
    maxFileSize?: number;
    allowedPaths?: string[];
  };

  // 网络限制
  network?: {
    maxConnections?: number;
    maxBandwidth?: number;
    maxRequests?: number;
    allowedHosts?: string[];
  };

  // 监控配置
  monitoring?: {
    enabled?: boolean;
    interval?: number;
    alertThreshold?: number;
  };
}

/**
 * 资源使用统计
 */
export interface ResourceUsageStats {
  cpu: {
    usage: number;
    cores: number;
    load: number;
  };
  memory: {
    heapUsed: number;
    heapTotal: number;
    rss: number;
    external: number;
    pool?: MemoryPoolStats;
  };
  disk: {
    used: number;
    total: number;
    files: number;
  };
  network: {
    connections: number;
    bandwidth: number;
    requests: number;
  };
  timestamp: number;
}

/**
 * 资源限制器
 */
export class ResourceLimiter extends EventEmitter {
  private config: Required<ResourceLimitConfig>;
  private memoryPool?: MemoryPool;
  private monitoringInterval?: NodeJS.Timer;
  private resourceUsage: Map<ResourceType, number>;
  private lastCheck: Map<ResourceType, number>;

  constructor(config: ResourceLimitConfig = {}) {
    super();
    this.config = {
      cpu: {
        maxUsage: config.cpu?.maxUsage || 0.8,
        maxCores: config.cpu?.maxCores || require('os').cpus().length,
        priority: config.cpu?.priority || 0
      },
      memory: {
        maxHeapSize: config.memory?.maxHeapSize || 1024 * 1024 * 1024, // 1GB
        maxRss: config.memory?.maxRss || 2 * 1024 * 1024 * 1024, // 2GB
        maxStack: config.memory?.maxStack || 1024 * 1024, // 1MB
        pool: config.memory?.pool
      },
      disk: {
        maxSize: config.disk?.maxSize || 10 * 1024 * 1024 * 1024, // 10GB
        maxFiles: config.disk?.maxFiles || 1000,
        maxFileSize: config.disk?.maxFileSize || 100 * 1024 * 1024, // 100MB
        allowedPaths: config.disk?.allowedPaths || []
      },
      network: {
        maxConnections: config.network?.maxConnections || 100,
        maxBandwidth: config.network?.maxBandwidth || 100 * 1024 * 1024, // 100MB/s
        maxRequests: config.network?.maxRequests || 1000,
        allowedHosts: config.network?.allowedHosts || []
      },
      monitoring: {
        enabled: config.monitoring?.enabled || false,
        interval: config.monitoring?.interval || 5000,
        alertThreshold: config.monitoring?.alertThreshold || 0.9
      }
    };

    this.memoryPool = this.config.memory.pool;
    this.resourceUsage = new Map();
    this.lastCheck = new Map();

    if (this.config.monitoring.enabled) {
      this.startMonitoring();
    }
  }

  /**
   * 检查资源限制
   */
  async checkLimit(
    type: ResourceType,
    amount: number
  ): Promise<boolean> {
    const currentUsage = await this.getCurrentUsage(type);
    const maxUsage = this.getMaxUsage(type);

    if (currentUsage + amount > maxUsage) {
      this.emit('limitExceeded', {
        type,
        current: currentUsage,
        requested: amount,
        max: maxUsage
      });
      return false;
    }

    return true;
  }

  /**
   * 分配资源
   */
  async allocate(
    type: ResourceType,
    amount: number
  ): Promise<void> {
    if (!await this.checkLimit(type, amount)) {
      throw new ResourceLimiterError(
        `Resource limit exceeded for ${type}`
      );
    }

    const currentUsage = this.resourceUsage.get(type) || 0;
    this.resourceUsage.set(type, currentUsage + amount);
    this.lastCheck.set(type, Date.now());

    this.emit('resourceAllocated', {
      type,
      amount,
      current: currentUsage + amount
    });
  }

  /**
   * 释放资源
   */
  release(type: ResourceType, amount: number): void {
    const currentUsage = this.resourceUsage.get(type) || 0;
    const newUsage = Math.max(0, currentUsage - amount);
    this.resourceUsage.set(type, newUsage);

    this.emit('resourceReleased', {
      type,
      amount,
      current: newUsage
    });
  }

  /**
   * 获取当前资源使用情况
   */
  private async getCurrentUsage(type: ResourceType): Promise<number> {
    const lastUsage = this.resourceUsage.get(type) || 0;
    const lastCheck = this.lastCheck.get(type) || 0;
    const now = Date.now();

    // 如果最后检查时间超过监控间隔，重新获取使用情况
    if (now - lastCheck > this.config.monitoring.interval) {
      const usage = await this.measureResourceUsage(type);
      this.resourceUsage.set(type, usage);
      this.lastCheck.set(type, now);
      return usage;
    }

    return lastUsage;
  }

  /**
   * 获取资源限制
   */
  private getMaxUsage(type: ResourceType): number {
    switch (type) {
      case ResourceType.CPU:
        return this.config.cpu.maxUsage * this.config.cpu.maxCores;
      case ResourceType.MEMORY:
        return this.config.memory.maxHeapSize;
      case ResourceType.DISK:
        return this.config.disk.maxSize;
      case ResourceType.NETWORK:
        return this.config.network.maxBandwidth;
      default:
        throw new ResourceLimiterError(`Unknown resource type: ${type}`);
    }
  }

  /**
   * 测量资源使用情况
   */
  private async measureResourceUsage(type: ResourceType): Promise<number> {
    switch (type) {
      case ResourceType.CPU:
        return this.measureCPUUsage();
      case ResourceType.MEMORY:
        return this.measureMemoryUsage();
      case ResourceType.DISK:
        return this.measureDiskUsage();
      case ResourceType.NETWORK:
        return this.measureNetworkUsage();
      default:
        throw new ResourceLimiterError(`Unknown resource type: ${type}`);
    }
  }

  /**
   * 测量 CPU 使用情况
   */
  private async measureCPUUsage(): Promise<number> {
    const usage = process.cpuUsage();
    return (usage.user + usage.system) / 1000000; // 转换为秒
  }

  /**
   * 测量内存使用情况
   */
  private measureMemoryUsage(): number {
    const usage = process.memoryUsage();
    return usage.heapUsed;
  }

  /**
   * 测量磁盘使用情况
   */
  private async measureDiskUsage(): Promise<number> {
    // 这里需要实现实际的磁盘使用测量
    // 可以使用 fs.statSync 或其他工具
    return 0;
  }

  /**
   * 测量网络使用情况
   */
  private async measureNetworkUsage(): Promise<number> {
    // 这里需要实现实际的网络使用测量
    // 可以使用 net 模块或其他工具
    return 0;
  }

  /**
   * 获取资源使用统计
   */
  async getStats(): Promise<ResourceUsageStats> {
    const cpuUsage = await this.measureCPUUsage();
    const memUsage = process.memoryUsage();

    return {
      cpu: {
        usage: cpuUsage,
        cores: this.config.cpu.maxCores,
        load: cpuUsage / this.config.cpu.maxCores
      },
      memory: {
        heapUsed: memUsage.heapUsed,
        heapTotal: memUsage.heapTotal,
        rss: memUsage.rss,
        external: memUsage.external,
        pool: this.memoryPool?.getStats()
      },
      disk: {
        used: await this.measureDiskUsage(),
        total: this.config.disk.maxSize,
        files: 0 // 需要实现文件计数
      },
      network: {
        connections: 0, // 需要实现连接计数
        bandwidth: await this.measureNetworkUsage(),
        requests: 0 // 需要实现请求计数
      },
      timestamp: Date.now()
    };
  }

  /**
   * 启动资源监控
   */
  private startMonitoring(): void {
    this.monitoringInterval = setInterval(async () => {
      const stats = await this.getStats();
      this.emit('stats', stats);

      // 检查资源使用是否超过阈值
      for (const type of Object.values(ResourceType)) {
        const usage = await this.getCurrentUsage(type);
        const maxUsage = this.getMaxUsage(type);
        const ratio = usage / maxUsage;

        if (ratio > this.config.monitoring.alertThreshold) {
          this.emit('resourceAlert', {
            type,
            usage,
            max: maxUsage,
            ratio
          });
        }
      }
    }, this.config.monitoring.interval);
  }

  /**
   * 停止资源监控
   */
  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }
  }

  /**
   * 更新资源限制配置
   */
  updateConfig(config: Partial<ResourceLimitConfig>): void {
    this.config = {
      ...this.config,
      ...config,
      cpu: { ...this.config.cpu, ...config.cpu },
      memory: { ...this.config.memory, ...config.memory },
      disk: { ...this.config.disk, ...config.disk },
      network: { ...this.config.network, ...config.network },
      monitoring: { ...this.config.monitoring, ...config.monitoring }
    };
  }

  /**
   * 关闭资源限制器
   */
  close(): void {
    this.stopMonitoring();
    this.resourceUsage.clear();
    this.lastCheck.clear();
    this.emit('closed');
  }
} 