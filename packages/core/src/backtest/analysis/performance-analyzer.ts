import { logger } from '../../monitoring';
import { Statistics } from '../../analysis/statistics';
import { BacktestResult, Trade, Position } from '../types';

/**
 * 性能分析配置
 */
export interface PerformanceAnalysisConfig {
  riskFreeRate?: number;         // 无风险利率
  benchmarkReturns?: number[];   // 基准收益率
  timeHorizon?: number;          // 时间周期（年）
  confidenceLevel?: number;      // 置信水平
  rollingWindow?: number;        // 滚动窗口大小
}

/**
 * 性能分析结果
 */
export interface PerformanceAnalysis {
  // 收益指标
  returns: {
    total: number;              // 总收益率
    annualized: number;         // 年化收益率
    cumulative: number[];       // 累积收益率
    monthly: number[];          // 月度收益率
    rolling: number[];          // 滚动收益率
  };

  // 风险调整收益
  riskAdjusted: {
    sharpeRatio: number;        // 夏普比率
    sortinoRatio: number;       // 索提诺比率
    treynorRatio: number;       // 特雷诺比率
    informationRatio: number;   // 信息比率
    calmarRatio: number;        // 卡玛比率
    omega: number;              // 欧米伽比率
  };

  // 风险指标
  risk: {
    volatility: number;         // 波动率
    beta: number;               // 贝塔系数
    alpha: number;              // 阿尔法
    drawdown: {
      maximum: number;          // 最大回撤
      average: number;          // 平均回撤
      duration: number;         // 回撤持续时间
    };
    var: number;                // 风险价值
    cvar: number;               // 条件风险价值
  };

  // 交易统计
  trading: {
    totalTrades: number;        // 总交易次数
    winningTrades: number;      // 盈利交易次数
    losingTrades: number;       // 亏损交易次数
    winRate: number;            // 胜率
    profitFactor: number;       // 盈亏比
    averageReturn: number;      // 平均收益
    averageDuration: number;    // 平均持仓时间
    turnover: number;           // 换手率
  };

  // 持仓分析
  positions: {
    maxPositions: number;       // 最大持仓数
    averagePositions: number;   // 平均持仓数
    maxLeverage: number;        // 最大杠杆
    averageLeverage: number;    // 平均杠杆
    concentration: number;      // 集中度
  };

  // 时间分析
  timing: {
    bestMonth: string;          // 最佳月份
    worstMonth: string;         // 最差月份
    monthlyStats: Array<{      // 月度统计
      month: string;
      return: number;
      trades: number;
      sharpe: number;
    }>;
    hourlyStats: Array<{       // 小时统计
      hour: number;
      return: number;
      trades: number;
      sharpe: number;
    }>;
  };
}

/**
 * 性能分析器
 */
export class PerformanceAnalyzer {
  private config: Required<PerformanceAnalysisConfig>;
  private statistics: Statistics;

  constructor(config: PerformanceAnalysisConfig = {}) {
    this.config = {
      riskFreeRate: config.riskFreeRate ?? 0.02,
      benchmarkReturns: config.benchmarkReturns ?? [],
      timeHorizon: config.timeHorizon ?? 1,
      confidenceLevel: config.confidenceLevel ?? 0.95,
      rollingWindow: config.rollingWindow ?? 20
    };
    this.statistics = new Statistics();
  }

  /**
   * 分析回测结果
   */
  public analyze(result: BacktestResult): PerformanceAnalysis {
    try {
      logger.info('PerformanceAnalyzer', 'Starting performance analysis');

      // 提取数据
      const returns = this.extractReturns(result);
      const trades = result.trades;
      const positions = result.positions;

      // 计算各项指标
      const analysis: PerformanceAnalysis = {
        returns: this.analyzeReturns(returns),
        riskAdjusted: this.analyzeRiskAdjusted(returns),
        risk: this.analyzeRisk(returns),
        trading: this.analyzeTrading(trades),
        positions: this.analyzePositions(positions),
        timing: this.analyzeTiming(returns, trades)
      };

      logger.info('PerformanceAnalyzer', 'Performance analysis completed');

      return analysis;
    } catch (error) {
      logger.error('PerformanceAnalyzer', 'Performance analysis failed', { error });
      throw error;
    }
  }

  /**
   * 分析收益率
   */
  private analyzeReturns(returns: number[]): PerformanceAnalysis['returns'] {
    const total = this.calculateTotalReturn(returns);
    const annualized = this.calculateAnnualizedReturn(total);
    const cumulative = this.calculateCumulativeReturns(returns);
    const monthly = this.calculateMonthlyReturns(returns);
    const rolling = this.calculateRollingReturns(returns);

    return {
      total,
      annualized,
      cumulative,
      monthly,
      rolling
    };
  }

