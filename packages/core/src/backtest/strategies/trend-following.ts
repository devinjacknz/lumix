import { logger } from '../../monitoring';
import { BaseStrategy, MarketState, PositionState, Signal, StrategyConfig } from '../strategy';
import { SignalType, StrategyType } from '../types';

interface TrendFollowingParameters {
  // 趋势参数
  trendPeriod: number;      // 趋势周期
  momentumPeriod: number;   // 动量周期
  volatilityPeriod: number; // 波动率周期
  
  // 入场参数
  entryThreshold: number;   // 入场阈值
  entryConfirmation: number;// 入场确认周期
  
  // 出场参数
  exitThreshold: number;    // 出场阈值
  trailingStop: number;     // 追踪止损比例
  
  // 仓位参数
  positionSizing: 'fixed' | 'volatility' | 'risk';
  riskPerTrade: number;     // 每笔交易风险比例
}

export class TrendFollowingStrategy extends BaseStrategy {
  private params: TrendFollowingParameters;

  public getDescription(): string {
    return `
      趋势跟踪策略使用移动平均线、动量指标和波动率指标来识别和跟踪市场趋势。
      策略特点：
      1. 使用多周期移动平均线判断趋势方向
      2. 使用动量指标确认趋势强度
      3. 使用波动率指标调整仓位大小
      4. 采用追踪止损管理风险
    `;
  }

  public async initialize(config: StrategyConfig): Promise<void> {
    await super.initialize(config);
    this.params = config.parameters as TrendFollowingParameters;
  }

  public async shouldEnterMarket(state: MarketState): Promise<boolean> {
    try {
      // 获取技术指标
      const { trends, indicators } = state;
      
      // 检查趋势方向
      const trend = trends.find(t => t.timeframe === `${this.params.trendPeriod}`)?.direction;
      if (trend !== 'up') {
        return false;
      }

      // 检查动量
      const momentum = indicators['momentum'] as number;
      if (momentum < this.params.entryThreshold) {
        return false;
      }

      // 检查确认信号
      const confirmation = await this.confirmEntry(state);
      if (!confirmation) {
        return false;
      }

      return true;
    } catch (error) {
      logger.error('TrendFollowingStrategy', 'Failed to check market entry', { error });
      return false;
    }
  }

  public async shouldExitMarket(
    state: MarketState,
    position: PositionState
  ): Promise<boolean> {
    try {
      // 获取技术指标
      const { trends, indicators } = state;
      
      // 检查趋势反转
      const trend = trends.find(t => t.timeframe === `${this.params.trendPeriod}`)?.direction;
      if (trend === 'down') {
        return true;
      }

      // 检查动量减弱
      const momentum = indicators['momentum'] as number;
      if (momentum < -this.params.exitThreshold) {
        return true;
      }

      // 检查追踪止损
      const stopPrice = this.calculateStopPrice(position);
      if (parseFloat(state.data.close) <= stopPrice) {
        return true;
      }

      return false;
    } catch (error) {
      logger.error('TrendFollowingStrategy', 'Failed to check market exit', { error });
      return false;
    }
  }

  public async generateSignals(
    state: MarketState,
    positions: PositionState[]
  ): Promise<Signal[]> {
    try {
      const signals: Signal[] = [];

      // 检查现有持仓
      const position = positions.find(p => 
        p.chain === state.chain && p.token === state.token
      );

      if (position) {
        // 检查是否应该退出市场
        const shouldExit = await this.shouldExitMarket(state, position);
        if (shouldExit) {
          signals.push(await this.createExitSignal(state, position));
        }
      } else {
        // 检查是否应该进入市场
        const shouldEnter = await this.shouldEnterMarket(state);
        if (shouldEnter) {
          signals.push(await this.createEntrySignal(state));
        }
      }

      return signals;
    } catch (error) {
      logger.error('TrendFollowingStrategy', 'Failed to generate signals', { error });
      return [];
    }
  }

  // 私有辅助方法
  private async confirmEntry(state: MarketState): Promise<boolean> {
    try {
      // 获取确认周期的数据
      const period = this.params.entryConfirmation;
      
      // 检查价格是否高于移动平均线
      const sma = state.indicators[`sma${period}`] as number;
      if (parseFloat(state.data.close) <= sma) {
        return false;
      }

      // 检查RSI
      const rsi = state.indicators['rsi'] as number;
      if (rsi < 50) {
        return false;
      }

      // 检查成交量
      const volumeSma = state.indicators[`volume_sma${period}`] as number;
      const currentVolume = parseFloat(state.data.volume);
      if (currentVolume < volumeSma) {
        return false;
      }

      return true;
    } catch (error) {
      logger.error('TrendFollowingStrategy', 'Failed to confirm entry', { error });
      return false;
    }
  }

