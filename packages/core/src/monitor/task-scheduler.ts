import { EventEmitter } from 'events';
import { logger } from '../utils/logger';

/**
 * 任务优先级
 */
export enum TaskPriority {
  LOW = 0,
  NORMAL = 1,
  HIGH = 2,
  CRITICAL = 3
}

/**
 * 任务信息
 */
export interface Task<T = any> {
  id: string;
  type: string;
  data: T;
  priority: TaskPriority;
  timestamp: number;
  timeout?: number;
  retries?: number;
  maxRetries?: number;
}

/**
 * 工作线程信息
 */
export interface WorkerInfo {
  id: number;
  status: 'idle' | 'busy';
  load: number;  // 负载指数 (0-100)
  processedCount: number;
  errorCount: number;
  avgProcessingTime: number;
  lastProcessedTime?: number;
  specialties?: string[];  // 特定任务类型的处理能力
}

/**
 * 调度器配置
 */
export interface SchedulerConfig {
  maxQueueSize?: number;
  defaultPriority?: TaskPriority;
  defaultTimeout?: number;
  maxRetries?: number;
  retryDelay?: number;
  loadBalanceInterval?: number;
  loadThreshold?: number;  // 负载均衡阈值
  taskTypes?: Array<{
    type: string;
    priority: TaskPriority;
    timeout?: number;
    maxRetries?: number;
  }>;
}

/**
 * 调度器统计
 */
export interface SchedulerStats {
  queueSize: number;
  processedCount: number;
  errorCount: number;
  avgWaitTime: number;
  avgProcessingTime: number;
  priorityStats: Record<TaskPriority, {
    queued: number;
    processed: number;
    errors: number;
    avgWaitTime: number;
  }>;
  typeStats: Record<string, {
    queued: number;
    processed: number;
    errors: number;
    avgProcessingTime: number;
  }>;
}

/**
 * 任务调度器
 */
export class TaskScheduler extends EventEmitter {
  private config: Required<SchedulerConfig>;
  private taskQueues: Map<TaskPriority, Task[]>;
  private workers: Map<number, WorkerInfo>;
  private taskTypeConfigs: Map<string, {
    priority: TaskPriority;
    timeout: number;
    maxRetries: number;
  }>;
  private stats: SchedulerStats;
  private loadBalanceTimer?: NodeJS.Timeout;

  constructor(config: SchedulerConfig = {}) {
    super();
    this.config = {
      maxQueueSize: config.maxQueueSize || 10000,
      defaultPriority: config.defaultPriority || TaskPriority.NORMAL,
      defaultTimeout: config.defaultTimeout || 30000,
      maxRetries: config.maxRetries || 3,
      retryDelay: config.retryDelay || 1000,
      loadBalanceInterval: config.loadBalanceInterval || 5000,
      loadThreshold: config.loadThreshold || 20,
      taskTypes: config.taskTypes || []
    };

    this.taskQueues = new Map();
    this.workers = new Map();
    this.taskTypeConfigs = new Map();
    this.stats = this.initializeStats();

    // 初始化优先级队列
    Object.values(TaskPriority).forEach(priority => {
      if (typeof priority === 'number') {
        this.taskQueues.set(priority, []);
      }
    });

    // 初始化任务类型配置
    this.config.taskTypes.forEach(({ type, priority, timeout, maxRetries }) => {
      this.taskTypeConfigs.set(type, {
        priority,
        timeout: timeout || this.config.defaultTimeout,
        maxRetries: maxRetries || this.config.maxRetries
      });
    });

    this.startLoadBalancing();
  }

  /**
   * 初始化统计信息
   */
  private initializeStats(): SchedulerStats {
    return {
      queueSize: 0,
      processedCount: 0,
      errorCount: 0,
      avgWaitTime: 0,
      avgProcessingTime: 0,
      priorityStats: Object.values(TaskPriority).reduce((stats, priority) => {
        if (typeof priority === 'number') {
          stats[priority] = {
            queued: 0,
            processed: 0,
            errors: 0,
            avgWaitTime: 0
          };
        }
        return stats;
      }, {} as SchedulerStats['priorityStats']),
      typeStats: {}
    };
  }

  /**
   * 启动负载均衡
   */
  private startLoadBalancing(): void {
    this.loadBalanceTimer = setInterval(() => {
      this.balanceLoad();
    }, this.config.loadBalanceInterval);
  }

  /**
   * 平衡负载
   */
  private balanceLoad(): void {
    const workers = Array.from(this.workers.values());
    const avgLoad = workers.reduce((sum, w) => sum + w.load, 0) / workers.length;

    // 找出负载过高和过低的工作线程
    const overloadedWorkers = workers.filter(w => w.load > avgLoad + this.config.loadThreshold);
    const underloadedWorkers = workers.filter(w => w.load < avgLoad - this.config.loadThreshold);

    if (overloadedWorkers.length === 0 || underloadedWorkers.length === 0) {
      return;
    }

    // 重新分配任务
    this.redistributeTasks(overloadedWorkers, underloadedWorkers);
  }

  /**
   * 重新分配任务
   */
  private redistributeTasks(
    overloaded: WorkerInfo[],
    underloaded: WorkerInfo[]
  ): void {
    for (const worker of overloaded) {
      const loadDiff = worker.load - (100 / this.workers.size);
      if (loadDiff <= 0) continue;

      // 计算需要转移的任务数量
      const tasksToMove = Math.ceil(loadDiff / 10);  // 每10%负载对应一个任务
      
      // 通知线程池重新分配任务
      this.emit('redistributeTasks', {
        fromWorkerId: worker.id,
        toWorkerIds: underloaded.map(w => w.id),
        taskCount: tasksToMove
      });
    }
  }