  /**
   * 分析风险调整收益
   */
  private analyzeRiskAdjusted(returns: number[]): PerformanceAnalysis['riskAdjusted'] {
    return {
      sharpeRatio: this.calculateSharpeRatio(returns),
      sortinoRatio: this.calculateSortinoRatio(returns),
      treynorRatio: this.calculateTreynorRatio(returns),
      informationRatio: this.calculateInformationRatio(returns),
      calmarRatio: this.calculateCalmarRatio(returns),
      omega: this.calculateOmegaRatio(returns)
    };
  }

  /**
   * 分析风险指标
   */
  private analyzeRisk(returns: number[]): PerformanceAnalysis['risk'] {
    return {
      volatility: this.calculateVolatility(returns),
      beta: this.calculateBeta(returns),
      alpha: this.calculateAlpha(returns),
      drawdown: {
        maximum: this.calculateMaxDrawdown(returns),
        average: this.calculateAverageDrawdown(returns),
        duration: this.calculateDrawdownDuration(returns)
      },
      var: this.calculateVaR(returns),
      cvar: this.calculateCVaR(returns)
    };
  }

  /**
   * 分析交易统计
   */
  private analyzeTrading(trades: any[]): PerformanceAnalysis['trading'] {
    return {
      totalTrades: trades.length,
      winningTrades: this.countWinningTrades(trades),
      losingTrades: this.countLosingTrades(trades),
      winRate: this.calculateWinRate(trades),
      profitFactor: this.calculateProfitFactor(trades),
      averageReturn: this.calculateAverageTradeReturn(trades),
      averageDuration: this.calculateAverageTradeDuration(trades),
      turnover: this.calculateTurnover(trades)
    };
  }

  /**
   * 分析持仓情况
   */
  private analyzePositions(positions: any): PerformanceAnalysis['positions'] {
    return {
      maxPositions: this.calculateMaxPositions(positions),
      averagePositions: this.calculateAveragePositions(positions),
      maxLeverage: this.calculateMaxLeverage(positions),
      averageLeverage: this.calculateAverageLeverage(positions),
      concentration: this.calculateConcentration(positions)
    };
  }

  /**
   * 分析时间特征
   */
  private analyzeTiming(
    returns: number[],
    trades: any[]
  ): PerformanceAnalysis['timing'] {
    return {
      bestMonth: this.findBestMonth(returns),
      worstMonth: this.findWorstMonth(returns),
      monthlyStats: this.calculateMonthlyStats(returns, trades),
      hourlyStats: this.calculateHourlyStats(returns, trades)
    };
  }

  // ... 其他辅助计算方法的实现 ...

  /**
   * 提取收益率序列
   */
  private extractReturns(result: BacktestResult): number[] {
    return result.timeSeries.returns.map(r => Number(r.value));
  }

  /**
   * 计算总收益率
   */
  private calculateTotalReturn(returns: number[]): number {
    return returns.reduce((acc, r) => (1 + acc) * (1 + r) - 1, 0);
  }

  /**
   * 计算年化收益率
   */
  private calculateAnnualizedReturn(totalReturn: number): number {
    return Math.pow(1 + totalReturn, 1 / this.config.timeHorizon) - 1;
  }

  /**
   * 计算累积收益率
   */
  private calculateCumulativeReturns(returns: number[]): number[] {
    const cumulative: number[] = [];
    let acc = 1;
    for (const r of returns) {
      acc *= (1 + r);
      cumulative.push(acc - 1);
    }
    return cumulative;
  }

  /**
   * 计算月度收益率
   */
  private calculateMonthlyReturns(returns: number[]): number[] {
    // 实现月度收益率计算逻辑
    return [];
  }

  /**
   * 计算滚动收益率
   */
  private calculateRollingReturns(returns: number[]): number[] {
    const rolling: number[] = [];
    for (let i = this.config.rollingWindow; i <= returns.length; i++) {
      const window = returns.slice(i - this.config.rollingWindow, i);
      rolling.push(this.calculateTotalReturn(window));
    }
    return rolling;
  }

  /**
   * 计算夏普比率
   */
  private calculateSharpeRatio(returns: number[]): number {
    const excessReturns = returns.map(r => r - this.config.riskFreeRate / 252);
    const mean = this.statistics.mean(excessReturns);
    const std = this.statistics.stdDev(excessReturns);
    return mean / std * Math.sqrt(252);
  }

  /**
   * 计算索提诺比率
   */
  private calculateSortinoRatio(returns: number[]): number {
    const excessReturns = returns.map(r => r - this.config.riskFreeRate / 252);
    const mean = this.statistics.mean(excessReturns);
    const downside = this.statistics.calculateDownsideDeviation(excessReturns, 0);
    return mean / downside * Math.sqrt(252);
  }

