import { EventEmitter } from 'events';
import { BaseError } from '../types/errors';
import { TaskScheduler, TaskConfig, TaskStatus } from './scheduler';
import { WorkerPool, WorkerTask } from './worker';

/**
 * 负载均衡器错误
 */
export class LoadBalancerError extends BaseError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'LoadBalancerError';
  }
}

/**
 * 负载均衡策略
 */
export enum BalanceStrategy {
  ROUND_ROBIN = 'round_robin',
  LEAST_BUSY = 'least_busy',
  WEIGHTED = 'weighted',
  ADAPTIVE = 'adaptive'
}

/**
 * 负载均衡器配置
 */
export interface LoadBalancerConfig {
  strategy?: BalanceStrategy;
  maxLoad?: number;
  checkInterval?: number;
  adaptiveConfig?: {
    samplingWindow?: number;
    minSamples?: number;
    targetLatency?: number;
  };
  weights?: Record<string, number>;
}

/**
 * 负载统计
 */
export interface LoadStats {
  poolId: string;
  size: number;
  busy: number;
  queued: number;
  completed: number;
  failed: number;
  latency: number;
  load: number;
  weight: number;
}

/**
 * 负载均衡器
 */
export class LoadBalancer extends EventEmitter {
  private pools: Map<string, WorkerPool>;
  private scheduler: TaskScheduler;
  private config: Required<LoadBalancerConfig>;
  private stats: Map<string, LoadStats>;
  private currentIndex: number;
  private checkInterval: NodeJS.Timer;

  constructor(config: LoadBalancerConfig = {}) {
    super();
    this.config = {
      strategy: config.strategy || BalanceStrategy.ADAPTIVE,
      maxLoad: config.maxLoad || 0.8,
      checkInterval: config.checkInterval || 5000,
      adaptiveConfig: {
        samplingWindow: config.adaptiveConfig?.samplingWindow || 60000,
        minSamples: config.adaptiveConfig?.minSamples || 10,
        targetLatency: config.adaptiveConfig?.targetLatency || 100
      },
      weights: config.weights || {}
    };

    this.pools = new Map();
    this.scheduler = new TaskScheduler();
    this.stats = new Map();
    this.currentIndex = 0;

    this.startHealthCheck();
  }

  /**
   * 添加工作池
   */
  addPool(id: string, pool: WorkerPool, weight: number = 1): void {
    this.pools.set(id, pool);
    this.config.weights[id] = weight;
    this.stats.set(id, this.initializeStats(id));

    // 监听工作池事件
    pool.on('taskStarted', this.handleTaskStarted.bind(this, id));
    pool.on('taskCompleted', this.handleTaskCompleted.bind(this, id));
    pool.on('taskFailed', this.handleTaskFailed.bind(this, id));
  }

  /**
   * 移除工作池
   */
  removePool(id: string): boolean {
    const pool = this.pools.get(id);
    if (!pool) return false;

    pool.removeAllListeners();
    this.pools.delete(id);
    this.stats.delete(id);
    delete this.config.weights[id];

    return true;
  }

  /**
   * 提交任务
   */
  async submitTask<T = any>(task: TaskConfig): Promise<T> {
    const poolId = await this.selectPool(task);
    const pool = this.pools.get(poolId);

    if (!pool) {
      throw new LoadBalancerError('No available worker pool');
    }

    const workerTask: WorkerTask = {
      id: task.id,
      script: task.metadata?.script as string,
      data: task.metadata?.data,
      timeout: task.timeout,
      retries: task.retries,
      retryDelay: task.retryDelay
    };

    return pool.executeTask<T>(workerTask);
  }

  /**
   * 选择工作池
   */
  private async selectPool(task: TaskConfig): Promise<string> {
    const availablePools = Array.from(this.pools.entries())
      .filter(([id]) => this.isPoolAvailable(id));

    if (availablePools.length === 0) {
      throw new LoadBalancerError('No available worker pools');
    }

    switch (this.config.strategy) {
      case BalanceStrategy.ROUND_ROBIN:
        return this.roundRobinSelect(availablePools);
      case BalanceStrategy.LEAST_BUSY:
        return this.leastBusySelect(availablePools);
      case BalanceStrategy.WEIGHTED:
        return this.weightedSelect(availablePools);
      case BalanceStrategy.ADAPTIVE:
        return this.adaptiveSelect(availablePools, task);
      default:
        throw new LoadBalancerError(`Unknown balance strategy: ${this.config.strategy}`);
    }
  }

