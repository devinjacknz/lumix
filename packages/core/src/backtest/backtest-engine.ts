import { logger } from '../monitoring';
import { Statistics } from '../analysis/statistics';
import { StrategyManager } from './strategy-manager';
import { RiskManager } from './risk-manager';
import { DataManager, MarketData } from './data-manager';
import { 
  BacktestConfig, 
  BacktestResult, 
  Position, 
  Trade,
  TimeResolution,
  DataSourceType,
  StrategyType,
  MetricType
} from './types';
import { EventEmitter } from 'events';
import * as os from 'os';
import { Worker } from 'worker_threads';

/**
 * 回测引擎
 */
export class BacktestEngine extends EventEmitter {
  private config: BacktestConfig;
  private dataManager: DataManager;
  private strategyManager: StrategyManager;
  private riskManager: RiskManager;
  private statistics: Statistics;

  private positions: Map<string, Position> = new Map();
  private trades: Trade[] = [];
  private equity: number[] = [];
  private drawdown: number[] = [];
  private returns: number[] = [];

  private currentTime: Date;
  private isRunning: boolean = false;
  private workers: Worker[] = [];
  private readonly numCPUs = os.cpus().length;

  constructor(config: BacktestConfig) {
    super();
    this.validateConfig(config);
    this.config = config;
    this.statistics = new Statistics();

    // 初始化各个管理器
    this.dataManager = new DataManager({
      type: config.dataSource,
      resolution: config.dataResolution,
      startTime: config.startTime,
      endTime: config.endTime,
      chains: config.chains,
      tokens: config.tokens,
      cacheData: config.cacheData
    });

    this.strategyManager = new StrategyManager();
    this.riskManager = new RiskManager(config.riskManagement);
  }

  /**
   * 运行回测
   */
  public async run(): Promise<BacktestResult> {
    try {
      logger.info('BacktestEngine', 'Starting backtest', {
        startTime: this.config.startTime,
        endTime: this.config.endTime
      });

      // 初始化回测环境
      await this.initialize();

      // 根据配置选择回测模式
      if (this.config.strategy.type === StrategyType.CUSTOM) {
        // 事件驱动回测
        await this.runEventDriven();
      } else if (this.config.chains.length > 1 || this.config.tokens.length > 1) {
        // 并行回测
        await this.runParallel();
      } else {
        // 标准回测
        await this.runStandard();
      }

      // 计算回测结果
      const result = this.calculateResults();

      logger.info('BacktestEngine', 'Backtest completed', {
        trades: this.trades.length,
        duration: result.duration
      });

      return result;
    } catch (error) {
      logger.error('BacktestEngine', 'Backtest failed', { error });
      throw error;
    } finally {
      this.cleanup();
    }
  }

  /**
   * 初始化回测环境
   */
  private async initialize(): Promise<void> {
    // 加载数据
    await this.dataManager.loadData();

    // 注册策略
    await this.strategyManager.registerStrategy(this.config.strategy);
    this.strategyManager.activateStrategy(this.config.strategy.name);

    // 初始化状态
    this.currentTime = this.config.startTime;
    this.equity = [Number(this.config.initialCapital)];
    this.isRunning = true;

    // 初始化并行处理
    if (this.shouldRunParallel()) {
      await this.initializeWorkers();
    }
  }

  /**
   * 标准回测模式
   */
  private async runStandard(): Promise<void> {
    while (this.currentTime <= this.config.endTime && this.isRunning) {
      // 获取市场数据
      const marketData = this.getMarketData();
      if (!marketData) continue;

      // 更新市场状态
      await this.updateMarketState(marketData);

      // 生成交易信号
      const signals = await this.generateSignals(marketData);

      // 执行交易
      for (const signal of signals) {
        await this.executeSignal(signal);
      }

      // 更新持仓
      this.updatePositions(marketData);

      // 记录状态
      this.recordState();

      // 推进时间
      this.advanceTime();
    }
  }

  /**
   * 并行回测模式
   */
  private async runParallel(): Promise<void> {
    // 将数据分割成多个时间段
    const timeSlices = this.splitTimeRange();

    // 创建任务
    const tasks = timeSlices.map(slice => ({
      startTime: slice.start,
      endTime: slice.end,
      config: this.config
    }));

    // 分配任务给工作线程
    const results = await Promise.all(
      tasks.map(task => this.runWorker(task))
    );

    // 合并结果
    this.mergeResults(results);
  }

  /**
   * 事件驱动回测模式
   */
  private async runEventDriven(): Promise<void> {
    // 设置事件监听器
    this.setupEventListeners();

    while (this.currentTime <= this.config.endTime && this.isRunning) {
      // 获取下一个事件
      const event = await this.getNextEvent();
      if (!event) break;

      // 处理事件
      await this.handleEvent(event);

      // 更新状态
      this.recordState();

      // 推进时间
      this.currentTime = event.timestamp;
    }
  }