  /**
   * 计算特雷诺比率
   */
  private calculateTreynorRatio(returns: number[]): number {
    const excessReturns = returns.map(r => r - this.config.riskFreeRate / 252);
    const mean = this.statistics.mean(excessReturns);
    const beta = this.calculateBeta(returns);
    return mean / beta * Math.sqrt(252);
  }

  /**
   * 计算信息比率
   */
  private calculateInformationRatio(returns: number[]): number {
    if (!this.config.benchmarkReturns.length) return 0;
    const excessReturns = returns.map((r, i) => 
      r - this.config.benchmarkReturns[i]
    );
    const mean = this.statistics.mean(excessReturns);
    const std = this.statistics.stdDev(excessReturns);
    return mean / std * Math.sqrt(252);
  }

  /**
   * 计算卡玛比率
   */
  private calculateCalmarRatio(returns: number[]): number {
    const annualizedReturn = this.calculateAnnualizedReturn(
      this.calculateTotalReturn(returns)
    );
    const maxDrawdown = this.calculateMaxDrawdown(returns);
    return annualizedReturn / maxDrawdown;
  }

  /**
   * 计算欧米伽比率
   */
  private calculateOmegaRatio(returns: number[]): number {
    const threshold = 0;
    const gains = returns.filter(r => r > threshold);
    const losses = returns.filter(r => r <= threshold);
    
    if (losses.length === 0) return Infinity;
    
    const expectedGain = gains.reduce((a, b) => a + b, 0) / gains.length;
    const expectedLoss = Math.abs(losses.reduce((a, b) => a + b, 0)) / losses.length;
    
    return expectedGain / expectedLoss;
  }

  /**
   * 计算波动率
   */
  private calculateVolatility(returns: number[]): number {
    return this.statistics.stdDev(returns) * Math.sqrt(252);
  }

  /**
   * 计算贝塔系数
   */
  private calculateBeta(returns: number[]): number {
    if (!this.config.benchmarkReturns.length) return 1;
    return this.statistics.beta(returns, this.config.benchmarkReturns);
  }

  /**
   * 计算阿尔法
   */
  private calculateAlpha(returns: number[]): number {
    if (!this.config.benchmarkReturns.length) return 0;
    const portfolioReturn = this.calculateAnnualizedReturn(
      this.calculateTotalReturn(returns)
    );
    const benchmarkReturn = this.calculateAnnualizedReturn(
      this.calculateTotalReturn(this.config.benchmarkReturns)
    );
    const beta = this.calculateBeta(returns);
    return portfolioReturn - (this.config.riskFreeRate + beta * (benchmarkReturn - this.config.riskFreeRate));
  }

  /**
   * 计算最大回撤
   */
  private calculateMaxDrawdown(returns: number[]): number {
    const cumulative = this.calculateCumulativeReturns(returns);
    let maxDrawdown = 0;
    let peak = cumulative[0];
    
    for (const value of cumulative) {
      if (value > peak) {
        peak = value;
      }
      const drawdown = (peak - value) / (1 + peak);
      maxDrawdown = Math.max(maxDrawdown, drawdown);
    }
    
    return maxDrawdown;
  }

  /**
   * 计算平均回撤
   */
  private calculateAverageDrawdown(returns: number[]): number {
    const cumulative = this.calculateCumulativeReturns(returns);
    const drawdowns: number[] = [];
    let peak = cumulative[0];
    
    for (const value of cumulative) {
      if (value > peak) {
        peak = value;
      }
      const drawdown = (peak - value) / (1 + peak);
      drawdowns.push(drawdown);
    }
    
    return this.statistics.mean(drawdowns);
  }

  /**
   * 计算回撤持续时间
   */
  private calculateDrawdownDuration(returns: number[]): number {
    const cumulative = this.calculateCumulativeReturns(returns);
    let currentDuration = 0;
    let maxDuration = 0;
    let peak = cumulative[0];
    
    for (const value of cumulative) {
      if (value >= peak) {
        peak = value;
        currentDuration = 0;
      } else {
        currentDuration++;
        maxDuration = Math.max(maxDuration, currentDuration);
      }
    }
    
    return maxDuration;
  }

  /**
   * 计算风险价值(VaR)
   */
  private calculateVaR(returns: number[]): number {
    const sorted = [...returns].sort((a, b) => a - b);
    const index = Math.floor(returns.length * (1 - this.config.confidenceLevel));
    return -sorted[index];
  }

  /**
   * 计算条件风险价值(CVaR)
   */
  private calculateCVaR(returns: number[]): number {
    const sorted = [...returns].sort((a, b) => a - b);
    const var_ = this.calculateVaR(returns);
    const tailReturns = sorted.filter(r => r <= -var_);
    return -this.statistics.mean(tailReturns);
  }
} 