  /**
   * 注册工作线程
   */
  public registerWorker(worker: WorkerInfo): void {
    this.workers.set(worker.id, {
      ...worker,
      load: 0,
      processedCount: 0,
      errorCount: 0,
      avgProcessingTime: 0
    });
  }

  /**
   * 更新工作线程状态
   */
  public updateWorkerStatus(
    workerId: number,
    status: 'idle' | 'busy',
    load: number
  ): void {
    const worker = this.workers.get(workerId);
    if (worker) {
      worker.status = status;
      worker.load = load;
      worker.lastProcessedTime = Date.now();
    }
  }

  /**
   * 提交任务
   */
  public submitTask<T = any>(task: Omit<Task<T>, 'id' | 'timestamp'>): string {
    const taskId = Math.random().toString(36).substr(2, 9);
    const taskConfig = this.taskTypeConfigs.get(task.type);

    const fullTask: Task<T> = {
      ...task,
      id: taskId,
      timestamp: Date.now(),
      priority: task.priority ?? taskConfig?.priority ?? this.config.defaultPriority,
      timeout: task.timeout ?? taskConfig?.timeout ?? this.config.defaultTimeout,
      maxRetries: task.maxRetries ?? taskConfig?.maxRetries ?? this.config.maxRetries,
      retries: 0
    };

    // 检查队列大小限制
    const totalQueueSize = Array.from(this.taskQueues.values())
      .reduce((sum, queue) => sum + queue.length, 0);

    if (totalQueueSize >= this.config.maxQueueSize) {
      // 如果是高优先级任务，移除低优先级任务
      if (fullTask.priority >= TaskPriority.HIGH) {
        this.removeLowPriorityTasks();
      } else {
        throw new Error('Task queue is full');
      }
    }

    // 添加到对应优先级的队列
    const queue = this.taskQueues.get(fullTask.priority);
    if (queue) {
      queue.push(fullTask);
      this.updateQueueStats(fullTask.priority, fullTask.type);
    }

    // 触发任务分配
    this.emit('taskSubmitted', fullTask);
    return taskId;
  }

  /**
   * 移除低优先级任务
   */
  private removeLowPriorityTasks(): void {
    for (let priority = TaskPriority.LOW; priority < TaskPriority.HIGH; priority++) {
      const queue = this.taskQueues.get(priority);
      if (queue && queue.length > 0) {
        const removed = queue.pop();
        if (removed) {
          this.emit('taskRemoved', {
            taskId: removed.id,
            reason: 'queue_full'
          });
          return;
        }
      }
    }
  }

  /**
   * 更新队列统计信息
   */
  private updateQueueStats(priority: TaskPriority, type: string): void {
    this.stats.queueSize = Array.from(this.taskQueues.values())
      .reduce((sum, queue) => sum + queue.length, 0);

    this.stats.priorityStats[priority].queued++;

    if (!this.stats.typeStats[type]) {
      this.stats.typeStats[type] = {
        queued: 0,
        processed: 0,
        errors: 0,
        avgProcessingTime: 0
      };
    }
    this.stats.typeStats[type].queued++;
  }

  /**
   * 获取下一个要处理的任务
   */
  public getNextTask(workerId: number): Task | null {
    const worker = this.workers.get(workerId);
    if (!worker || worker.status === 'busy' || worker.load >= 100) {
      return null;
    }

    // 按优先级从高到低查找任务
    for (let priority = TaskPriority.CRITICAL; priority >= TaskPriority.LOW; priority--) {
      const queue = this.taskQueues.get(priority);
      if (queue && queue.length > 0) {
        // 如果工作线程有特定任务类型的处理能力，优先分配对应类型的任务
        if (worker.specialties) {
          const specialTask = queue.find(task => 
            worker.specialties!.includes(task.type)
          );
          if (specialTask) {
            queue.splice(queue.indexOf(specialTask), 1);
            return specialTask;
          }
        }

        return queue.shift() || null;
      }
    }

    return null;
  }

  /**
   * 处理任务完成
   */
  public onTaskCompleted(
    taskId: string,
    workerId: number,
    processingTime: number
  ): void {
    const worker = this.workers.get(workerId);
    if (worker) {
      worker.processedCount++;
      worker.avgProcessingTime = (
        worker.avgProcessingTime * (worker.processedCount - 1) +
        processingTime
      ) / worker.processedCount;
      worker.status = 'idle';
      worker.load = Math.max(0, worker.load - 20);  // 减少负载
    }

    this.stats.processedCount++;
    this.stats.avgProcessingTime = (
      this.stats.avgProcessingTime * (this.stats.processedCount - 1) +
      processingTime
    ) / this.stats.processedCount;
  }

  /**
   * 处理任务错误
   */
  public onTaskError(
    taskId: string,
    workerId: number,
    error: Error
  ): void {
    const worker = this.workers.get(workerId);
    if (worker) {
      worker.errorCount++;
      worker.status = 'idle';
      worker.load = Math.max(0, worker.load - 10);  // 减少负载
    }

    this.stats.errorCount++;
  }

  /**
   * 获取调度器统计信息
   */
  public getStats(): SchedulerStats {
    return { ...this.stats };
  }

  /**
   * 停止调度器
   */
  public shutdown(): void {
    if (this.loadBalanceTimer) {
      clearInterval(this.loadBalanceTimer);
    }

    this.taskQueues.clear();
    this.workers.clear();
    this.stats = this.initializeStats();
  }
} 