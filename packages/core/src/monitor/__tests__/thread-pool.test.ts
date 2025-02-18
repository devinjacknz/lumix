import { ThreadPool } from '../thread-pool';

describe('ThreadPool', () => {
  let pool: ThreadPool;

  beforeEach(() => {
    pool = new ThreadPool({
      minWorkers: 2,
      maxWorkers: 4,
      idleTimeout: 1000,
      processingTimeout: 2000,
      scaleUpThreshold: 2,
      scaleDownThreshold: 0.5
    });
  });

  afterEach(async () => {
    await pool.shutdown();
  });

  test('initializes with correct configuration', () => {
    const stats = pool.getStats();
    expect(stats.activeWorkers).toBe(0);
    expect(stats.idleWorkers).toBe(2);
    expect(stats.workerStats).toHaveLength(2);
  });

  test('processes tasks successfully', async () => {
    const results = await Promise.all([
      pool.submitTask({ type: 'test', data: 1 }),
      pool.submitTask({ type: 'test', data: 2 }),
      pool.submitTask({ type: 'test', data: 3 })
    ]);

    expect(results).toHaveLength(3);
    const stats = pool.getStats();
    expect(stats.totalProcessed).toBe(3);
    expect(stats.errorCount).toBe(0);
  });

  test('scales up when queue size increases', async () => {
    const scalingEvents: Array<{ direction: 'up' | 'down'; workers: number }> = [];
    pool.on('poolScaled', (event) => {
      scalingEvents.push(event);
    });

    // 提交大量任务触发扩容
    const tasks = Array.from({ length: 10 }, (_, i) => ({
      type: 'test',
      data: i
    }));

    await Promise.all(tasks.map(task => pool.submitTask(task)));

    expect(scalingEvents.length).toBeGreaterThan(0);
    expect(scalingEvents.some(e => e.direction === 'up')).toBe(true);
    expect(pool.getStats().workerStats.length).toBeGreaterThan(2);
  });

  test('scales down when workers are idle', async () => {
    // 首先扩容
    const tasks = Array.from({ length: 8 }, (_, i) => ({
      type: 'test',
      data: i
    }));

    await Promise.all(tasks.map(task => pool.submitTask(task)));

    // 等待空闲超时
    await new Promise(resolve => setTimeout(resolve, 1500));

    const stats = pool.getStats();
    expect(stats.workerStats.length).toBeLessThanOrEqual(3);
  });

  test('handles worker errors gracefully', async () => {
    const errorEvents: Array<{ workerId: number; error: Error }> = [];
    pool.on('workerError', (event) => {
      errorEvents.push(event);
    });

    // 提交会导致错误的任务
    await expect(pool.submitTask({ type: 'error' })).rejects.toThrow();

    expect(errorEvents.length).toBeGreaterThan(0);
    const stats = pool.getStats();
    expect(stats.errorCount).toBeGreaterThan(0);
  });

  test('handles worker timeouts', async () => {
    const timeoutEvents: Array<{ workerId: number }> = [];
    pool.on('workerTimeout', (event) => {
      timeoutEvents.push(event);
    });

    // 创建一个超时的任务
    const timeoutPool = new ThreadPool({
      minWorkers: 1,
      processingTimeout: 100
    });

    await expect(timeoutPool.submitTask({ type: 'timeout' })).rejects.toThrow();

    expect(timeoutEvents.length).toBeGreaterThan(0);
    await timeoutPool.shutdown();
  });

  test('maintains worker statistics', async () => {
    // 提交一些任务
    await Promise.all([
      pool.submitTask({ type: 'test', data: 1 }),
      pool.submitTask({ type: 'test', data: 2 })
    ]);

    const stats = pool.getStats();
    expect(stats.totalProcessed).toBe(2);
    expect(stats.avgProcessingTime).toBeGreaterThan(0);
    expect(stats.workerStats.some(w => w.processedCount > 0)).toBe(true);
  });

  test('respects worker limits', async () => {
    const limitedPool = new ThreadPool({
      minWorkers: 1,
      maxWorkers: 2
    });

    // 提交大量任务
    const tasks = Array.from({ length: 10 }, (_, i) => ({
      type: 'test',
      data: i
    }));

    await Promise.all(tasks.map(task => limitedPool.submitTask(task)));

    const stats = limitedPool.getStats();
    expect(stats.workerStats.length).toBeLessThanOrEqual(2);

    await limitedPool.shutdown();
  });

  test('handles concurrent task submission', async () => {
    const concurrentTasks = 20;
    const results = await Promise.all(
      Array.from({ length: concurrentTasks }, (_, i) => 
        pool.submitTask({ type: 'test', data: i })
      )
    );

    expect(results).toHaveLength(concurrentTasks);
    const stats = pool.getStats();
    expect(stats.totalProcessed).toBe(concurrentTasks);
  });

  test('gracefully shuts down', async () => {
    // 提交一些任务
    const tasks = Array.from({ length: 5 }, (_, i) => ({
      type: 'test',
      data: i
    }));

    const taskPromises = tasks.map(task => pool.submitTask(task));
    
    // 立即关闭线程池
    await pool.shutdown();

    // 验证状态
    const stats = pool.getStats();
    expect(stats.activeWorkers).toBe(0);
    expect(stats.workerStats).toHaveLength(0);
    expect(stats.queueSize).toBe(0);

    // 确保所有任务都被拒绝
    await expect(Promise.all(taskPromises)).rejects.toThrow();
  });

  test('balances load across workers', async () => {
    const tasks = Array.from({ length: 10 }, (_, i) => ({
      type: 'test',
      data: i
    }));

    await Promise.all(tasks.map(task => pool.submitTask(task)));

    const stats = pool.getStats();
    const processedCounts = stats.workerStats.map(w => w.processedCount);
    
    // 检查任务分配是否相对均衡
    const maxDiff = Math.max(...processedCounts) - Math.min(...processedCounts);
    expect(maxDiff).toBeLessThanOrEqual(2);
  });
}); 