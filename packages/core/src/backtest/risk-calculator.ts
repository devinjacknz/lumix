import { Statistics } from '../analysis/statistics';
import { logger } from '../monitoring';
import { MarketState, PositionState } from './strategy';
import { RiskState } from './risk-manager';

export class RiskCalculator {
  private statistics: Statistics;

  constructor() {
    this.statistics = new Statistics();
  }

  // 计算风险价值(VaR)
  public calculateVaR(
    returns: number[],
    confidence: number = 0.95
  ): number {
    try {
      // 使用历史模拟法计算VaR
      const sortedReturns = [...returns].sort((a, b) => a - b);
      const index = Math.floor((1 - confidence) * returns.length);
      return -sortedReturns[index];
    } catch (error) {
      logger.error('RiskCalculator', 'Failed to calculate VaR', { error });
      return 0;
    }
  }

  // 计算条件风险价值(CVaR)
  public calculateCVaR(
    returns: number[],
    confidence: number = 0.95
  ): number {
    try {
      const var_ = this.calculateVaR(returns, confidence);
      const tailReturns = returns.filter(r => r <= -var_);
      return -this.statistics.mean(tailReturns);
    } catch (error) {
      logger.error('RiskCalculator', 'Failed to calculate CVaR', { error });
      return 0;
    }
  }

  // 计算贝塔系数
  public calculateBeta(
    returns: number[],
    marketReturns: number[]
  ): number {
    try {
      return this.statistics.beta(returns, marketReturns);
    } catch (error) {
      logger.error('RiskCalculator', 'Failed to calculate beta', { error });
      return 1;
    }
  }

  // 计算夏普比率
  public calculateSharpeRatio(
    returns: number[],
    riskFreeRate: number = 0.02
  ): number {
    try {
      return this.statistics.sharpeRatio(returns, riskFreeRate);
    } catch (error) {
      logger.error('RiskCalculator', 'Failed to calculate Sharpe ratio', { error });
      return 0;
    }
  }

  // 计算索提诺比率
  public calculateSortinoRatio(
    returns: number[],
    riskFreeRate: number = 0.02
  ): number {
    try {
      const excessReturns = returns.map(r => r - riskFreeRate);
      const avgExcessReturn = this.statistics.mean(excessReturns);
      const downside = this.calculateDownsideDeviation(returns, riskFreeRate);
      return downside === 0 ? 0 : avgExcessReturn / downside;
    } catch (error) {
      logger.error('RiskCalculator', 'Failed to calculate Sortino ratio', { error });
      return 0;
    }
  }

  // 计算最大回撤
  public calculateMaxDrawdown(values: number[]): number {
    try {
      const result = this.statistics.maxDrawdown(values);
      return result.maxDrawdown;
    } catch (error) {
      logger.error('RiskCalculator', 'Failed to calculate max drawdown', { error });
      return 0;
    }
  }

  // 计算波动率
  public calculateVolatility(
    returns: number[],
    period: number = 252
  ): number {
    try {
      return this.statistics.volatility(returns, period);
    } catch (error) {
      logger.error('RiskCalculator', 'Failed to calculate volatility', { error });
      return 0;
    }
  }

  // 计算相关性矩阵
  public calculateCorrelationMatrix(
    returnSeries: Record<string, number[]>
  ): Record<string, Record<string, number>> {
    try {
      const assets = Object.keys(returnSeries);
      const matrix: Record<string, Record<string, number>> = {};

      for (const asset1 of assets) {
        matrix[asset1] = {};
        for (const asset2 of assets) {
          matrix[asset1][asset2] = this.statistics.correlation(
            returnSeries[asset1],
            returnSeries[asset2]
          );
        }
      }

      return matrix;
    } catch (error) {
      logger.error('RiskCalculator', 'Failed to calculate correlation matrix', { error });
      return {};
    }
  }

  // 计算风险分解
  public calculateRiskDecomposition(
    positions: PositionState[],
    returns: Record<string, number[]>
  ): Record<string, {
    contribution: number;
    allocation: number;
    risk: number;
  }> {
    try {
      const decomposition: Record<string, {
        contribution: number;
        allocation: number;
        risk: number;
      }> = {};

      // 计算总价值
      const totalValue = positions.reduce(
        (sum, pos) => sum + parseFloat(pos.currentPrice) * parseFloat(pos.size),
        0
      );

      // 计算每个持仓的风险贡献
      for (const position of positions) {
        const value = parseFloat(position.currentPrice) * parseFloat(position.size);
        const allocation = value / totalValue;
        const risk = this.calculateVolatility(returns[position.token]);
        const contribution = allocation * risk;

        decomposition[position.token] = {
          contribution,
          allocation,
          risk
        };
      }

      return decomposition;
    } catch (error) {
      logger.error('RiskCalculator', 'Failed to calculate risk decomposition', { error });
      return {};
    }
  }