  /**
   * 轮询选择
   */
  private roundRobinSelect(pools: [string, WorkerPool][]): string {
    const poolId = pools[this.currentIndex][0];
    this.currentIndex = (this.currentIndex + 1) % pools.length;
    return poolId;
  }

  /**
   * 最小负载选择
   */
  private leastBusySelect(pools: [string, WorkerPool][]): string {
    let minLoad = Infinity;
    let selectedId = pools[0][0];

    for (const [id] of pools) {
      const stats = this.stats.get(id);
      if (stats && stats.load < minLoad) {
        minLoad = stats.load;
        selectedId = id;
      }
    }

    return selectedId;
  }

  /**
   * 加权选择
   */
  private weightedSelect(pools: [string, WorkerPool][]): string {
    const totalWeight = pools.reduce(
      (sum, [id]) => sum + (this.config.weights[id] || 1),
      0
    );

    let random = Math.random() * totalWeight;
    
    for (const [id] of pools) {
      const weight = this.config.weights[id] || 1;
      random -= weight;
      if (random <= 0) {
        return id;
      }
    }

    return pools[0][0];
  }

  /**
   * 自适应选择
   */
  private adaptiveSelect(
    pools: [string, WorkerPool][],
    task: TaskConfig
  ): string {
    // 计算每个池的得分
    const scores = new Map<string, number>();

    for (const [id] of pools) {
      const stats = this.stats.get(id);
      if (!stats) continue;

      // 计算负载得分
      const loadScore = 1 - stats.load;

      // 计算延迟得分
      const latencyScore = Math.max(0, 1 - stats.latency / this.config.adaptiveConfig.targetLatency);

      // 计算权重得分
      const weightScore = stats.weight / Math.max(...Object.values(this.config.weights));

      // 综合得分
      scores.set(id, (loadScore + latencyScore + weightScore) / 3);
    }

    // 选择得分最高的池
    let maxScore = -Infinity;
    let selectedId = pools[0][0];

    for (const [id, score] of scores.entries()) {
      if (score > maxScore) {
        maxScore = score;
        selectedId = id;
      }
    }

    return selectedId;
  }

  /**
   * 检查池是否可用
   */
  private isPoolAvailable(id: string): boolean {
    const stats = this.stats.get(id);
    return stats ? stats.load < this.config.maxLoad : false;
  }

  /**
   * 初始化统计信息
   */
  private initializeStats(id: string): LoadStats {
    return {
      poolId: id,
      size: 0,
      busy: 0,
      queued: 0,
      completed: 0,
      failed: 0,
      latency: 0,
      load: 0,
      weight: this.config.weights[id] || 1
    };
  }

  /**
   * 更新统计信息
   */
  private updateStats(id: string): void {
    const pool = this.pools.get(id);
    const stats = this.stats.get(id);
    if (!pool || !stats) return;

    const status = pool.getStatus();
    
    stats.size = status.size;
    stats.busy = status.busy;
    stats.queued = status.queued;
    stats.completed = status.completed;
    stats.failed = status.failed;
    stats.load = status.busy / status.size;

    this.emit('statsUpdated', stats);
  }

  /**
   * 处理任务开始
   */
  private handleTaskStarted(poolId: string, task: WorkerTask): void {
    this.updateStats(poolId);
  }

  /**
   * 处理任务完成
   */
  private handleTaskCompleted(poolId: string, result: any): void {
    this.updateStats(poolId);
  }

  /**
   * 处理任务失败
   */
  private handleTaskFailed(poolId: string, error: Error): void {
    this.updateStats(poolId);
  }

  /**
   * 启动健康检查
   */
  private startHealthCheck(): void {
    this.checkInterval = setInterval(() => {
      for (const id of this.pools.keys()) {
        this.updateStats(id);
      }
    }, this.config.checkInterval);
  }

  /**
   * 停止健康检查
   */
  private stopHealthCheck(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }
  }

  /**
   * 获取负载统计
   */
  getStats(): Map<string, LoadStats> {
    return this.stats;
  }

  /**
   * 更新池权重
   */
  updateWeight(id: string, weight: number): void {
    this.config.weights[id] = weight;
    const stats = this.stats.get(id);
    if (stats) {
      stats.weight = weight;
    }
  }

  /**
   * 关闭负载均衡器
   */
  async close(): Promise<void> {
    this.stopHealthCheck();
    await Promise.all(
      Array.from(this.pools.values()).map(pool => pool.close())
    );
    this.pools.clear();
    this.stats.clear();
  }
} 