import { EventEmitter } from 'events';
import { BaseError } from '../types/errors';

/**
 * 调度器错误
 */
export class SchedulerError extends BaseError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'SchedulerError';
  }
}

/**
 * 任务状态
 */
export enum TaskStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled'
}

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
 * 任务配置
 */
export interface TaskConfig {
  id: string;
  name: string;
  priority?: TaskPriority;
  timeout?: number;
  retries?: number;
  retryDelay?: number;
  dependencies?: string[];
  metadata?: Record<string, any>;
}

/**
 * 任务结果
 */
export interface TaskResult<T = any> {
  taskId: string;
  status: TaskStatus;
  result?: T;
  error?: Error;
  startTime: number;
  endTime: number;
  duration: number;
  retryCount: number;
  metadata?: Record<string, any>;
}

/**
 * 调度器配置
 */
export interface SchedulerConfig {
  maxConcurrent?: number;
  maxRetries?: number;
  retryDelay?: number;
  defaultTimeout?: number;
  defaultPriority?: TaskPriority;
  enableLogging?: boolean;
}

/**
 * 任务调度器
 */
export class TaskScheduler extends EventEmitter {
  private config: Required<SchedulerConfig>;
  private tasks: Map<string, TaskConfig & { status: TaskStatus }>;
  private queue: string[];
  private running: Set<string>;
  private results: Map<string, TaskResult>;
  private handlers: Map<string, (task: TaskConfig) => Promise<any>>;

  constructor(config: SchedulerConfig = {}) {
    super();
    this.config = {
      maxConcurrent: config.maxConcurrent || 4,
      maxRetries: config.maxRetries || 3,
      retryDelay: config.retryDelay || 1000,
      defaultTimeout: config.defaultTimeout || 30000,
      defaultPriority: config.defaultPriority || TaskPriority.NORMAL,
      enableLogging: config.enableLogging || false
    };

    this.tasks = new Map();
    this.queue = [];
    this.running = new Set();
    this.results = new Map();
    this.handlers = new Map();
  }

  /**
   * 注册任务处理器
   */
  registerHandler(
    taskName: string,
    handler: (task: TaskConfig) => Promise<any>
  ): void {
    this.handlers.set(taskName, handler);
  }

  /**
   * 添加任务
   */
  addTask(config: TaskConfig): void {
    if (this.tasks.has(config.id)) {
      throw new SchedulerError(`Task ${config.id} already exists`);
    }

    const task = {
      ...config,
      priority: config.priority ?? this.config.defaultPriority,
      timeout: config.timeout ?? this.config.defaultTimeout,
      retries: config.retries ?? this.config.maxRetries,
      retryDelay: config.retryDelay ?? this.config.retryDelay,
      dependencies: config.dependencies || [],
      status: TaskStatus.PENDING
    };

    this.tasks.set(config.id, task);
    this.queue.push(config.id);
    this.sortQueue();

    if (this.config.enableLogging) {
      console.log(`Task ${config.id} added to queue`);
    }

    this.emit('taskAdded', task);
    this.processQueue();
  }

  /**
   * 取消任务
   */
  cancelTask(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) return false;

    if (task.status === TaskStatus.RUNNING) {
      throw new SchedulerError(`Cannot cancel running task ${taskId}`);
    }

    task.status = TaskStatus.CANCELLED;
    this.queue = this.queue.filter(id => id !== taskId);
    
    this.emit('taskCancelled', task);
    return true;
  }

  /**
   * 获取任务状态
   */
  getTaskStatus(taskId: string): TaskStatus | undefined {
    return this.tasks.get(taskId)?.status;
  }

  /**
   * 获取任务结果
   */
  getTaskResult(taskId: string): TaskResult | undefined {
    return this.results.get(taskId);
  }

  /**
   * 获取所有任务
   */
  getAllTasks(): Map<string, TaskConfig & { status: TaskStatus }> {
    return this.tasks;
  }

  /**
   * 获取队列中的任务
   */
  getQueuedTasks(): string[] {
    return [...this.queue];
  }

  /**
   * 获取运行中的任务
   */
  getRunningTasks(): string[] {
    return [...this.running];
  }

  /**
   * 清理完成的任务
   */
  clearCompletedTasks(): void {
    for (const [id, task] of this.tasks.entries()) {
      if (task.status === TaskStatus.COMPLETED || 
          task.status === TaskStatus.FAILED ||
          task.status === TaskStatus.CANCELLED) {
        this.tasks.delete(id);
        this.results.delete(id);
      }
    }
  }

  /**
   * 处理任务队列
   */
  private async processQueue(): Promise<void> {
    if (this.running.size >= this.config.maxConcurrent) {
      return;
    }

    const availableSlots = this.config.maxConcurrent - this.running.size;
    const tasksToRun = this.queue
      .filter(id => this.canRunTask(id))
      .slice(0, availableSlots);

    for (const taskId of tasksToRun) {
      this.queue = this.queue.filter(id => id !== taskId);
      this.runTask(taskId);
    }
  }

  /**
   * 检查任务是否可以运行
   */
  private canRunTask(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) return false;

    // 检查依赖任务是否完成
    return task.dependencies.every(depId => {
      const depTask = this.tasks.get(depId);
      return depTask?.status === TaskStatus.COMPLETED;
    });
  }

  /**
   * 运行任务
   */
  private async runTask(taskId: string): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) return;

    const handler = this.handlers.get(task.name);
    if (!handler) {
      throw new SchedulerError(`No handler registered for task ${task.name}`);
    }

    this.running.add(taskId);
    task.status = TaskStatus.RUNNING;
    
    const startTime = Date.now();
    this.emit('taskStarted', task);

    try {
      // 设置超时
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error(`Task ${taskId} timed out`)), task.timeout);
      });

      // 运行任务
      const result = await Promise.race([
        handler(task),
        timeoutPromise
      ]);

      const endTime = Date.now();
      
      this.results.set(taskId, {
        taskId,
        status: TaskStatus.COMPLETED,
        result,
        startTime,
        endTime,
        duration: endTime - startTime,
        retryCount: 0,
        metadata: task.metadata
      });

      task.status = TaskStatus.COMPLETED;
      this.emit('taskCompleted', task, result);
    } catch (error) {
      const retryCount = (this.results.get(taskId)?.retryCount || 0) + 1;
      
      if (retryCount <= task.retries) {
        // 重试任务
        this.queue.unshift(taskId);
        this.results.set(taskId, {
          taskId,
          status: TaskStatus.PENDING,
          error: error as Error,
          startTime,
          endTime: Date.now(),
          duration: 0,
          retryCount,
          metadata: task.metadata
        });

        task.status = TaskStatus.PENDING;
        this.emit('taskRetry', task, error);

        // 等待重试延迟
        await new Promise(resolve => setTimeout(resolve, task.retryDelay));
      } else {
        // 任务失败
        this.results.set(taskId, {
          taskId,
          status: TaskStatus.FAILED,
          error: error as Error,
          startTime,
          endTime: Date.now(),
          duration: 0,
          retryCount,
          metadata: task.metadata
        });

        task.status = TaskStatus.FAILED;
        this.emit('taskFailed', task, error);
      }
    } finally {
      this.running.delete(taskId);
      this.processQueue();
    }
  }

  /**
   * 对队列进行排序
   */
  private sortQueue(): void {
    this.queue.sort((a, b) => {
      const taskA = this.tasks.get(a);
      const taskB = this.tasks.get(b);
      if (!taskA || !taskB) return 0;
      return taskB.priority - taskA.priority;
    });
  }
} 