  // 计算风险状态
  public calculateRiskState(
    state: MarketState,
    positions: PositionState[],
    returns: Record<string, number[]>,
    marketReturns: number[]
  ): Partial<RiskState> {
    try {
      // 计算总价值和使用价值
      const totalValue = positions.reduce(
        (sum, pos) => sum + parseFloat(pos.currentPrice) * parseFloat(pos.size),
        0
      );

      const usedValue = positions.reduce(
        (sum, pos) => sum + parseFloat(pos.entryPrice) * parseFloat(pos.size),
        0
      );

      // 计算风险指标
      const portfolioReturns = this.calculatePortfolioReturns(positions, returns);
      const var95 = this.calculateVaR(portfolioReturns);
      const cvar95 = this.calculateCVaR(portfolioReturns);
      const beta = this.calculateBeta(portfolioReturns, marketReturns);
      const sharpe = this.calculateSharpeRatio(portfolioReturns);
      const sortino = this.calculateSortinoRatio(portfolioReturns);

      // 计算风险分解
      const decomposition = this.calculateRiskDecomposition(positions, returns);

      // 计算暴露
      const exposures = this.calculateExposures(positions);

      return {
        totalValue: totalValue.toString(),
        usedValue: usedValue.toString(),
        availableValue: (totalValue - usedValue).toString(),
        risks: {
          var: var95,
          cvar: cvar95,
          beta,
          sharpe,
          sortino
        },
        exposures
      };
    } catch (error) {
      logger.error('RiskCalculator', 'Failed to calculate risk state', { error });
      return {};
    }
  }

  // 私有辅助方法
  private calculateDownsideDeviation(
    returns: number[],
    threshold: number
  ): number {
    try {
      const downside = returns.filter(r => r < threshold);
      if (downside.length === 0) return 0;

      const squaredDeviations = downside.map(r => Math.pow(threshold - r, 2));
      return Math.sqrt(this.statistics.mean(squaredDeviations));
    } catch (error) {
      logger.error('RiskCalculator', 'Failed to calculate downside deviation', { error });
      return 0;
    }
  }

  private calculatePortfolioReturns(
    positions: PositionState[],
    returns: Record<string, number[]>
  ): number[] {
    try {
      // 计算总价值
      const totalValue = positions.reduce(
        (sum, pos) => sum + parseFloat(pos.currentPrice) * parseFloat(pos.size),
        0
      );

      // 计算权重
      const weights = positions.reduce((map, pos) => {
        const value = parseFloat(pos.currentPrice) * parseFloat(pos.size);
        map[pos.token] = value / totalValue;
        return map;
      }, {} as Record<string, number>);

      // 计算组合收益率
      const length = Math.min(...Object.values(returns).map(r => r.length));
      const portfolioReturns: number[] = new Array(length).fill(0);

      for (let i = 0; i < length; i++) {
        for (const position of positions) {
          const weight = weights[position.token];
          portfolioReturns[i] += returns[position.token][i] * weight;
        }
      }

      return portfolioReturns;
    } catch (error) {
      logger.error('RiskCalculator', 'Failed to calculate portfolio returns', { error });
      return [];
    }
  }

  private calculateExposures(
    positions: PositionState[]
  ): {
    chains: Record<string, string>;
    tokens: Record<string, string>;
    total: string;
  } {
    try {
      const chains: Record<string, number> = {};
      const tokens: Record<string, number> = {};
      let total = 0;

      // 计算暴露
      for (const position of positions) {
        const value = parseFloat(position.currentPrice) * parseFloat(position.size);
        
        // 链暴露
        chains[position.chain] = (chains[position.chain] || 0) + value;
        
        // 代币暴露
        tokens[position.token] = (tokens[position.token] || 0) + value;
        
        total += value;
      }

      // 转换为字符串
      return {
        chains: Object.fromEntries(
          Object.entries(chains).map(([k, v]) => [k, v.toString()])
        ),
        tokens: Object.fromEntries(
          Object.entries(tokens).map(([k, v]) => [k, v.toString()])
        ),
        total: total.toString()
      };
    } catch (error) {
      logger.error('RiskCalculator', 'Failed to calculate exposures', { error });
      return {
        chains: {},
        tokens: {},
        total: '0'
      };
    }
  }
} 