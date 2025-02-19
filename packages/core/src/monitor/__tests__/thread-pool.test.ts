import { describe, expect, test, beforeEach, afterEach } from '@jest/globals';
import { ThreadPool, ThreadPoolConfig, Task } from '../thread-pool';

describe('ThreadPool', () => {
  let pool: ThreadPool;

  beforeEach(() => {
    pool = new ThreadPool({
      minWorkers: 2,
      maxWorkers: 4,
      idleTimeout: 1000,
      taskTimeout: 5000
    });
  });

  afterEach(async () => {
    await pool.stop();
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
    expect(results).toEqual([1, 2, 3]);
  }, 60000);

  test('scales up when queue size increases', async () => {
    const scalingEvents: Array<{ direction: 'up' | 'down'; workers: number }> = [];
    pool.on('poolScaled', (event) => {
      scalingEvents.push(event);
    });

    // Submit many tasks to trigger scaling up
    const tasks = Array.from({ length: 10 }, (_, i) => ({
      type: 'test',
      data: i
    }));

    await Promise.all(tasks.map(task => pool.submitTask(task)));

    expect(scalingEvents.length).toBeGreaterThan(0);
    expect(scalingEvents[0].direction).toBe('up');
  }, 60000);

  test('scales down when workers are idle', async () => {
    // First scale up
    const tasks = Array.from({ length: 8 }, (_, i) => ({
      type: 'test',
      data: i
    }));

    await Promise.all(tasks.map(task => pool.submitTask(task)));

    // Wait for idle timeout
    await new Promise(resolve => setTimeout(resolve, 2000));

    const stats = pool.getStats();
    expect(stats.activeWorkers).toBeLessThanOrEqual(pool.config.minWorkers);
  }, 60000);

  test('handles worker errors gracefully', async () => {
    const errorEvents: Array<{ workerId: number; error: Error }> = [];
    pool.on('workerError', (event) => {
      errorEvents.push(event);
    });

    await pool.submitTask({ type: 'error', data: 'test error' });

    expect(errorEvents.length).toBeGreaterThan(0);
    expect(errorEvents[0].error.message).toContain('test error');
  }, 60000);

  test('handles worker timeouts', async () => {
    const timeoutEvents: Array<{ workerId: number }> = [];
    pool.on('workerTimeout', (event) => {
      timeoutEvents.push(event);
    });

    await pool.submitTask({ type: 'timeout', data: 'test timeout' });

    expect(timeoutEvents.length).toBeGreaterThan(0);
  }, 60000);

  test('maintains worker statistics', async () => {
    // Submit some tasks
    await Promise.all([
      pool.submitTask({ type: 'test', data: 1 }),
      pool.submitTask({ type: 'test', data: 2 })
    ]);

    const stats = pool.getStats();
    expect(stats.totalTasks).toBeGreaterThan(0);
    expect(stats.completedTasks).toBeGreaterThan(0);
    expect(stats.avgProcessingTime).toBeGreaterThanOrEqual(0);
  }, 60000);

  test('respects worker limits', async () => {
    const limitedPool = new ThreadPool({
      minWorkers: 1,
      maxWorkers: 2,
      idleTimeout: 1000,
      taskTimeout: 5000
    });

    const tasks = Array.from({ length: 5 }, (_, i) => ({
      type: 'test',
      data: i
    }));

    await Promise.all(tasks.map(task => limitedPool.submitTask(task)));

    const stats = limitedPool.getStats();
    expect(stats.activeWorkers).toBeLessThanOrEqual(2);

    await limitedPool.stop();
  }, 60000);

  test('handles concurrent task submission', async () => {
    const concurrentTasks = 20;
    const results = await Promise.all(
      Array.from({ length: concurrentTasks }, (_, i) => 
        pool.submitTask({ type: 'test', data: i })
      )
    );

    expect(results).toHaveLength(concurrentTasks);
    expect(new Set(results).size).toBe(concurrentTasks);
  }, 60000);

  test('gracefully shuts down', async () => {
    // Submit some tasks
    const tasks = Array.from({ length: 5 }, (_, i) => ({
      type: 'test',
      data: i
    }));

    const taskPromises = tasks.map(task => pool.submitTask(task));

    // Start shutdown while tasks are running
    const shutdownPromise = pool.stop();

    // Wait for all tasks and shutdown
    await Promise.all([...taskPromises, shutdownPromise]);

    const stats = pool.getStats();
    expect(stats.activeWorkers).toBe(0);
  }, 60000);

  test('balances load across workers', async () => {
    const tasks = Array.from({ length: 10 }, (_, i) => ({
      type: 'test',
      data: i
    }));

    await Promise.all(tasks.map(task => pool.submitTask(task)));

    const stats = pool.getStats();
    const workerStats = stats.workerStats || [];
    
    // Check if work is distributed
    const processedCounts = workerStats.map(w => w.processedCount);
    const maxCount = Math.max(...processedCounts);
    const minCount = Math.min(...processedCounts);
    
    // Ensure no worker has more than double the work of others
    expect(maxCount / minCount).toBeLessThanOrEqual(2);
  }, 60000);
}); 