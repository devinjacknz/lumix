import { ChainType } from '../config/types';
import { TransactionType } from '../transaction/types';

// 数据分析类型
export enum AnalysisType {
  // 市场分析
  PRICE_ANALYSIS = 'price_analysis',
  VOLUME_ANALYSIS = 'volume_analysis',
  VOLATILITY_ANALYSIS = 'volatility_analysis',
  CORRELATION_ANALYSIS = 'correlation_analysis',

  // 交易分析
  TRADE_PERFORMANCE = 'trade_performance',
  TRADE_PATTERN = 'trade_pattern',
  TRADE_RISK = 'trade_risk',
  TRADE_COST = 'trade_cost',

  // 投资组合分析
  PORTFOLIO_PERFORMANCE = 'portfolio_performance',
  PORTFOLIO_RISK = 'portfolio_risk',
  PORTFOLIO_ALLOCATION = 'portfolio_allocation',
  PORTFOLIO_REBALANCE = 'portfolio_rebalance',

  // 链上分析
  CHAIN_ACTIVITY = 'chain_activity',
  CHAIN_METRICS = 'chain_metrics',
  CHAIN_HEALTH = 'chain_health',
  CHAIN_COMPARISON = 'chain_comparison',

  // 市场情绪分析
  SENTIMENT_TREND = 'sentiment_trend',
  SENTIMENT_IMPACT = 'sentiment_impact',
  SENTIMENT_CORRELATION = 'sentiment_correlation',
  SENTIMENT_PREDICTION = 'sentiment_prediction'
}

// 分析时间范围
export enum TimeRange {
  HOUR = '1h',
  DAY = '1d',
  WEEK = '1w',
  MONTH = '1m',
  QUARTER = '3m',
  YEAR = '1y',
  ALL = 'all'
}

// 分析粒度
export enum Granularity {
  MINUTE = '1min',
  FIVE_MINUTES = '5min',
  FIFTEEN_MINUTES = '15min',
  HOUR = '1h',
  FOUR_HOURS = '4h',
  DAY = '1d',
  WEEK = '1w'
}

// 分析配置
export interface AnalysisConfig {
  type: AnalysisType;
  timeRange: TimeRange;
  granularity: Granularity;
  chains?: ChainType[];
  tokens?: string[];
  options?: Record<string, any>;
}

// 价格数据
export interface PriceData {
  timestamp: Date;
  token: string;
  chain: ChainType;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
}

// 交易数据
export interface TradeData {
  timestamp: Date;
  type: TransactionType;
  chain: ChainType;
  tokenIn?: string;
  tokenOut?: string;
  amountIn: string;
  amountOut: string;
  price: string;
  fee: string;
  success: boolean;
  duration: number;
}

// 投资组合数据
export interface PortfolioData {
  timestamp: Date;
  totalValue: string;
  pnl: string;
  roi: number;
  holdings: Array<{
    chain: ChainType;
    token: string;
    amount: string;
    value: string;
    allocation: number;
    pnl: string;
    roi: number;
  }>;
}

// 链上数据
export interface ChainData {
  timestamp: Date;
  chain: ChainType;
  blockHeight: number;
  transactionCount: number;
  activeAddresses: number;
  gasUsed: string;
  averageGasPrice: string;
  totalValue: string;
}

// 情绪数据
export interface SentimentData {
  timestamp: Date;
  source: string;
  sentiment: number;
  volume: number;
  impact: number;
  keywords: string[];
  metadata?: Record<string, any>;
}

// 分析结果
export interface AnalysisResult<T = any> {
  type: AnalysisType;
  timestamp: Date;
  timeRange: TimeRange;
  granularity: Granularity;
  data: T;
  statistics: {
    count: number;
    mean?: number;
    median?: number;
    min?: number;
    max?: number;
    stdDev?: number;
    skewness?: number;
    kurtosis?: number;
  };
  trends: {
    direction: 'up' | 'down' | 'neutral';
    strength: number;
    confidence: number;
    support?: number;
    resistance?: number;
  };
  signals: Array<{
    type: string;
    timestamp: Date;
    strength: number;
    description: string;
  }>;
  metadata?: Record<string, any>;
}

// 分析器接口
export interface Analyzer {
  analyze<T>(config: AnalysisConfig): Promise<AnalysisResult<T>>;
  getAvailableTypes(): AnalysisType[];
  getSupportedTimeRanges(): TimeRange[];
  getSupportedGranularities(): Granularity[];
  validateConfig(config: AnalysisConfig): boolean;
}

// 数据源接口
export interface DataSource {
  getPriceData(
    token: string,
    chain: ChainType,
    timeRange: TimeRange,
    granularity: Granularity
  ): Promise<PriceData[]>;

  getTradeData(
    config: {
      chain?: ChainType;
      token?: string;
      type?: TransactionType;
      timeRange: TimeRange;
    }
  ): Promise<TradeData[]>;

  getPortfolioData(
    timeRange: TimeRange,
    granularity: Granularity
  ): Promise<PortfolioData[]>;

  getChainData(
    chain: ChainType,
    timeRange: TimeRange,
    granularity: Granularity
  ): Promise<ChainData[]>;

  getSentimentData(
    config: {
      source?: string;
      keywords?: string[];
      timeRange: TimeRange;
      granularity: Granularity;
    }
  ): Promise<SentimentData[]>;
}

// 统计工具接口
export interface StatisticsUtils {
  // 基础统计
  mean(data: number[]): number;
  median(data: number[]): number;
  stdDev(data: number[]): number;
  variance(data: number[]): number;
  skewness(data: number[]): number;
  kurtosis(data: number[]): number;
  percentile(data: number[], p: number): number;

  // 相关性分析
  correlation(x: number[], y: number[]): number;
  linearRegression(x: number[], y: number[]): {
    slope: number;
    intercept: number;
    rSquared: number;
  };

  // 时间序列分析
  movingAverage(data: number[], period: number): number[];
  exponentialMovingAverage(data: number[], period: number): number[];

  // 数据标准化
  standardize(data: number[]): number[];
  normalize(data: number[]): number[];

  // 金融指标
  logReturns(data: number[]): number[];
  volatility(data: number[], period: number): number;
  sharpeRatio(returns: number[], riskFreeRate: number): number;
  maxDrawdown(data: number[]): {
    maxDrawdown: number;
    peakIndex: number;
    troughIndex: number;
  };
  beta(returns: number[], marketReturns: number[]): number;
}

// 技术指标接口
export interface TechnicalIndicators {
  sma(data: number[], period: number): number[];
  ema(data: number[], period: number): number[];
  rsi(data: number[], period: number): number[];
  macd(data: number[], fastPeriod: number, slowPeriod: number, signalPeriod: number): {
    macd: number[];
    signal: number[];
    histogram: number[];
  };
  bollinger(data: number[], period: number, stdDev: number): {
    middle: number[];
    upper: number[];
    lower: number[];
  };
  atr(high: number[], low: number[], close: number[], period: number): number[];
  volume(data: number[], period: number): number[];
} 