  private calculateStopPrice(position: PositionState): number {
    const entryPrice = parseFloat(position.entryPrice);
    const currentPrice = parseFloat(position.currentPrice);
    const trailingStop = this.params.trailingStop;

    // 计算止损价格
    const stopPrice = currentPrice * (1 - trailingStop);
    
    // 确保止损价格高于入场价格
    return Math.max(stopPrice, entryPrice * (1 - trailingStop));
  }

  private async createEntrySignal(state: MarketState): Promise<Signal> {
    // 计算仓位大小
    const size = await this.calculatePositionSize(state);

    return {
      type: SignalType.ENTRY,
      timestamp: state.timestamp,
      chain: state.chain,
      token: state.token,
      action: 'open_long',
      size: size.toString(),
      price: state.data.close,
      reason: 'Trend following entry signal',
      confidence: this.calculateSignalConfidence(state),
      metadata: {
        indicators: state.indicators,
        patterns: state.patterns,
        trends: state.trends
      }
    };
  }

  private async createExitSignal(
    state: MarketState,
    position: PositionState
  ): Promise<Signal> {
    return {
      type: SignalType.EXIT,
      timestamp: state.timestamp,
      chain: state.chain,
      token: state.token,
      action: 'close_long',
      size: position.size,
      price: state.data.close,
      reason: 'Trend following exit signal',
      confidence: this.calculateSignalConfidence(state),
      metadata: {
        indicators: state.indicators,
        patterns: state.patterns,
        trends: state.trends,
        position: {
          entryPrice: position.entryPrice,
          duration: position.duration,
          pnl: position.unrealizedPnL
        }
      }
    };
  }

  private async calculatePositionSize(state: MarketState): Promise<number> {
    switch (this.params.positionSizing) {
      case 'fixed':
        return this.calculateFixedSize();
      case 'volatility':
        return this.calculateVolatilitySize(state);
      case 'risk':
        return this.calculateRiskSize(state);
      default:
        return parseFloat(this.config.constraints.minOrderSize);
    }
  }

  private calculateFixedSize(): number {
    // 使用最小订单大小
    return parseFloat(this.config.constraints.minOrderSize);
  }

  private calculateVolatilitySize(state: MarketState): number {
    try {
      // 获取波动率
      const volatility = state.indicators[`atr${this.params.volatilityPeriod}`] as number;
      const baseSize = parseFloat(this.config.constraints.minOrderSize);
      
      // 根据波动率调整仓位大小
      const adjustedSize = baseSize * (1 / volatility);
      
      // 确保在允许范围内
      const maxSize = parseFloat(this.config.constraints.maxOrderSize);
      return Math.min(Math.max(adjustedSize, baseSize), maxSize);
    } catch (error) {
      logger.error('TrendFollowingStrategy', 'Failed to calculate volatility size', { error });
      return this.calculateFixedSize();
    }
  }

  private calculateRiskSize(state: MarketState): number {
    try {
      // 获取当前价格和止损价格
      const currentPrice = parseFloat(state.data.close);
      const stopPrice = currentPrice * (1 - this.params.trailingStop);
      
      // 计算每点风险
      const riskPerPoint = currentPrice - stopPrice;
      
      // 计算仓位大小
      const riskAmount = parseFloat(this.config.constraints.minOrderSize) * this.params.riskPerTrade;
      const positionSize = riskAmount / riskPerPoint;
      
      // 确保在允许范围内
      const maxSize = parseFloat(this.config.constraints.maxOrderSize);
      return Math.min(Math.max(positionSize, parseFloat(this.config.constraints.minOrderSize)), maxSize);
    } catch (error) {
      logger.error('TrendFollowingStrategy', 'Failed to calculate risk size', { error });
      return this.calculateFixedSize();
    }
  }

  private calculateSignalConfidence(state: MarketState): number {
    try {
      let confidence = 0;

      // 趋势强度 (40%)
      const trend = state.trends.find(t => t.timeframe === `${this.params.trendPeriod}`);
      if (trend) {
        confidence += trend.strength * 0.4;
      }

      // 动量强度 (30%)
      const momentum = state.indicators['momentum'] as number;
      const normalizedMomentum = Math.min(Math.abs(momentum) / this.params.entryThreshold, 1);
      confidence += normalizedMomentum * 0.3;

      // 模式可信度 (30%)
      const pattern = state.patterns[0];
      if (pattern) {
        confidence += pattern.confidence * 0.3;
      }

      return Math.min(confidence, 1);
    } catch (error) {
      logger.error('TrendFollowingStrategy', 'Failed to calculate signal confidence', { error });
      return 0.5;
    }
  }
} 