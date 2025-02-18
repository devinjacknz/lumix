import { Logger } from './logger';
import { MetricsService } from './metrics';
import { AlertManager, AlertType, AlertSeverity } from './alerts';
import { configManager } from '../config';
import { messagingMiddleware } from '../messaging';
import { EventType } from '../messaging/types';
import { DatabaseManager } from '../database';
import { chainAdapterFactory } from '../chain';
import os from 'os';
import { SystemMetrics } from './types';

// 创建实例
const logger = Logger.getInstance();
const metricsService = MetricsService.getInstance();

export interface SystemStatus {
  healthy: boolean;
  lastUpdate: number;
  uptime: number;
  components: {
    [key: string]: {
      status: 'up' | 'down' | 'degraded';
      lastCheck: number;
      error?: string;
      metrics?: Record<string, any>;
    };
  };
  alerts: Array<{
    type: string;
    severity: string;
    message: string;
    timestamp: number;
  }>;
  performance: {
    cpu: number;
    memory: number;
    disk: number;
    network: {
      in: number;
      out: number;
    };
  };
}

export class SystemMonitor {
  private static instance: SystemMonitor;
  private alertManager: AlertManager;
  private monitoringInterval: NodeJS.Timeout;
  private metricsInterval: NodeJS.Timeout;
  private status: SystemStatus;
  private metrics: SystemMetrics;
  private lastMetricsUpdate: number = 0;
  private readonly METRICS_UPDATE_INTERVAL = 5000; // 5秒
  private readonly MONITORING_INTERVAL = 60000; // 1分钟

  private constructor() {
    this.alertManager = AlertManager.getInstance();
    this.status = this.initializeStatus();
    this.metrics = this.initializeMetrics();
  }

  public static getInstance(): SystemMonitor {
    if (!SystemMonitor.instance) {
      SystemMonitor.instance = new SystemMonitor();
    }
    return SystemMonitor.instance;
  }

  private initializeStatus(): SystemStatus {
    return {
      healthy: true,
      lastUpdate: Date.now(),
      uptime: process.uptime(),
      components: {
        database: {
          status: 'up',
          lastCheck: Date.now()
        },
        messaging: {
          status: 'up',
          lastCheck: Date.now()
        },
        chain: {
          status: 'up',
          lastCheck: Date.now()
        },
        plugins: {
          status: 'up',
          lastCheck: Date.now()
        },
        api: {
          status: 'up',
          lastCheck: Date.now()
        },
        llm: {
          status: 'up',
          lastCheck: Date.now()
        }
      },
      alerts: [],
      performance: {
        cpu: 0,
        memory: 0,
        disk: 0,
        network: {
          in: 0,
          out: 0
        }
      }
    };
  }

  private initializeMetrics(): SystemMetrics {
    return {
      cpu: {
        usage: 0,
        loadAverage: os.loadavg(),
        cores: 0,
        speed: 0
      },
      memory: {
        total: os.totalmem(),
        used: 0,
        free: os.freemem(),
        usage: 0,
        swap: {
          total: 0,
          used: 0,
          free: 0
        }
      },
      disk: {
        total: 0,
        used: 0,
        free: 0,
        usage: 0,
        io: {
          reads: 0,
          writes: 0
        }
      },
      network: {
        bytesIn: 0,
        bytesOut: 0,
        packetsIn: 0,
        packetsOut: 0,
        errors: 0,
        dropped: 0,
        interfaces: []
      },
      process: {
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage(),
        cpuUsage: process.cpuUsage(),
        handles: 0,
        threads: 0
      },
      services: {
        database: {
          connections: 0,
          queriesPerSecond: 0,
          latency: 0
        },
        cache: {
          size: 0,
          hitRate: 0,
          missRate: 0
        },
        messaging: {
          queueSize: 0,
          processRate: 0,
          errorRate: 0
        }
      }
    };
  }

  public async start(): Promise<void> {
    logger.info('Monitor', 'Starting system monitor');

    // 启动监控循环
    this.monitoringInterval = setInterval(
      () => this.checkSystemStatus(),
      this.MONITORING_INTERVAL
    );

    // 启动指标收集循环
    this.metricsInterval = setInterval(
      () => this.collectMetrics(),
      this.METRICS_UPDATE_INTERVAL
    );

    // 初始检查
    await this.checkSystemStatus();
    await this.collectMetrics();
  }

