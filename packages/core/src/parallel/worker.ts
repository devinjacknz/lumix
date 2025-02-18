import { Worker } from 'worker_threads';
import { EventEmitter } from 'events';
import { BaseError } from '../types/errors';

/**
 * 工作池错误
 */
export class WorkerPoolError extends BaseError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'WorkerPoolError';
  }
}

/**
 * 工作池配置
 */
export interface WorkerPoolConfig {
  size?: number;
  taskTimeout?: number;
  maxRetries?: number;
  retryDelay?: number;
  workerOptions?: {
    resourceLimits?: {
      maxOldGenerationSizeMb?: number;
      maxYoungGenerationSizeMb?: number;
      codeRangeSizeMb?: number;
      stackSizeMb?: number;
    };
  };
}

/**
 * 工作任务
 */
export interface WorkerTask<T = any> {
  id: string;
  script: string;
  data?: any;
  timeout?: number;
  retries?: number;
  retryDelay?: number;
  callback?: (error: Error | null, result?: T) => void;
}

/**
 * 工作池
 */
export class WorkerPool extends EventEmitter {
  private workers: Array<{
    worker: Worker;
    busy: boolean;
    taskId?: string;
  }>;
  private config: Required<WorkerPoolConfig>;
  private tasks: WorkerTask[];
  private results: Map<string, any>;
  private errors: Map<string, Error>;
  private retries: Map<string, number>;

  constructor(config: WorkerPoolConfig = {}) {
    super();
    this.config = {
      size: config.size || 4,
      taskTimeout: config.taskTimeout || 30000,
      maxRetries: config.maxRetries || 3,
      retryDelay: config.retryDelay || 1000,
      workerOptions: {
        resourceLimits: {
          maxOldGenerationSizeMb: config.workerOptions?.resourceLimits?.maxOldGenerationSizeMb || 512,
          maxYoungGenerationSizeMb: config.workerOptions?.resourceLimits?.maxYoungGenerationSizeMb || 128,
          codeRangeSizeMb: config.workerOptions?.resourceLimits?.codeRangeSizeMb || 64,
          stackSizeMb: config.workerOptions?.resourceLimits?.stackSizeMb || 4
        }
      }
    };

    this.workers = [];
    this.tasks = [];
    this.results = new Map();
    this.errors = new Map();
    this.retries = new Map();

    this.initialize();
  }

  /**
   * 初始化工作池
   */
  private initialize(): void {
    for (let i = 0; i < this.config.size; i++) {
      this.createWorker();
    }
  }

  /**
   * 创建工作线程
   */
  private createWorker(): void {
    const worker = new Worker(`
      const { parentPort } = require('worker_threads');
      
      parentPort.on('message', async ({ taskId, script, data }) => {
        try {
          const fn = new Function('data', script);
          const result = await fn(data);
          parentPort.postMessage({ taskId, result });
        } catch (error) {
          parentPort.postMessage({ 
            taskId, 
            error: {
              message: error.message,
              stack: error.stack
            }
          });
        }
      });
    `, {
      eval: true,
      resourceLimits: this.config.workerOptions.resourceLimits
    });

    worker.on('message', this.handleWorkerMessage.bind(this));
    worker.on('error', this.handleWorkerError.bind(this));
    worker.on('exit', (code) => {
      if (code !== 0) {
        this.handleWorkerExit(worker, code);
      }
    });

    this.workers.push({
      worker,
      busy: false
    });
  }

  /**
   * 执行任务
   */
  async executeTask<T = any>(task: WorkerTask<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      task.callback = (error, result) => {
        if (error) reject(error);
        else resolve(result as T);
      };
      this.addTask(task);
    });
  }

  /**
   * 添加任务
   */
  private addTask(task: WorkerTask): void {
    this.tasks.push(task);
    this.processNextTask();
  }

  /**
   * 处理下一个任务
   */
  private processNextTask(): void {
    if (this.tasks.length === 0) return;

    const availableWorker = this.workers.find(w => !w.busy);
    if (!availableWorker) return;

    const task = this.tasks.shift();
    if (!task) return;

    availableWorker.busy = true;
    availableWorker.taskId = task.id;

    // 设置任务超时
    const timeout = setTimeout(() => {
      this.handleTaskTimeout(task);
    }, task.timeout || this.config.taskTimeout);

    // 发送任务到工作线程
    availableWorker.worker.postMessage({
      taskId: task.id,
      script: task.script,
      data: task.data
    });

    this.emit('taskStarted', task);
  }

  /**
   * 处理工作线程消息
   */
  private handleWorkerMessage(message: { taskId: string; result?: any; error?: Error }): void {
    const worker = this.workers.find(w => w.taskId === message.taskId);
    if (!worker) return;

    worker.busy = false;
    worker.taskId = undefined;

    if (message.error) {
      this.handleTaskError(message.taskId, message.error);
    } else {
      this.handleTaskSuccess(message.taskId, message.result);
    }

    this.processNextTask();
  }

  /**
   * 处理任务成功
   */
  private handleTaskSuccess(taskId: string, result: any): void {
    this.results.set(taskId, result);
    this.emit('taskCompleted', { taskId, result });

    const task = this.tasks.find(t => t.id === taskId);
    if (task?.callback) {
      task.callback(null, result);
    }
  }

  /**
   * 处理任务错误
   */
  private handleTaskError(taskId: string, error: Error): void {
    const retryCount = (this.retries.get(taskId) || 0) + 1;
    const task = this.tasks.find(t => t.id === taskId);

    if (task && retryCount <= (task.retries || this.config.maxRetries)) {
      // 重试任务
      this.retries.set(taskId, retryCount);
      this.emit('taskRetry', { taskId, error, retryCount });

      setTimeout(() => {
        this.addTask(task);
      }, task.retryDelay || this.config.retryDelay);
    } else {
      // 任务失败
      this.errors.set(taskId, error);
      this.emit('taskFailed', { taskId, error });

      if (task?.callback) {
        task.callback(error);
      }
    }
  }

  /**
   * 处理任务超时
   */
  private handleTaskTimeout(task: WorkerTask): void {
    const error = new WorkerPoolError(`Task ${task.id} timed out`);
    this.handleTaskError(task.id, error);
  }

  /**
   * 处理工作线程错误
   */
  private handleWorkerError(error: Error): void {
    this.emit('workerError', error);
  }

  /**
   * 处理工作线程退出
   */
  private handleWorkerExit(worker: Worker, code: number): void {
    this.emit('workerExit', { worker, code });

    // 移除退出的工作线程
    const index = this.workers.findIndex(w => w.worker === worker);
    if (index !== -1) {
      this.workers.splice(index, 1);
    }

    // 创建新的工作线程
    this.createWorker();
  }

  /**
   * 获取任务结果
   */
  getTaskResult(taskId: string): any {
    return this.results.get(taskId);
  }

  /**
   * 获取任务错误
   */
  getTaskError(taskId: string): Error | undefined {
    return this.errors.get(taskId);
  }

  /**
   * 获取工作池状态
   */
  getStatus(): {
    size: number;
    busy: number;
    queued: number;
    completed: number;
    failed: number;
  } {
    return {
      size: this.workers.length,
      busy: this.workers.filter(w => w.busy).length,
      queued: this.tasks.length,
      completed: this.results.size,
      failed: this.errors.size
    };
  }

  /**
   * 关闭工作池
   */
  async close(): Promise<void> {
    await Promise.all(
      this.workers.map(w => w.worker.terminate())
    );
    this.workers = [];
    this.tasks = [];
    this.results.clear();
    this.errors.clear();
    this.retries.clear();
  }
} 