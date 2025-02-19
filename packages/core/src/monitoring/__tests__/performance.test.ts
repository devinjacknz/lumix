import { PerformanceMonitor } from '../performance';
import { PerformanceOptimizer } from '../optimizer';
import { metricsService } from '../metrics';
import { AlertManager } from '../alerts';

// Mock 依赖
jest.mock('../metrics');
jest.mock('../alerts');

describe('Performance Monitoring System', () => {
  let monitor: PerformanceMonitor;
  let optimizer: PerformanceOptimizer;

  beforeEach(() => {
    // 重置 mock
    jest.clearAllMocks();
    
    // 获取实例
    monitor = PerformanceMonitor.getInstance();
    optimizer = PerformanceOptimizer.getInstance();
  });

  afterEach(async () => {
    // 停止监控和优化
    await monitor.stop();
    await optimizer.stop();
  });

  describe('Performance Monitor', () => {
    it('should collect basic metrics', async () => {
      await monitor.start();
      
      // 等待收集第一个指标
      await new Promise(resolve => setTimeout(resolve, 1100));
      
      const metrics = monitor.getMetrics();
      expect(metrics.length).toBeGreaterThan(0);
      
      const lastMetric = metrics[metrics.length - 1];
      expect(lastMetric).toHaveProperty('timestamp');
      expect(lastMetric).toHaveProperty('duration');
      expect(lastMetric).toHaveProperty('memory');
      expect(lastMetric).toHaveProperty('cpu');
    });

    it('should calculate average metrics', async () => {
      await monitor.start();
      
      // 等待收集多个指标
      await new Promise(resolve => setTimeout(resolve, 2100));
      
      const avgMetrics = monitor.getAverageMetrics();
      expect(avgMetrics).toHaveProperty('responseTime');
      expect(avgMetrics).toHaveProperty('cpuUsage');
      expect(avgMetrics).toHaveProperty('memoryUsage');
    });

    it('should respect time range filters', async () => {
      await monitor.start();
      
      // 等待收集指标
      await new Promise(resolve => setTimeout(resolve, 2100));
      
      const now = Date.now();
      const timeRange = {
        start: now - 1000,
        end: now
      };
      
      const metrics = monitor.getMetrics(timeRange);
      expect(metrics.every(m => m.timestamp >= timeRange.start)).toBe(true);
      expect(metrics.every(m => m.timestamp <= timeRange.end)).toBe(true);
    });

    it('should send metrics to metrics service', async () => {
      await monitor.start();
      
      // 等待收集指标
      await new Promise(resolve => setTimeout(resolve, 1100));
      
      expect(metricsService.recordMetric).toHaveBeenCalled();
    });

    it('should handle GC metrics when available', async () => {
      // 模拟 GC
      const originalGc = (global as any).gc;
      (global as any).gc = jest.fn();
      
      await monitor.start();
      
      // 触发 GC
      (global as any).gc();
      
      // 等待收集指标
      await new Promise(resolve => setTimeout(resolve, 1100));
      
      const metrics = monitor.getMetrics();
      const lastMetric = metrics[metrics.length - 1];
      expect(lastMetric).toHaveProperty('gc');
      
      // 恢复原始 GC
      (global as any).gc = originalGc;
    });
  });

  describe('Performance Optimizer', () => {
    it('should optimize when thresholds are exceeded', async () => {
      // 模拟高内存使用率
      jest.spyOn(process, 'memoryUsage').mockImplementation(() => ({
        heapUsed: 800,
        heapTotal: 1000,
        external: 0,
        rss: 0,
        arrayBuffers: 0
      }));

      await optimizer.start();
      await optimizer.optimize();

      const history = optimizer.getOptimizationHistory();
      expect(history.length).toBeGreaterThan(0);
      expect(history[0].type).toBe('memory');
    });

    it('should record optimization history', async () => {
      await optimizer.start();
      await optimizer.optimize();

      const history = optimizer.getOptimizationHistory();
      expect(Array.isArray(history)).toBe(true);
      
      if (history.length > 0) {
        const lastOptimization = history[history.length - 1];
        expect(lastOptimization).toHaveProperty('timestamp');
        expect(lastOptimization).toHaveProperty('type');
        expect(lastOptimization).toHaveProperty('action');
        expect(lastOptimization).toHaveProperty('impact');
      }
    });

    it('should respect optimization interval', async () => {
      await optimizer.start();
      
      const firstOptimization = optimizer.getLastOptimization('system', 'complete-optimization');
      
      // 等待一个优化间隔
      await new Promise(resolve => setTimeout(resolve, 5100));
      
      const secondOptimization = optimizer.getLastOptimization('system', 'complete-optimization');
      expect(secondOptimization).toBeGreaterThan(firstOptimization);
    });

    it('should handle optimization failures gracefully', async () => {
      // 模拟优化失败
      jest.spyOn(monitor, 'getMetrics').mockImplementation(() => {
        throw new Error('Metrics collection failed');
      });

      await optimizer.start();
      await optimizer.optimize();

      expect(AlertManager.prototype.createAlert).toHaveBeenCalled();
    });
  });

  describe('Integration Tests', () => {
    it('should work together correctly', async () => {
      await monitor.start();
      await optimizer.start();

      // 等待收集指标和优化
      await new Promise(resolve => setTimeout(resolve, 5100));

      const metrics = monitor.getMetrics();
      const history = optimizer.getOptimizationHistory();

      expect(metrics.length).toBeGreaterThan(0);
      expect(history.length).toBeGreaterThanOrEqual(0);
    });

    it('should handle high load scenarios', async () => {
      // 模拟高负载
      const load = () => {
        const arr = new Array(1000000).fill(0);
        return arr.map(x => Math.random());
      };

      await monitor.start();
      await optimizer.start();

      // 生成负载
      load();

      // 等待优化响应
      await new Promise(resolve => setTimeout(resolve, 5100));

      const history = optimizer.getOptimizationHistory();
      expect(history.some(h => h.type === 'cpu')).toBe(true);
    });

    it('should maintain system stability', async () => {
      await monitor.start();
      await optimizer.start();

      // 运行一段时间
      await new Promise(resolve => setTimeout(resolve, 10000));

      const metrics = monitor.getMetrics();
      const avgMetrics = monitor.getAverageMetrics();

      // 验证系统稳定性
      expect(avgMetrics.cpuUsage).toBeLessThan(90);
      expect(avgMetrics.memoryUsage).toBeLessThan(90);
      expect(metrics.length).toBeGreaterThan(0);
    });
  });

  describe('Performance Benchmarks', () => {
    it('should handle rapid metric collection', async () => {
      const startTime = Date.now();
      
      await monitor.start();
      
      // 快速收集100个指标
      for (let i = 0; i < 100; i++) {
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      const metrics = monitor.getMetrics();
      expect(metrics.length).toBeGreaterThan(90);
      expect(duration).toBeLessThan(2000); // 应该在2秒内完成
    });

    it('should maintain performance under memory pressure', async () => {
      const memoryData: number[] = [];
      
      await monitor.start();
      await optimizer.start();
      
      // 创建内存压力
      const arrays: any[] = [];
      for (let i = 0; i < 10; i++) {
        arrays.push(new Array(1000000).fill(Math.random()));
        memoryData.push(process.memoryUsage().heapUsed);
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      // 清理内存
      arrays.length = 0;
      
      const metrics = monitor.getMetrics();
      const history = optimizer.getOptimizationHistory();
      
      expect(metrics.length).toBeGreaterThan(0);
      expect(history.some(h => h.type === 'memory')).toBe(true);
      
      // 验证内存最终被释放
      const finalMemory = process.memoryUsage().heapUsed;
      expect(finalMemory).toBeLessThan(Math.max(...memoryData));
    });

    it('should scale with increasing load', async () => {
      await monitor.start();
      await optimizer.start();
      
      const loadLevels = [1000, 10000, 100000];
      const timings: number[] = [];
      
      for (const load of loadLevels) {
        const startTime = Date.now();
        
        // 生成负载
        const data = new Array(load).fill(0).map(() => Math.random());
        
        // 等待系统响应
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const endTime = Date.now();
        timings.push(endTime - startTime);
        
        // 清理
        data.length = 0;
      }
      
      // 验证性能随负载增加而线性扩展
      for (let i = 1; i < timings.length; i++) {
        const ratio = timings[i] / timings[i - 1];
        expect(ratio).toBeLessThan(15); // 性能下降不应超过15倍
      }
    });
  });
}); 