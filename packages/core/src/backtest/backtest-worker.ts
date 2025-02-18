import { parentPort, workerData } from 'worker_threads';
import { BacktestEngine } from './backtest-engine';
import { BacktestConfig, BacktestResult } from './types';

// 工作线程入口点
if (parentPort) {
  // 接收任务数据
  const { startTime, endTime, config } = workerData as {
    startTime: Date;
    endTime: Date;
    config: BacktestConfig;
  };

  // 创建回测配置
  const workerConfig: BacktestConfig = {
    ...config,
    startTime: new Date(startTime),
    endTime: new Date(endTime)
  };

  // 创建回测引擎
  const engine = new BacktestEngine(workerConfig);

  // 运行回测
  engine.run()
    .then((result: BacktestResult) => {
      // 发送结果给主线程
      parentPort!.postMessage({
        success: true,
        result
      });
    })
    .catch((error: Error) => {
      // 发送错误给主线程
      parentPort!.postMessage({
        success: false,
        error: error.message
      });
    });
} 