  /**
   * 蒙特卡洛模拟
   */
  public async runMonteCarloSimulation(
    numSimulations: number,
    confidenceLevel: number = 0.95
  ): Promise<{
    results: BacktestResult[];
    statistics: {
      mean: number;
      std: number;
      var: number;
      cvar: number;
    };
  }> {
    const results: BacktestResult[] = [];

    // 运行多次模拟
    for (let i = 0; i < numSimulations; i++) {
      // 生成随机市场数据
      const simulatedData = this.generateSimulatedData();

      // 使用模拟数据运行回测
      const result = await this.runWithSimulatedData(simulatedData);
      results.push(result);
    }

    // 计算统计量
    const returns = results.map(r => Number(r.metrics.totalReturns));
    const sortedReturns = returns.sort((a, b) => a - b);
    const varIndex = Math.floor(returns.length * (1 - confidenceLevel));
    const var_ = sortedReturns[varIndex];
    const cvar = sortedReturns.slice(0, varIndex).reduce((a, b) => a + b) / varIndex;

    return {
      results,
      statistics: {
        mean: this.statistics.mean(returns),
        std: this.statistics.stdDev(returns),
        var: var_,
        cvar: cvar
      }
    };
  }

  /**
   * 获取市场数据
   */
  private getMarketData(): MarketData | null {
    try {
      const data = this.dataManager.getMarketData(
        this.config.chains[0],
        this.config.tokens[0],
        this.currentTime
      );

      if (!data) {
        logger.debug('BacktestEngine', 'No market data available', {
          time: this.currentTime
        });
        return null;
      }

      return data;
    } catch (error) {
      logger.error('BacktestEngine', 'Failed to get market data', { error });
      return null;
    }
  }

  /**
   * 更新市场状态
   */
  private async updateMarketState(marketData: MarketData): Promise<void> {
    try {
      await this.strategyManager.updateMarketState({
        timestamp: this.currentTime,
        chain: this.config.chains[0],
        token: this.config.tokens[0],
        data: marketData,
        indicators: {},
        patterns: [],
        trends: []
      });
    } catch (error) {
      logger.error('BacktestEngine', 'Failed to update market state', { error });
    }
  }

  /**
   * 生成交易信号
   */
  private async generateSignals(marketData: MarketData): Promise<any[]> {
    try {
      return await this.strategyManager.generateSignals(
        {
          timestamp: this.currentTime,
          chain: this.config.chains[0],
          token: this.config.tokens[0],
          data: marketData,
          indicators: {},
          patterns: [],
          trends: []
        },
        Array.from(this.positions.values())
      );
    } catch (error) {
      logger.error('BacktestEngine', 'Failed to generate signals', { error });
      return [];
    }
  }

  /**
   * 执行交易信号
   */
  private async executeSignal(signal: any): Promise<void> {
    try {
      // 验证信号
      const validation = await this.riskManager.validateSignal(signal, {
        timestamp: this.currentTime,
        chain: this.config.chains[0],
        token: this.config.tokens[0],
        data: this.getMarketData()!,
        indicators: {},
        patterns: [],
        trends: []
      });

      if (!validation.valid) {
        logger.warn('BacktestEngine', 'Signal validation failed', {
          reason: validation.reason
        });
        return;
      }

      // 调整仓位大小
      const size = await this.riskManager.adjustPositionSize(signal, {
        timestamp: this.currentTime,
        chain: this.config.chains[0],
        token: this.config.tokens[0],
        data: this.getMarketData()!,
        indicators: {},
        patterns: [],
        trends: []
      });

      // 创建交易记录
      const trade: Trade = {
        id: `trade_${this.trades.length + 1}`,
        positionId: signal.positionId || `position_${this.positions.size + 1}`,
        token: this.config.tokens[0],
        chain: this.config.chains[0],
        side: signal.action.includes('long') ? 'long' : 'short',
        type: signal.type,
        size,
        price: this.getMarketData()!.close,
        fee: '0',
        pnl: '0',
        timestamp: this.currentTime
      };

      this.trades.push(trade);

      // 更新持仓
      if (signal.type === 'entry') {
        this.positions.set(trade.positionId, {
          id: trade.positionId,
          chain: trade.chain,
          token: trade.token,
          size: trade.size,
          entryPrice: trade.price,
          currentPrice: trade.price,
          leverage: '1',
          unrealizedPnL: '0',
          realizedPnL: '0',
          openTime: this.currentTime,
          lastUpdateTime: this.currentTime
        });
      } else if (signal.type === 'exit') {
        this.positions.delete(trade.positionId);
      }

      logger.debug('BacktestEngine', 'Executed signal', {
        trade
      });
    } catch (error) {
      logger.error('BacktestEngine', 'Failed to execute signal', { error });
    }
  }

