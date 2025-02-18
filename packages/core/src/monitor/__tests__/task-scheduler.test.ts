import { TaskScheduler, TaskPriority, Task, WorkerInfo } from '../task-scheduler';

describe('TaskScheduler', () => {
  let scheduler: TaskScheduler;
  let mockWorker: WorkerInfo;

  beforeEach(() => {
    scheduler = new TaskScheduler({
      maxQueueSize: 100,
      defaultPriority: TaskPriority.NORMAL,
      defaultTimeout: 5000,
      maxRetries: 3,
      loadBalanceInterval: 1000,
      loadThreshold: 20,
      taskTypes: [
        {
          type: 'critical',
          priority: TaskPriority.CRITICAL,
          timeout: 3000
        },
        {
          type: 'normal',
          priority: TaskPriority.NORMAL
        }
      ]
    });

    mockWorker = {
      id: 1,
      status: 'idle',
      load: 0,
      processedCount: 0,
      errorCount: 0,
      avgProcessingTime: 0,
      specialties: ['critical']
    };

    scheduler.registerWorker(mockWorker);
  });

  afterEach(() => {
    scheduler.shutdown();
  });

  test('initializes with correct configuration', () => {
    const stats = scheduler.getStats();
    expect(stats.queueSize).toBe(0);
    expect(stats.processedCount).toBe(0);
    expect(stats.errorCount).toBe(0);
  });

  test('registers and manages workers correctly', () => {
    const worker2: WorkerInfo = {
      id: 2,
      status: 'idle',
      load: 0,
      processedCount: 0,
      errorCount: 0,
      avgProcessingTime: 0
    };

    scheduler.registerWorker(worker2);
    scheduler.updateWorkerStatus(2, 'busy', 50);

    const task = scheduler.getNextTask(2);
    expect(task).toBeNull();  // 因为状态是 busy
  });

  test('submits and processes tasks with correct priority', () => {
    const taskIds: string[] = [];

    // 提交不同优先级的任务
    taskIds.push(scheduler.submitTask({
      type: 'normal',
      data: { value: 1 },
      priority: TaskPriority.LOW
    }));

    taskIds.push(scheduler.submitTask({
      type: 'critical',
      data: { value: 2 },
      priority: TaskPriority.CRITICAL
    }));

    taskIds.push(scheduler.submitTask({
      type: 'normal',
      data: { value: 3 },
      priority: TaskPriority.NORMAL
    }));

    // 获取任务，应该先获取关键任务
    const task1 = scheduler.getNextTask(1);
    expect(task1?.priority).toBe(TaskPriority.CRITICAL);
    expect(task1?.data.value).toBe(2);

    const task2 = scheduler.getNextTask(1);
    expect(task2?.priority).toBe(TaskPriority.NORMAL);
    expect(task2?.data.value).toBe(3);

    const task3 = scheduler.getNextTask(1);
    expect(task3?.priority).toBe(TaskPriority.LOW);
    expect(task3?.data.value).toBe(1);
  });

  test('handles queue size limits', () => {
    // 填满队列
    for (let i = 0; i < 100; i++) {
      scheduler.submitTask({
        type: 'normal',
        data: { value: i },
        priority: TaskPriority.NORMAL
      });
    }

    // 提交低优先级任务应该失败
    expect(() => {
      scheduler.submitTask({
        type: 'normal',
        data: { value: 'overflow' },
        priority: TaskPriority.LOW
      });
    }).toThrow('Task queue is full');

    // 提交高优先级任务应该成功
    const criticalTaskId = scheduler.submitTask({
      type: 'critical',
      data: { value: 'critical' },
      priority: TaskPriority.CRITICAL
    });

    expect(criticalTaskId).toBeDefined();
  });

  test('maintains worker load balance', () => {
    const worker2: WorkerInfo = {
      id: 2,
      status: 'idle',
      load: 80,  // 高负载
      processedCount: 0,
      errorCount: 0,
      avgProcessingTime: 0
    };

    const worker3: WorkerInfo = {
      id: 3,
      status: 'idle',
      load: 20,  // 低负载
      processedCount: 0,
      errorCount: 0,
      avgProcessingTime: 0
    };

    scheduler.registerWorker(worker2);
    scheduler.registerWorker(worker3);

    // 等待负载均衡
    return new Promise<void>(resolve => {
      scheduler.on('redistributeTasks', ({ fromWorkerId, toWorkerIds, taskCount }) => {
        expect(fromWorkerId).toBe(2);  // 高负载工作线程
        expect(toWorkerIds).toContain(3);  // 低负载工作线程
        expect(taskCount).toBeGreaterThan(0);
        resolve();
      });
    });
  });

  test('handles worker specialties', () => {
    // 提交特殊任务和普通任务
    scheduler.submitTask({
      type: 'normal',
      data: { value: 1 },
      priority: TaskPriority.NORMAL
    });

    scheduler.submitTask({
      type: 'critical',
      data: { value: 2 },
      priority: TaskPriority.NORMAL  // 即使优先级相同
    });

    // 获取任务，应该优先获取专长任务
    const task = scheduler.getNextTask(1);
    expect(task?.type).toBe('critical');
    expect(task?.data.value).toBe(2);
  });

  test('updates statistics correctly', () => {
    const taskId = scheduler.submitTask({
      type: 'normal',
      data: { value: 1 },
      priority: TaskPriority.NORMAL
    });

    scheduler.onTaskCompleted(taskId, 1, 100);  // 处理时间 100ms

    const stats = scheduler.getStats();
    expect(stats.processedCount).toBe(1);
    expect(stats.avgProcessingTime).toBe(100);
    expect(stats.errorCount).toBe(0);

    scheduler.onTaskError(taskId, 1, new Error('Test error'));

    const updatedStats = scheduler.getStats();
    expect(updatedStats.errorCount).toBe(1);
  });

  test('handles task timeouts and retries', () => {
    const taskId = scheduler.submitTask({
      type: 'critical',
      data: { value: 1 },
      timeout: 1000,
      maxRetries: 2
    });

    const task = scheduler.getNextTask(1);
    expect(task?.id).toBe(taskId);
    expect(task?.timeout).toBe(1000);
    expect(task?.maxRetries).toBe(2);
  });

  test('maintains task type statistics', () => {
    // 提交不同类型的任务
    scheduler.submitTask({
      type: 'critical',
      data: { value: 1 }
    });

    scheduler.submitTask({
      type: 'normal',
      data: { value: 2 }
    });

    const stats = scheduler.getStats();
    expect(stats.typeStats['critical'].queued).toBe(1);
    expect(stats.typeStats['normal'].queued).toBe(1);
  });

  test('gracefully shuts down', () => {
    // 提交一些任务
    scheduler.submitTask({
      type: 'normal',
      data: { value: 1 }
    });

    scheduler.submitTask({
      type: 'critical',
      data: { value: 2 }
    });

    // 关闭调度器
    scheduler.shutdown();

    const stats = scheduler.getStats();
    expect(stats.queueSize).toBe(0);
    expect(Array.from(scheduler['workers'].values())).toHaveLength(0);
  });
}); 