import { EventEmitter } from 'events';
import { BaseError } from '../types/errors';
import * as parser from 'cron-parser';

export class SchedulerError extends BaseError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'SchedulerError';
  }
}

export interface Task {
  id: string;
  name: string;
  schedule: string; // cron 表达式
  handler: () => Promise<void>;
  lastRun?: Date;
  nextRun?: Date;
  status: 'idle' | 'running' | 'failed' | 'completed';
  error?: Error;
}

export interface SchedulerConfig {
  maxConcurrent?: number;
  errorRetryCount?: number;
  errorRetryDelay?: number; // 毫秒
}

export class TaskScheduler extends EventEmitter {
  private tasks: Map<string, Task>;
  private timers: Map<string, NodeJS.Timeout>;
  private config: Required<SchedulerConfig>;
  private runningTasks: Set<string>;

  constructor(config: SchedulerConfig = {}) {
    super();
    this.tasks = new Map();
    this.timers = new Map();
    this.runningTasks = new Set();
    this.config = {
      maxConcurrent: config.maxConcurrent || 5,
      errorRetryCount: config.errorRetryCount || 3,
      errorRetryDelay: config.errorRetryDelay || 5000
    };
  }

  /**
   * 添加定时任务
   */
  addTask(task: Omit<Task, 'status' | 'lastRun' | 'nextRun'>): void {
    if (this.tasks.has(task.id)) {
      throw new SchedulerError(`Task with id ${task.id} already exists`);
    }

    const newTask: Task = {
      ...task,
      status: 'idle',
      lastRun: undefined,
      nextRun: this.getNextRunTime(task.schedule)
    };

    this.tasks.set(task.id, newTask);
    this.scheduleTask(newTask);
    this.emit('taskAdded', newTask);
  }

  /**
   * 移除定时任务
   */
  removeTask(taskId: string): boolean {
    const timer = this.timers.get(taskId);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(taskId);
    }
    const task = this.tasks.get(taskId);
    const deleted = this.tasks.delete(taskId);
    if (deleted && task) {
      this.emit('taskRemoved', task);
    }
    return deleted;
  }

  /**
   * 获取所有任务
   */
  getTasks(): Task[] {
    return Array.from(this.tasks.values());
  }

  /**
   * 获取任务状态
   */
  getTaskStatus(taskId: string): Task | undefined {
    return this.tasks.get(taskId);
  }

  /**
   * 手动触发任务
   */
  async triggerTask(taskId: string): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new SchedulerError(`Task ${taskId} not found`);
    }

    if (this.runningTasks.size >= this.config.maxConcurrent) {
      throw new SchedulerError('Max concurrent tasks limit reached');
    }

    await this.executeTask(task);
  }

  /**
   * 停止所有任务
   */
  stop(): void {
    for (const [taskId, timer] of this.timers.entries()) {
      clearTimeout(timer);
      this.timers.delete(taskId);
    }
    this.emit('stopped');
  }

  private async executeTask(task: Task, retryCount = 0): Promise<void> {
    if (this.runningTasks.has(task.id)) {
      return;
    }

    this.runningTasks.add(task.id);
    task.status = 'running';
    task.lastRun = new Date();
    this.emit('taskStarted', task);

    try {
      await task.handler();
      task.status = 'completed';
      task.error = undefined;
      this.emit('taskCompleted', task);
    } catch (error) {
      task.status = 'failed';
      task.error = error as Error;
      this.emit('taskFailed', task, error);

      if (retryCount < this.config.errorRetryCount) {
        setTimeout(() => {
          this.executeTask(task, retryCount + 1);
        }, this.config.errorRetryDelay);
        return;
      }
    } finally {
      this.runningTasks.delete(task.id);
      task.nextRun = this.getNextRunTime(task.schedule);
      this.scheduleTask(task);
    }
  }

  private scheduleTask(task: Task): void {
    if (!task.nextRun) {
      return;
    }

    const delay = task.nextRun.getTime() - Date.now();
    if (delay <= 0) {
      this.executeTask(task);
      return;
    }

    const timer = setTimeout(() => {
      this.executeTask(task);
    }, delay);

    const existingTimer = this.timers.get(task.id);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }
    this.timers.set(task.id, timer);
  }

  private getNextRunTime(schedule: string): Date {
    try {
      const interval = parser.parseExpression(schedule);
      return interval.next().toDate();
    } catch (error) {
      throw new SchedulerError(`Invalid cron expression: ${schedule}`, { cause: error });
    }
  }
} 