  public async stop(): Promise<void> {
    logger.info('Monitor', 'Stopping system monitor');

    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }

    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
    }
  }

  public getStatus(): SystemStatus {
    return { ...this.status };
  }

  public getMetrics(): SystemMetrics {
    return { ...this.metrics };
  }

  private async checkSystemStatus(): Promise<void> {
    try {
      const startTime = Date.now();

      // 并行执行所有监控任务
      await Promise.all([
        this.checkDatabase(),
        this.checkMessaging(),
        this.checkChainAdapters(),
        this.checkPlugins(),
        this.checkApiHealth(),
        this.checkLLMService(),
        this.monitorServices(),
        this.monitorNetwork(),
        this.monitorProcessDetails()
      ]);

      // 更新状态
      this.status.lastUpdate = Date.now();
      this.status.uptime = process.uptime();
      this.status.healthy = Object.values(this.status.components)
        .every(component => component.status === 'up');

      // 更新性能指标
      this.status.performance = {
        cpu: this.metrics.cpu.usage,
        memory: this.metrics.memory.usage,
        disk: this.metrics.disk.usage,
        network: {
          in: this.metrics.network.bytesIn,
          out: this.metrics.network.bytesOut
        }
      };

      // 记录检查时间
      const duration = Date.now() - startTime;
      logger.debug('Monitor', `System status check completed in ${duration}ms`);

      // 发送指标
      this.sendMetricsToService();

    } catch (error) {
      logger.error('Monitor', 'Failed to check system status', error);
      this.alertManager.createAlert({
        type: AlertType.SYSTEM,
        severity: AlertSeverity.HIGH,
        message: 'System status check failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private async collectMetrics(): Promise<void> {
    try {
      const startTime = Date.now();

      // 更新 CPU 指标
      const cpuUsage = await this.calculateCPUUsage();
      this.metrics.cpu = {
        usage: cpuUsage,
        loadAverage: os.loadavg()
      };

      // 更新内存指标
      const totalMem = os.totalmem();
      const freeMem = os.freemem();
      const usedMem = totalMem - freeMem;
      this.metrics.memory = {
        total: totalMem,
        used: usedMem,
        free: freeMem,
        usage: (usedMem / totalMem) * 100
      };

      // 更新磁盘指标
      const diskMetrics = await this.getDiskMetrics();
      this.metrics.disk = diskMetrics;

      // 更新网络指标
      const networkMetrics = await this.getNetworkMetrics();
      this.metrics.network = networkMetrics;

      // 更新进程指标
      this.metrics.process = {
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage(),
        cpuUsage: process.cpuUsage()
      };

      this.lastMetricsUpdate = Date.now();

      // 记录收集时间
      const duration = Date.now() - startTime;
      logger.debug('Monitor', `Metrics collection completed in ${duration}ms`);

      // 发送指标
      this.sendMetricsToService();

    } catch (error) {
      logger.error('Monitor', 'Failed to collect metrics', error);
      this.alertManager.createAlert({
        type: AlertType.SYSTEM,
        severity: AlertSeverity.MEDIUM,
        message: 'Metrics collection failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private async checkDatabase(): Promise<void> {
    try {
      const startTime = Date.now();
      await databaseManager.ping();
      
      this.status.components.database = {
        status: 'up',
        lastCheck: Date.now(),
        metrics: {
          responseTime: Date.now() - startTime
        }
      };
    } catch (error) {
      this.handleComponentError('database', error);
    }
  }

  private async checkMessaging(): Promise<void> {
    try {
      const startTime = Date.now();
      await messagingMiddleware.ping();
      
      this.status.components.messaging = {
        status: 'up',
        lastCheck: Date.now(),
        metrics: {
          responseTime: Date.now() - startTime
        }
      };
    } catch (error) {
      this.handleComponentError('messaging', error);
    }
  }

  private async checkChainAdapters(): Promise<void> {
    try {
      const adapters = chainAdapterFactory.getAdapters();
      const results = await Promise.all(
        adapters.map(adapter => adapter.getChainState())
      );

      const allHealthy = results.every(state => state.healthy);
      this.status.components.chain = {
        status: allHealthy ? 'up' : 'degraded',
        lastCheck: Date.now(),
        metrics: {
          totalAdapters: adapters.length,
          healthyAdapters: results.filter(state => state.healthy).length
        }
      };
    } catch (error) {
      this.handleComponentError('chain', error);
    }
  }

  private async checkPlugins(): Promise<void> {
    try {
      const plugins = configManager.getPlugins();
      const results = await Promise.all(
        plugins.map(plugin => this.checkPluginHealth(plugin))
      );

      const allHealthy = results.every(result => result.healthy);
      this.status.components.plugins = {
        status: allHealthy ? 'up' : 'degraded',
        lastCheck: Date.now(),
        metrics: {
          totalPlugins: plugins.length,
          healthyPlugins: results.filter(result => result.healthy).length
        }
      };
    } catch (error) {
      this.handleComponentError('plugins', error);
    }
  }

  private async checkApiHealth(): Promise<void> {
    try {
      const startTime = Date.now();
      // TODO: 实现 API 健康检查
      const healthy = true; // 临时占位

      this.status.components.api = {
        status: healthy ? 'up' : 'down',
        lastCheck: Date.now(),
        metrics: {
          responseTime: Date.now() - startTime
        }
      };
    } catch (error) {
      this.handleComponentError('api', error);
    }
  }

  private async checkLLMService(): Promise<void> {
    try {
      const startTime = Date.now();
      // TODO: 实现 LLM 服务健康检查
      const healthy = true; // 临时占位

      this.status.components.llm = {
        status: healthy ? 'up' : 'down',
        lastCheck: Date.now(),
        metrics: {
          responseTime: Date.now() - startTime
        }
      };
    } catch (error) {
      this.handleComponentError('llm', error);
    }
  }

  private handleComponentError(component: string, error: unknown): void {
    logger.error('Monitor', `${component} check failed`, error);
    
    this.status.components[component] = {
      status: 'down',
      lastCheck: Date.now(),
      error: error instanceof Error ? error.message : 'Unknown error'
    };

    this.alertManager.createAlert({
      type: AlertType.COMPONENT,
      severity: AlertSeverity.HIGH,
      message: `${component} component is down`,
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }

  private async calculateCPUUsage(): Promise<number> {
    return new Promise((resolve) => {
      const startUsage = process.cpuUsage();
      
      setTimeout(() => {
        const endUsage = process.cpuUsage(startUsage);
        const totalUsage = (endUsage.user + endUsage.system) / 1000000; // 转换为秒
        resolve(totalUsage * 100);
      }, 100);
    });
  }

  private async getDiskMetrics(): Promise<SystemMetrics['disk']> {
    // TODO: 实现磁盘指标收集
    return {
      total: 0,
      used: 0,
      free: 0,
      usage: 0
    };
  }

  private async getNetworkMetrics(): Promise<SystemMetrics['network']> {
    // TODO: 实现网络指标收集
    return {
      bytesIn: 0,
      bytesOut: 0,
      packetsIn: 0,
      packetsOut: 0,
      errors: 0,
      dropped: 0,
      interfaces: []
    };
  }

  private async checkPluginHealth(plugin: any): Promise<{ healthy: boolean }> {
    try {
      if (typeof plugin.healthCheck === 'function') {
        return await plugin.healthCheck();
      }
      return { healthy: true };
    } catch (error) {
      logger.error('Monitor', `Plugin health check failed: ${plugin.name}`, error);
      return { healthy: false };
    }
  }

  private async monitorServices(): Promise<void> {
    try {
      // 监控数据库服务
      const dbMetrics = await this.monitorDatabase();
      
      // 监控缓存服务
      const cacheMetrics = await this.monitorCache();
      
      // 监控消息服务
      const messagingMetrics = await this.monitorMessaging();

      this.metrics.services = {
        database: dbMetrics,
        cache: cacheMetrics,
        messaging: messagingMetrics
      };
      } catch (error) {
      logger.error('Monitor', 'Failed to monitor services', error);
    }
  }

  private async monitorDatabase(): Promise<SystemMetrics['services']['database']> {
    const startTime = Date.now();
    const result = await databaseManager.getMetrics();
    
    return {
      connections: result.activeConnections,
      queriesPerSecond: result.queriesPerSecond,
      latency: Date.now() - startTime
    };
  }

  private async monitorCache(): Promise<SystemMetrics['services']['cache']> {
    const cacheStats = await this.getCacheStats();
    
    return {
      size: cacheStats.size,
      hitRate: cacheStats.hits / (cacheStats.hits + cacheStats.misses) * 100,
      missRate: cacheStats.misses / (cacheStats.hits + cacheStats.misses) * 100
    };
  }

  private async monitorMessaging(): Promise<SystemMetrics['services']['messaging']> {
    const stats = await messagingMiddleware.getStats();
    
    return {
      queueSize: stats.queueSize,
      processRate: stats.processedPerSecond,
      errorRate: stats.errorsPerSecond
    };
  }

  private async monitorNetwork(): Promise<void> {
    try {
      const interfaces = os.networkInterfaces();
      const networkStats = {
        bytesIn: 0,
        bytesOut: 0,
        packetsIn: 0,
        packetsOut: 0,
        errors: 0,
        dropped: 0,
        interfaces: []
      };

      for (const [name, addrs] of Object.entries(interfaces)) {
        if (addrs) {
          const interfaceStats = await this.getInterfaceStats(name);
          networkStats.interfaces.push({
            name,
            ...interfaceStats
          });
          
          networkStats.bytesIn += interfaceStats.bytesIn;
          networkStats.bytesOut += interfaceStats.bytesOut;
        }
      }

      this.metrics.network = networkStats;
    } catch (error) {
      logger.error('Monitor', 'Failed to monitor network', error);
    }
  }

  private async getInterfaceStats(interfaceName: string): Promise<any> {
    // 实现网络接口统计信息收集
    return {
      bytesIn: 0,
      bytesOut: 0,
      status: 'up'
    };
  }

  private async monitorProcessDetails(): Promise<void> {
    try {
      this.metrics.process = {
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage(),
        cpuUsage: process.cpuUsage(),
        handles: process._getActiveHandles().length,
        threads: process._getActiveRequests().length
      };
    } catch (error) {
      logger.error('Monitor', 'Failed to monitor process details', error);
    }
  }

  private sendMetricsToService(): void {
    // 发送系统指标
    metricsService.recordMetric('system.uptime', this.status.uptime);
    metricsService.recordMetric('system.healthy', this.status.healthy ? 1 : 0);

    // 发送 CPU 指标
    metricsService.recordMetric('system.cpu.usage', this.metrics.cpu.usage);
    metricsService.recordMetric('system.cpu.cores', this.metrics.cpu.cores);
    this.metrics.cpu.loadAverage.forEach((load, index) => {
      metricsService.recordMetric(`system.cpu.loadavg.${index + 1}`, load);
    });

    // 发送内存指标
    metricsService.recordMetric('system.memory.total', this.metrics.memory.total);
    metricsService.recordMetric('system.memory.used', this.metrics.memory.used);
    metricsService.recordMetric('system.memory.free', this.metrics.memory.free);
    metricsService.recordMetric('system.memory.usage', this.metrics.memory.usage);

    // 发送磁盘指标
    metricsService.recordMetric('system.disk.total', this.metrics.disk.total);
    metricsService.recordMetric('system.disk.used', this.metrics.disk.used);
    metricsService.recordMetric('system.disk.free', this.metrics.disk.free);
    metricsService.recordMetric('system.disk.usage', this.metrics.disk.usage);

    // 发送网络指标
    metricsService.recordMetric('system.network.bytesIn', this.metrics.network.bytesIn);
    metricsService.recordMetric('system.network.bytesOut', this.metrics.network.bytesOut);
    metricsService.recordMetric('system.network.errors', this.metrics.network.errors);

    // 发送服务指标
    metricsService.recordMetric('system.services.database.connections', this.metrics.services.database.connections);
    metricsService.recordMetric('system.services.database.qps', this.metrics.services.database.queriesPerSecond);
    metricsService.recordMetric('system.services.cache.hitRate', this.metrics.services.cache.hitRate);
    metricsService.recordMetric('system.services.messaging.queueSize', this.metrics.services.messaging.queueSize);
  }
} 