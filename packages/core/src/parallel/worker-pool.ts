import { Worker } from 'worker_threads';
import { EventEmitter } from 'events';
import * as path from 'path';
import * as os from 'os';

export interface WorkerPoolConfig {
  minWorkers?: number;
  maxWorkers?: number;
  idleTimeout?: number;
  taskTimeout?: number;
  workerOptions?: {
    resourceLimits?: {
      maxOldGenerationSizeMb?: number;
      maxYoungGenerationSizeMb?: number;
      codeRangeSizeMb?: number;
      stackSizeMb?: number;
    };
  };
}

export interface WorkerTask {
  id: string;
  type: string;
  data: any;
  priority?: number;
  timeout?: number;
  retries?: number;
}

export interface WorkerInfo {
  id: string;
  status: 'idle' | 'busy' | 'starting' | 'stopping' | 'error';
  taskCount: number;
  startTime: number;
  lastActive: number;
  currentTask?: string;
  performance: {
    avgExecutionTime: number;
    successRate: number;
    memoryUsage: number;
    cpuUsage: number;
  };
}

export interface TaskResult {
  taskId: string;
  workerId: string;
  result: any;
  error?: Error;
  duration: number;
  retries: number;
}

export class WorkerPool extends EventEmitter {
  private workers: Map<string, Worker> = new Map();
  private workerInfo: Map<string, WorkerInfo> = new Map();
  private taskQueue: WorkerTask[] = [];
  private activeTaskCount: number = 0;
  private isShuttingDown: boolean = false;

  constructor(
    private workerScript: string,
    private config: WorkerPoolConfig = {}
  ) {
    super();
    this.config = {
      minWorkers: config.minWorkers || Math.max(1, Math.floor(os.cpus().length / 2)),
      maxWorkers: config.maxWorkers || os.cpus().length,
      idleTimeout: config.idleTimeout || 60000,
      taskTimeout: config.taskTimeout || 30000,
      workerOptions: config.workerOptions || {},
    };
    this.initialize();
  }

  private async initialize() {
    // 创建初始工作线程
    for (let i = 0; i < this.config.minWorkers!; i++) {
      await this.createWorker();
    }

    // 启动工作线程管理
    this.startWorkerManagement();
  }

