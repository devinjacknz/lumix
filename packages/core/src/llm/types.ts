import { ChainType } from '../config/types';
import { TransactionType } from '../transaction/types';
import { BaseLanguageModel } from "langchain/base_language";
import { BaseMemory } from "langchain/memory";

// LLM模型类型
export enum ModelType {
  GPT3 = 'gpt3',
  GPT4 = 'gpt4',
  CLAUDE = 'claude',
  CLAUDE2 = 'claude-2',
  OLLAMA = 'ollama'
}

// 模型配置
export interface ModelConfig {
  type: ModelType;
  apiKey: string;
  endpoint?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  timeout?: number;
  statePersistPath?: string;
}

// 提示模板类型
export enum PromptTemplate {
  // 基础分析
  STRATEGY_ANALYSIS = 'strategy_analysis',
  MARKET_ANALYSIS = 'market_analysis',
  RISK_ASSESSMENT = 'risk_assessment',
  PORTFOLIO_OPTIMIZATION = 'portfolio_optimization',
  TRADING_SIGNAL = 'trading_signal',
  ERROR_ANALYSIS = 'error_analysis',

  // 市场情绪
  MARKET_SENTIMENT = 'market_sentiment',
  NEWS_IMPACT = 'news_impact',
  SOCIAL_MEDIA = 'social_media',

  // 技术分析
  TECHNICAL_ANALYSIS = 'technical_analysis',
  PATTERN_RECOGNITION = 'pattern_recognition',
  INDICATOR_ANALYSIS = 'indicator_analysis',

  // 链上分析
  ONCHAIN_ANALYSIS = 'onchain_analysis',
  WALLET_ANALYSIS = 'wallet_analysis',
  CONTRACT_ANALYSIS = 'contract_analysis',

  // 流动性分析
  LIQUIDITY_ANALYSIS = 'liquidity_analysis',
  DEPTH_ANALYSIS = 'depth_analysis',
  SLIPPAGE_ANALYSIS = 'slippage_analysis',

  // 套利分析
  ARBITRAGE_ANALYSIS = 'arbitrage_analysis',
  SPREAD_ANALYSIS = 'spread_analysis',
  EXECUTION_ANALYSIS = 'execution_analysis'
}

// 提示模板参数
export interface PromptTemplateParams {
  // 基础数据
  marketData?: MarketData;
  portfolioData?: PortfolioData;
  tradingHistory?: TradingHistory;
  constraints?: TradingConstraints;
  context?: Record<string, any>;

  // 市场情绪数据
  socialData?: {
    platform: string;
    sentiment: number;
    volume: number;
    keywords: string[];
    timestamp: Date;
  }[];
  newsData?: {
    title: string;
    content: string;
    source: string;
    sentiment: number;
    timestamp: Date;
  }[];

  // 技术分析数据
  priceData?: {
    timestamp: Date;
    open: string;
    high: string;
    low: string;
    close: string;
    volume: string;
  }[];
  indicators?: {
    ma?: Record<string, number[]>;
    rsi?: number[];
    macd?: {
      macd: number[];
      signal: number[];
      histogram: number[];
    };
    volume?: number[];
  };

  // 链上数据
  onchainData?: {
    activeAddresses: number;
    transactionCount: number;
    gasUsed: string;
    blockTime: number;
    timestamp: Date;
  };
  walletData?: {
    address: string;
    balance: string;
    transactions: number;
    lastActive: Date;
    tags?: string[];
  }[];
  contractData?: {
    address: string;
    type: string;
    interactions: number;
    volume: string;
    timestamp: Date;
  }[];

  // 流动性数据
  marketDepth?: {
    bids: Array<[string, string]>;
    asks: Array<[string, string]>;
    timestamp: Date;
  };
  slippageData?: {
    amount: string;
    priceImpact: string;
    direction: 'buy' | 'sell';
  }[];

  // 套利数据
  exchangeData?: {
    exchange: string;
    price: string;
    volume: string;
    fees: string;
    timestamp: Date;
  }[];
  spreadData?: {
    pair: string;
    spread: string;
    volume: string;
    timestamp: Date;
  }[];
}

// 市场数据
export interface MarketData {
  timestamp: Date;
  prices: Record<string, string>;
  volumes: Record<string, string>;
  trends: Record<string, {
    change1h: string;
    change24h: string;
    change7d: string;
  }>;
  indicators?: Record<string, any>;
}

// 投资组合数据
export interface PortfolioData {
  totalValue: string;
  assets: Array<{
    chain: ChainType;
    token: string;
    amount: string;
    value: string;
    allocation: number;
  }>;
  performance: {
    daily: number;
    weekly: number;
    monthly: number;
  };
}

// 交易历史
export interface TradingHistory {
  trades: Array<{
    timestamp: Date;
    type: TransactionType;
    chain: ChainType;
    tokenIn?: string;
    tokenOut?: string;
    amountIn: string;
    amountOut: string;
    success: boolean;
  }>;
  statistics: {
    totalTrades: number;
    successRate: number;
    averageReturn: number;
  };
}

// 交易约束
export interface TradingConstraints {
  maxTransactionValue: string;
  minTransactionValue: string;
  allowedChains: ChainType[];
  allowedTokens: string[];
  maxSlippage: number;
  minLiquidity: string;
  gasLimit: Record<ChainType, string>;
}

// 策略分析结果
export interface StrategyAnalysis {
  recommendation: 'buy' | 'sell' | 'hold';
  confidence: number;
  reasoning: string;
  risks: Array<{
    type: string;
    level: 'low' | 'medium' | 'high';
    description: string;
  }>;
  actions: Array<{
    type: TransactionType;
    chain: ChainType;
    priority: number;
    params: Record<string, any>;
    expectedReturn?: string;
    maxSlippage?: number;
  }>;
}

// 市场分析结果
export interface MarketAnalysis {
  overview: string;
  trends: Array<{
    asset: string;
    trend: 'bullish' | 'bearish' | 'neutral';
    strength: number;
    factors: string[];
  }>;
  opportunities: Array<{
    description: string;
    confidence: number;
    timeframe: 'short' | 'medium' | 'long';
    relatedAssets: string[];
  }>;
  risks: Array<{
    description: string;
    severity: 'low' | 'medium' | 'high';
    probability: number;
    mitigation?: string;
  }>;
}

// 风险评估结果
export interface RiskAssessment {
  overallRisk: 'low' | 'medium' | 'high';
  factors: Array<{
    name: string;
    risk: 'low' | 'medium' | 'high';
    impact: number;
    description: string;
  }>;
  recommendations: Array<{
    action: string;
    priority: number;
    rationale: string;
  }>;
  limits: {
    maxExposure: Record<string, string>;
    stopLoss: Record<string, string>;
    takeProfit: Record<string, string>;
  };
}

// LLM响应
export interface LLMResponse<T = any> {
  content: string | T;
  tokens?: number;
  model?: string;
  timestamp: number;
  metadata?: {
    promptType?: PromptTemplate;
    params?: any;
    [key: string]: any;
  };
}

// LLM接口
export interface LLMInterface {
  initialize(): Promise<void>;
  chat(messages: any[]): Promise<LLMResponse>;
  analyze<T>(promptType: PromptTemplate, params: PromptTemplateParams): Promise<LLMResponse<T>>;
  embed?(text: string): Promise<number[]>;
  shutdown(): Promise<void>;
} 