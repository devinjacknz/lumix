import { Worker } from 'worker_threads';
import { EventEmitter } from 'events';
import { logger } from '../utils/logger';
import path from 'path';
import os from 'os';
import { TaskScheduler, TaskPriority, Task, WorkerInfo } from './task-scheduler';

/**
 * 线程池配置
 */
export interface ThreadPoolConfig {
  minWorkers?: number;
  maxWorkers?: number;
  idleTimeout?: number;
  processingTimeout?: number;
  scaleUpThreshold?: number;  // 扩容阈值（队列长度/工作线程数）
  scaleDownThreshold?: number;  // 缩容阈值（空闲线程数/总线程数）
  taskTypes?: Array<{
    type: string;
    priority: TaskPriority;
    timeout?: number;
    maxRetries?: number;
  }>;
}

/**
 * 线程状态
 */
export interface ThreadStats {
  activeWorkers: number;
  idleWorkers: number;
  totalProcessed: number;
  errorCount: number;
  avgProcessingTime: number;
  queueSize: number;
  workerStats: Array<{
    id: number;
    status: 'idle' | 'busy';
    processedCount: number;
    errorCount: number;
    avgProcessingTime: number;
    lastProcessedTime?: number;
  }>;
}

/**
 * 动态线程池
 */
export class ThreadPool extends EventEmitter {
  private config: Required<ThreadPoolConfig>;
  private workers: Map<number, {
    worker: Worker;
    info: WorkerInfo;
    currentTask?: Task;
    timeoutId?: NodeJS.Timeout;
  }>;
  private lastWorkerId: number;
  private taskScheduler: TaskScheduler;

  constructor(config: ThreadPoolConfig = {}) {
    super();
    this.config = {
      minWorkers: config.minWorkers || Math.max(1, Math.floor(os.cpus().length / 4)),
      maxWorkers: config.maxWorkers || Math.max(2, os.cpus().length),
      idleTimeout: config.idleTimeout || 60000,  // 1分钟
      processingTimeout: config.processingTimeout || 30000,  // 30秒
      scaleUpThreshold: config.scaleUpThreshold || 3,  // 队列长度超过工作线程数的3倍时扩容
      scaleDownThreshold: config.scaleDownThreshold || 0.5,  // 空闲线程数超过总线程数的50%时缩容
      taskTypes: config.taskTypes || []
    };

    this.workers = new Map();
    this.lastWorkerId = 0;

    // 初始化任务调度器
    this.taskScheduler = new TaskScheduler({
      maxQueueSize: this.config.maxWorkers * 100,  // 每个工作线程最多100个任务
      defaultTimeout: this.config.processingTimeout,
      idleTimeout: this.config.idleTimeout,
      loadBalanceInterval: 5000,  // 每5秒进行一次负载均衡
      loadThreshold: 20,  // 负载差异超过20%时触发均衡
      taskTypes: this.config.taskTypes
    });

    this.setupTaskScheduler();
    this.initializeWorkers(this.config.minWorkers);
  }

  /**
   * 设置任务调度器事件监听
   */
  private setupTaskScheduler(): void {
    this.taskScheduler.on('redistributeTasks', ({ fromWorkerId, toWorkerIds, taskCount }) => {
      this.redistributeTasks(fromWorkerId, toWorkerIds, taskCount);
    });

    this.taskScheduler.on('taskSubmitted', (task: Task) => {
      this.processNextTasks();
    });
  }

  /**
   * 初始化工作线程
   */
  private initializeWorkers(count: number): void {
    for (let i = 0; i < count; i++) {
      this.createWorker();
    }
  }

  /**
   * 创建工作线程
   */
  private createWorker(): void {
    const workerId = ++this.lastWorkerId;
    const worker = new Worker(path.resolve(__dirname, './worker.js'));
    
    const workerInfo: WorkerInfo = {
      id: workerId,
      status: 'idle',
      load: 0,
      processedCount: 0,
      errorCount: 0,
      avgProcessingTime: 0
    };

    worker.on('message', (result: { success: boolean; error?: Error; data?: any }) => {
      this.handleWorkerResult(workerId, result);
    });

    worker.on('error', (error) => {
      this.handleWorkerError(workerId, error);
    });

    this.workers.set(workerId, { worker, info: workerInfo });
    this.taskScheduler.registerWorker(workerInfo);
    this.emit('workerCreated', { workerId });
  }

  /**
   * 处理工作线程结果
   */
  private handleWorkerResult(
    workerId: number,
    result: { success: boolean; error?: Error; data?: any }
  ): void {
    const workerData = this.workers.get(workerId);
    if (!workerData || !workerData.currentTask) {
      return;
    }

    const { currentTask, timeoutId } = workerData;
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    const processingTime = Date.now() - currentTask.timestamp;
    
    if (result.success) {
      this.taskScheduler.onTaskCompleted(currentTask.id, workerId, processingTime);
      this.emit('taskCompleted', {
        workerId,
        processingTime,
        data: result.data
      });
    } else {
      this.taskScheduler.onTaskError(currentTask.id, workerId, result.error || new Error('Task failed'));
      this.emit('taskError', {
        workerId,
        error: result.error
      });

      // 如果任务可以重试，重新提交
      if (currentTask.retries! < currentTask.maxRetries!) {
        setTimeout(() => {
          this.taskScheduler.submitTask({
            ...currentTask,
            retries: currentTask.retries! + 1
          });
        }, this.config.processingTimeout / 2);  // 等待一半超时时间后重试
      }
    }

    workerData.currentTask = undefined;
    this.processNextTasks();
  }