  /**
   * 更新持仓
   */
  private updatePositions(marketData: MarketData): void {
    for (const position of this.positions.values()) {
      position.currentPrice = marketData.close;
      position.lastUpdateTime = this.currentTime;
      position.unrealizedPnL = this.calculateUnrealizedPnL(position);

      // 检查止损止盈
      if (this.shouldStopLoss(position) || this.shouldTakeProfit(position)) {
        this.closePosition(position);
      }
    }
  }

  /**
   * 记录状态
   */
  private recordState(): void {
    // 计算总权益
    const equity = this.calculateTotalEquity();
    this.equity.push(equity);

    // 计算回撤
    const drawdown = this.calculateDrawdown(equity);
    this.drawdown.push(drawdown);

    // 计算收益率
    const returns = this.calculateReturns(equity);
    this.returns.push(returns);

    // 发出状态更新事件
    this.emit('stateUpdate', {
      timestamp: this.currentTime,
      equity,
      drawdown,
      returns,
      positions: Array.from(this.positions.values()),
      trades: this.trades.slice(-10) // 最近10笔交易
    });
  }

  /**
   * 推进时间
   */
  private advanceTime(): void {
    switch (this.config.dataResolution) {
      case TimeResolution.MINUTE_1:
        this.currentTime = new Date(this.currentTime.getTime() + 60000);
        break;
      case TimeResolution.MINUTE_5:
        this.currentTime = new Date(this.currentTime.getTime() + 300000);
        break;
      case TimeResolution.HOUR_1:
        this.currentTime = new Date(this.currentTime.getTime() + 3600000);
        break;
      case TimeResolution.DAY_1:
        this.currentTime = new Date(this.currentTime.getTime() + 86400000);
        break;
      default:
        throw new Error(`Unsupported time resolution: ${this.config.dataResolution}`);
    }
  }

  /**
   * 计算回测结果
   */
  private calculateResults(): BacktestResult {
    return {
      config: this.config,
      startTime: this.config.startTime,
      endTime: this.config.endTime,
      duration: this.config.endTime.getTime() - this.config.startTime.getTime(),

      metrics: {
        totalReturns: this.calculateTotalReturns(),
        annualizedReturns: this.calculateAnnualizedReturns(),
        maxDrawdown: this.calculateMaxDrawdown(),
        volatility: this.calculateVolatility(),
        sharpeRatio: this.calculateSharpeRatio(),
        sortinoRatio: this.calculateSortinoRatio(),
        calmarRatio: this.calculateCalmarRatio(),
        alpha: this.calculateAlpha(),
        beta: this.calculateBeta(),
        informationRatio: this.calculateInformationRatio()
      },

      trades: {
        total: this.trades.length,
        winning: this.calculateWinningTrades(),
        losing: this.calculateLosingTrades(),
        winRate: this.calculateWinRate(),
        avgWin: this.calculateAverageWin(),
        avgLoss: this.calculateAverageLoss(),
        largestWin: this.calculateLargestWin(),
        largestLoss: this.calculateLargestLoss(),
        profitFactor: this.calculateProfitFactor(),
        avgDuration: this.calculateAverageDuration(),
        avgMAE: this.calculateAverageMAE(),
        avgMFE: this.calculateAverageMFE()
      },

      positions: {
        total: this.positions.size,
        avgSize: this.calculateAveragePositionSize(),
        avgLeverage: this.calculateAverageLeverage(),
        avgHoldingPeriod: this.calculateAverageHoldingPeriod(),
        maxConcurrent: this.calculateMaxConcurrentPositions()
      },

      capital: {
        initial: this.config.initialCapital,
        final: this.equity[this.equity.length - 1].toString(),
        peak: Math.max(...this.equity).toString(),
        valley: Math.min(...this.equity).toString(),
        avgUtilization: this.calculateAverageCapitalUtilization()
      },

      risk: {
        valueAtRisk: this.calculateValueAtRisk(),
        expectedShortfall: this.calculateExpectedShortfall(),
        tailRatio: this.calculateTailRatio(),
        downside: this.calculateDownsideDeviation()
      },

      timeSeries: {
        equity: this.equity.map((value, index) => ({
          timestamp: new Date(this.config.startTime.getTime() + index * this.getTimeStep()),
          value: value.toString()
        })),
        drawdown: this.drawdown.map((value, index) => ({
          timestamp: new Date(this.config.startTime.getTime() + index * this.getTimeStep()),
          value: value.toString()
        })),
        returns: this.returns.map((value, index) => ({
          timestamp: new Date(this.config.startTime.getTime() + index * this.getTimeStep()),
          value: value.toString()
        }))
      }
    };
  }

  // ... 其他辅助方法的实现 ...

  /**
   * 清理资源
   */
  private cleanup(): void {
    this.isRunning = false;
    this.workers.forEach(worker => worker.terminate());
    this.workers = [];
    this.removeAllListeners();
  }
} 