  private async createWorker(): Promise<string> {
    const workerId = `worker-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      const worker = new Worker(path.resolve(this.workerScript), {
        resourceLimits: this.config.workerOptions?.resourceLimits,
      });

      // 设置工作线程信息
      this.workerInfo.set(workerId, {
        id: workerId,
        status: 'starting',
        taskCount: 0,
        startTime: Date.now(),
        lastActive: Date.now(),
        performance: {
          avgExecutionTime: 0,
          successRate: 1,
          memoryUsage: 0,
          cpuUsage: 0,
        },
      });

      // 设置事件处理器
      this.setupWorkerEventHandlers(worker, workerId);

      // 存储工作线程
      this.workers.set(workerId, worker);

      // 更新状态
      this.updateWorkerStatus(workerId, 'idle');

      this.emit('workerCreated', { workerId });
      return workerId;
    } catch (error) {
      this.emit('workerError', { workerId, error });
      throw error;
    }
  }

  private setupWorkerEventHandlers(worker: Worker, workerId: string) {
    // 消息处理
    worker.on('message', (message) => {
      this.handleWorkerMessage(workerId, message);
    });

    // 错误处理
    worker.on('error', (error) => {
      this.handleWorkerError(workerId, error);
    });

    // 退出处理
    worker.on('exit', (code) => {
      this.handleWorkerExit(workerId, code);
    });

    // 在线程启动时发送初始化消息
    worker.postMessage({
      type: 'init',
      workerId,
      config: this.config,
    });
  }

  private handleWorkerMessage(workerId: string, message: any) {
    const info = this.workerInfo.get(workerId);
    if (!info) return;

    switch (message.type) {
      case 'taskComplete':
        this.handleTaskComplete(workerId, message.data);
        break;
      case 'taskError':
        this.handleTaskError(workerId, message.data);
        break;
      case 'metrics':
        this.updateWorkerMetrics(workerId, message.data);
        break;
      case 'ready':
        this.updateWorkerStatus(workerId, 'idle');
        this.processNextTask();
        break;
    }
  }

  private handleWorkerError(workerId: string, error: Error) {
    const info = this.workerInfo.get(workerId);
    if (!info) return;

    this.updateWorkerStatus(workerId, 'error');
    this.emit('workerError', { workerId, error });

    // 如果工作线程出错，尝试重新创建
    this.recycleWorker(workerId);
  }

  private handleWorkerExit(workerId: string, code: number) {
    const info = this.workerInfo.get(workerId);
    if (!info) return;

    this.workers.delete(workerId);
    this.workerInfo.delete(workerId);

    this.emit('workerExit', { workerId, code });

    // 如果不是正常关闭，且池未关闭，则创建新的工作线程
    if (code !== 0 && !this.isShuttingDown) {
      this.createWorker();
    }
  }

  private async recycleWorker(workerId: string) {
    try {
      const worker = this.workers.get(workerId);
      if (worker) {
        await worker.terminate();
      }
      this.workers.delete(workerId);
      this.workerInfo.delete(workerId);

      // 创建新的工作线程
      if (!this.isShuttingDown) {
        await this.createWorker();
      }
    } catch (error) {
      this.emit('error', error);
    }
  }

  private updateWorkerStatus(workerId: string, status: WorkerInfo['status']) {
    const info = this.workerInfo.get(workerId);
    if (info) {
      info.status = status;
      info.lastActive = Date.now();
      this.emit('workerStatusChanged', { workerId, status });
    }
  }

  private updateWorkerMetrics(workerId: string, metrics: any) {
    const info = this.workerInfo.get(workerId);
    if (info) {
      info.performance = {
        ...info.performance,
        ...metrics,
      };
    }
  }

  async executeTask(task: WorkerTask): Promise<TaskResult> {
    if (this.isShuttingDown) {
      throw new Error('Worker pool is shutting down');
    }

    return new Promise((resolve, reject) => {
      const timeout = task.timeout || this.config.taskTimeout;
      let timeoutId: NodeJS.Timeout;

      // 创建任务包装器
      const taskWrapper = {
        ...task,
        _resolve: resolve,
        _reject: reject,
        _startTime: Date.now(),
        _timeoutId: null as NodeJS.Timeout | null,
        _retries: 0,
      };

      // 设置超时处理
      if (timeout) {
        timeoutId = setTimeout(() => {
          this.handleTaskTimeout(taskWrapper);
        }, timeout);
        taskWrapper._timeoutId = timeoutId;
      }

      // 添加到任务队列
      this.addToTaskQueue(taskWrapper);
    });
  }

  private addToTaskQueue(task: any) {
    // 根据优先级插入任务
    const index = this.taskQueue.findIndex(t => 
      (t.priority || 0) < (task.priority || 0)
    );
    
    if (index === -1) {
      this.taskQueue.push(task);
    } else {
      this.taskQueue.splice(index, 0, task);
    }

    this.processNextTask();
  }

  private async processNextTask() {
    if (this.taskQueue.length === 0) return;

    // 获取空闲的工作线程
    const availableWorker = this.getAvailableWorker();
    if (!availableWorker) {
      // 如果没有可用的工作线程，且未达到最大线程数，则创建新的工作线程
      if (this.workers.size < this.config.maxWorkers!) {
        await this.createWorker();
      }
      return;
    }

    // 获取下一个任务
    const task = this.taskQueue.shift();
    if (!task) return;

    this.assignTaskToWorker(availableWorker, task);
  }

  private getAvailableWorker(): string | null {
    for (const [workerId, info] of this.workerInfo.entries()) {
      if (info.status === 'idle') {
        return workerId;
      }
    }
    return null;
  }

  private assignTaskToWorker(workerId: string, task: any) {
    const worker = this.workers.get(workerId);
    if (!worker) return;

    // 更新工作线程状态
    this.updateWorkerStatus(workerId, 'busy');
    const info = this.workerInfo.get(workerId)!;
    info.taskCount++;
    info.currentTask = task.id;

    // 发送任务到工作线程
    worker.postMessage({
      type: 'task',
      id: task.id,
      data: task.data,
    });

    this.activeTaskCount++;
  }

  private handleTaskComplete(workerId: string, result: any) {
    const info = this.workerInfo.get(workerId);
    if (!info) return;

    // 更新工作线程状态
    this.updateWorkerStatus(workerId, 'idle');
    info.currentTask = undefined;
    this.activeTaskCount--;

    // 处理任务结果
    const task = this.findTask(result.taskId);
    if (task) {
      // 清除超时定时器
      if (task._timeoutId) {
        clearTimeout(task._timeoutId);
      }

      // 计算任务执行时间
      const duration = Date.now() - task._startTime;

      // 更新性能指标
      this.updateTaskMetrics(workerId, duration, true);

      // 返回结果
      task._resolve({
        taskId: result.taskId,
        workerId,
        result: result.data,
        duration,
        retries: task._retries,
      });
    }

    // 处理下一个任务
    this.processNextTask();
  }

  private handleTaskError(workerId: string, error: any) {
    const info = this.workerInfo.get(workerId);
    if (!info) return;

    // 更新工作线程状态
    this.updateWorkerStatus(workerId, 'idle');
    const taskId = info.currentTask;
    info.currentTask = undefined;
    this.activeTaskCount--;

    // 处理任务错误
    if (taskId) {
      const task = this.findTask(taskId);
      if (task) {
        // 清除超时定时器
        if (task._timeoutId) {
          clearTimeout(task._timeoutId);
        }

        // 更新性能指标
        this.updateTaskMetrics(workerId, Date.now() - task._startTime, false);

        // 如果还有重试次数，重新加入队列
        if (task._retries < (task.retries || 0)) {
          task._retries++;
          this.addToTaskQueue(task);
        } else {
          // 否则返回错误
          task._reject(error);
        }
      }
    }

    // 处理下一个任务
    this.processNextTask();
  }

  private handleTaskTimeout(task: any) {
    const error = new Error(`Task ${task.id} timed out`);
    
    // 如果还有重试次数，重新加入队列
    if (task._retries < (task.retries || 0)) {
      task._retries++;
      this.addToTaskQueue(task);
    } else {
      task._reject(error);
    }
  }

  private findTask(taskId: string): any {
    return this.taskQueue.find(task => task.id === taskId);
  }

  private updateTaskMetrics(workerId: string, duration: number, success: boolean) {
    const info = this.workerInfo.get(workerId);
    if (!info) return;

    // 更新平均执行时间
    const oldAvg = info.performance.avgExecutionTime;
    const count = info.taskCount;
    info.performance.avgExecutionTime = 
      (oldAvg * (count - 1) + duration) / count;

    // 更新成功率
    const oldSuccessCount = info.performance.successRate * (count - 1);
    info.performance.successRate = 
      (oldSuccessCount + (success ? 1 : 0)) / count;
  }

  private startWorkerManagement() {
    // 定期检查工作线程状态
    setInterval(() => {
      this.manageWorkers();
    }, 5000);

    // 定期收集性能指标
    setInterval(() => {
      this.collectMetrics();
    }, 1000);
  }

  private async manageWorkers() {
    const now = Date.now();

    // 检查空闲工作线程
    for (const [workerId, info] of this.workerInfo.entries()) {
      if (
        info.status === 'idle' &&
        now - info.lastActive > this.config.idleTimeout! &&
        this.workers.size > this.config.minWorkers!
      ) {
        await this.recycleWorker(workerId);
      }
    }

    // 检查是否需要创建新的工作线程
    if (
      this.taskQueue.length > 0 &&
      this.workers.size < this.config.maxWorkers! &&
      this.getAvailableWorker() === null
    ) {
      await this.createWorker();
    }
  }

  private async collectMetrics() {
    for (const [workerId, worker] of this.workers.entries()) {
      worker.postMessage({ type: 'getMetrics' });
    }
  }

  getStats() {
    return {
      workers: {
        total: this.workers.size,
        busy: Array.from(this.workerInfo.values()).filter(
          w => w.status === 'busy'
        ).length,
        idle: Array.from(this.workerInfo.values()).filter(
          w => w.status === 'idle'
        ).length,
      },
      tasks: {
        active: this.activeTaskCount,
        queued: this.taskQueue.length,
      },
      performance: {
        avgExecutionTime: this.calculateAverageExecutionTime(),
        successRate: this.calculateSuccessRate(),
      },
    };
  }

  private calculateAverageExecutionTime(): number {
    const times = Array.from(this.workerInfo.values()).map(
      w => w.performance.avgExecutionTime
    );
    return times.reduce((a, b) => a + b, 0) / times.length;
  }

  private calculateSuccessRate(): number {
    const rates = Array.from(this.workerInfo.values()).map(
      w => w.performance.successRate
    );
    return rates.reduce((a, b) => a + b, 0) / rates.length;
  }

  async shutdown(): Promise<void> {
    this.isShuttingDown = true;

    // 等待所有任务完成
    while (this.activeTaskCount > 0 || this.taskQueue.length > 0) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // 终止所有工作线程
    const terminationPromises = Array.from(this.workers.values()).map(
      worker => worker.terminate()
    );
    await Promise.all(terminationPromises);

    // 清理状态
    this.workers.clear();
    this.workerInfo.clear();
    this.taskQueue = [];
    this.activeTaskCount = 0;

    this.emit('shutdown');
  }
}

export { WorkerPool, WorkerPoolConfig, WorkerTask, WorkerInfo, TaskResult }; 