  /**
   * 处理工作线程错误
   */
  private handleWorkerError(workerId: number, error: Error): void {
    const workerData = this.workers.get(workerId);
    if (!workerData) {
      return;
    }

    if (workerData.currentTask) {
      this.taskScheduler.onTaskError(workerData.currentTask.id, workerId, error);
    }

    this.emit('workerError', {
      workerId,
      error
    });

    // 重新创建工作线程
    this.recycleWorker(workerId);
  }

  /**
   * 回收工作线程
   */
  private recycleWorker(workerId: number): void {
    const workerData = this.workers.get(workerId);
    if (!workerData) {
      return;
    }

    workerData.worker.terminate();
    if (this.workers.size > this.config.minWorkers) {
      this.workers.delete(workerId);
    } else {
      const worker = new Worker(path.resolve(__dirname, './worker.js'));
      const workerInfo: WorkerInfo = {
        id: workerId,
        status: 'idle',
        load: 0,
        processedCount: 0,
        errorCount: 0,
        avgProcessingTime: 0
      };

      worker.on('message', (result) => {
        this.handleWorkerResult(workerId, result);
      });

      worker.on('error', (error) => {
        this.handleWorkerError(workerId, error);
      });

      this.workers.set(workerId, { worker, info: workerInfo });
      this.taskScheduler.registerWorker(workerInfo);
    }
  }

  /**
   * 重新分配任务
   */
  private redistributeTasks(
    fromWorkerId: number,
    toWorkerIds: number[],
    taskCount: number
  ): void {
    const fromWorker = this.workers.get(fromWorkerId);
    if (!fromWorker || !fromWorker.currentTask) {
      return;
    }

    // 将当前任务重新提交到调度器
    this.taskScheduler.submitTask(fromWorker.currentTask);

    // 更新工作线程状态
    fromWorker.currentTask = undefined;
    this.taskScheduler.updateWorkerStatus(fromWorkerId, 'idle', Math.max(0, fromWorker.info.load - 20));

    // 处理新的任务分配
    this.processNextTasks();
  }

  /**
   * 处理下一批任务
   */
  private processNextTasks(): void {
    for (const [workerId, workerData] of this.workers.entries()) {
      if (workerData.currentTask) {
        continue;
      }

      const task = this.taskScheduler.getNextTask(workerId);
      if (!task) {
        continue;
      }

      try {
        workerData.currentTask = task;
        this.taskScheduler.updateWorkerStatus(workerId, 'busy', Math.min(100, workerData.info.load + 20));

        // 设置任务超时
        workerData.timeoutId = setTimeout(() => {
          this.handleWorkerTimeout(workerId);
        }, task.timeout || this.config.processingTimeout);

        workerData.worker.postMessage(task.data);
      } catch (error) {
        this.taskScheduler.onTaskError(task.id, workerId, error instanceof Error ? error : new Error(String(error)));
        workerData.currentTask = undefined;
        this.taskScheduler.updateWorkerStatus(workerId, 'idle', Math.max(0, workerData.info.load - 10));
      }
    }
  }

  /**
   * 处理工作线程超时
   */
  private handleWorkerTimeout(workerId: number): void {
    const workerData = this.workers.get(workerId);
    if (!workerData || !workerData.currentTask) {
      return;
    }

    const error = new Error(`Worker ${workerId} task timeout`);
    this.taskScheduler.onTaskError(workerData.currentTask.id, workerId, error);
    this.emit('workerTimeout', {
      workerId,
      taskId: workerData.currentTask.id
    });

    // 重新创建工作线程
    this.recycleWorker(workerId);
  }

  /**
   * 提交任务
   */
  public async submitTask<T = any>(data: any): Promise<T> {
    return new Promise((resolve, reject) => {
      try {
        const taskId = this.taskScheduler.submitTask({
          type: data.type || 'default',
          data,
          priority: TaskPriority.NORMAL
        });

        const handleComplete = ({ workerId, data: result }: any) => {
          if (result.taskId === taskId) {
            this.off('taskCompleted', handleComplete);
            this.off('taskError', handleError);
            resolve(result.data);
          }
        };

        const handleError = ({ workerId, error }: any) => {
          if (error.taskId === taskId) {
            this.off('taskCompleted', handleComplete);
            this.off('taskError', handleError);
            reject(error);
          }
        };

        this.on('taskCompleted', handleComplete);
        this.on('taskError', handleError);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * 获取线程池统计信息
   */
  public getStats(): ThreadStats {
    const schedulerStats = this.taskScheduler.getStats();
    const workerStats = Array.from(this.workers.values()).map(({ info }) => ({
      id: info.id,
      status: info.status,
      processedCount: info.processedCount,
      errorCount: info.errorCount,
      avgProcessingTime: info.avgProcessingTime,
      lastProcessedTime: info.lastProcessedTime
    }));

    return {
      activeWorkers: workerStats.filter(w => w.status === 'busy').length,
      idleWorkers: workerStats.filter(w => w.status === 'idle').length,
      totalProcessed: schedulerStats.processedCount,
      errorCount: schedulerStats.errorCount,
      avgProcessingTime: schedulerStats.avgProcessingTime,
      queueSize: schedulerStats.queueSize,
      workerStats
    };
  }

  /**
   * 停止线程池
   */
  public async shutdown(): Promise<void> {
    this.taskScheduler.shutdown();
    
    await Promise.all(
      Array.from(this.workers.values()).map(async ({ worker }) => {
        await worker.terminate();
      })
    );
    
    this.workers.clear();
  }
} 