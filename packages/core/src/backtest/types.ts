import { ChainType } from '../config/types';
import { TransactionType } from '../transaction/types';

// 回测配置
export interface BacktestConfig {
  // 基本配置
  startTime: Date;
  endTime: Date;
  initialCapital: string;
  chains: ChainType[];
  tokens: string[];
  
  // 交易配置
  maxPositionSize: string;
  maxDrawdown: number;
  slippageTolerance: number;
  gasMultiplier: number;
  
  // 数据配置
  dataResolution: TimeResolution;
  dataSource: DataSourceType;
  cacheData: boolean;
  
  // 策略配置
  strategy: StrategyConfig;
  indicators: IndicatorConfig[];
  signals: SignalConfig[];
  
  // 风控配置
  riskManagement: RiskConfig;
  
  // 性能配置
  performanceMetrics: MetricConfig[];
}

// 时间分辨率
export enum TimeResolution {
  TICK = 'tick',
  MINUTE_1 = '1m',
  MINUTE_5 = '5m',
  MINUTE_15 = '15m',
  MINUTE_30 = '30m',
  HOUR_1 = '1h',
  HOUR_4 = '4h',
  HOUR_12 = '12h',
  DAY_1 = '1d',
  WEEK_1 = '1w',
  MONTH_1 = '1M'
}

// 数据源类型
export enum DataSourceType {
  HISTORICAL = 'historical',
  REAL_TIME = 'real_time',
  SIMULATED = 'simulated'
}

// 策略配置
export interface StrategyConfig {
  name: string;
  type: StrategyType;
  parameters: Record<string, any>;
  constraints: {
    minOrderSize: string;
    maxOrderSize: string;
    minInterval: number;
    maxPositions: number;
    allowedTransactionTypes: TransactionType[];
  };
}

// 策略类型
export enum StrategyType {
  TREND_FOLLOWING = 'trend_following',
  MEAN_REVERSION = 'mean_reversion',
  BREAKOUT = 'breakout',
  MOMENTUM = 'momentum',
  ARBITRAGE = 'arbitrage',
  MARKET_MAKING = 'market_making',
  CUSTOM = 'custom'
}

// 指标配置
export interface IndicatorConfig {
  name: string;
  type: IndicatorType;
  parameters: Record<string, any>;
  inputs: string[];
}

// 信号配置
export interface SignalConfig {
  name: string;
  type: SignalType;
  conditions: SignalCondition[];
  actions: SignalAction[];
}

// 信号类型
export enum SignalType {
  ENTRY = 'entry',
  EXIT = 'exit',
  ADJUSTMENT = 'adjustment',
  ALERT = 'alert'
}

// 信号条件
export interface SignalCondition {
  indicator: string;
  operator: 'gt' | 'lt' | 'eq' | 'gte' | 'lte' | 'cross_above' | 'cross_below';
  value: number | string;
  timeframe?: number;
}

// 信号动作
export interface SignalAction {
  type: TransactionType;
  size: string | 'all';
  price?: string;
  timeout?: number;
  conditions?: SignalCondition[];
}

// 风控配置
export interface RiskConfig {
  stopLoss: {
    enabled: boolean;
    type: 'fixed' | 'trailing' | 'dynamic';
    value: number;
  };
  takeProfit: {
    enabled: boolean;
    type: 'fixed' | 'trailing' | 'dynamic';
    value: number;
  };
  positionSizing: {
    type: 'fixed' | 'risk_based' | 'portfolio_based';
    value: number;
  };
  riskPerTrade: number;
  maxDrawdown: number;
  maxLeverage: number;
}

// 性能指标配置
export interface MetricConfig {
  name: string;
  type: MetricType;
  parameters?: Record<string, any>;
}

// 性能指标类型
export enum MetricType {
  RETURNS = 'returns',
  DRAWDOWN = 'drawdown',
  VOLATILITY = 'volatility',
  SHARPE_RATIO = 'sharpe_ratio',
  SORTINO_RATIO = 'sortino_ratio',
  CALMAR_RATIO = 'calmar_ratio',
  ALPHA = 'alpha',
  BETA = 'beta',
  INFORMATION_RATIO = 'information_ratio',
  WIN_RATE = 'win_rate',
  PROFIT_FACTOR = 'profit_factor',
  CUSTOM = 'custom'
}

// 回测结果
export interface BacktestResult {
  // 基本信息
  config: BacktestConfig;
  startTime: Date;
  endTime: Date;
  duration: number;
  
  // 性能指标
  metrics: {
    totalReturns: string;
    annualizedReturns: string;
    maxDrawdown: string;
    volatility: string;
    sharpeRatio: string;
    sortinoRatio: string;
    calmarRatio: string;
    alpha: string;
    beta: string;
    informationRatio: string;
    [key: string]: any;
  };
  
  // 交易统计
  trades: {
    total: number;
    winning: number;
    losing: number;
    winRate: string;
    avgWin: string;
    avgLoss: string;
    largestWin: string;
    largestLoss: string;
    profitFactor: string;
    avgDuration: number;
    avgMAE: string;
    avgMFE: string;
    [key: string]: any;
  };
  
  // 持仓统计
  positions: {
    total: number;
    avgSize: string;
    avgLeverage: string;
    avgHoldingPeriod: number;
    maxConcurrent: number;
    [key: string]: any;
  };
  
  // 资金统计
  capital: {
    initial: string;
    final: string;
    peak: string;
    valley: string;
    avgUtilization: string;
    [key: string]: any;
  };
  
  // 风险统计
  risk: {
    valueAtRisk: string;
    expectedShortfall: string;
    tailRatio: string;
    downside: string;
    [key: string]: any;
  };
  
  // 时间序列数据
  timeSeries: {
    equity: TimeSeriesData[];
    drawdown: TimeSeriesData[];
    positions: TimeSeriesData[];
    returns: TimeSeriesData[];
    [key: string]: TimeSeriesData[];
  };
}

// 持仓信息
export interface Position {
  id: string;
  chain: ChainType;
  token: string;
  size: string;
  entryPrice: string;
  currentPrice: string;
  leverage: string;
  unrealizedPnL: string;
  realizedPnL: string;
  openTime: Date;
  lastUpdateTime: Date;
  stopLoss?: string;
  takeProfit?: string;
  trailingStop?: string;
}

// 交易信息
export interface Trade {
  id: string;
  positionId: string;
  token: string;
  chain: ChainType;
  side: 'long' | 'short';
  type: 'entry' | 'exit' | 'adjustment';
  size: string;
  price: string;
  fee: string;
  pnl: string;
  timestamp: Date;
}

// 时间序列数据
export interface TimeSeriesData {
  timestamp: Date;
  value: number | string;
} 