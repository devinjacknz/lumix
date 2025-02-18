import { Chain } from '@thirdweb-dev/chains';

export interface DeFiProtocol {
  chain: 'ETH' | 'SOL';
  name: string;
  contractAddress: string;
  tvl: number;
  apy?: number;
  risks: RiskMetrics;
  liquidityPools: LiquidityPool[];
  governance?: GovernanceInfo;
  createdAt: number;
  updatedAt: number;
}

export interface RiskMetrics {
  auditStatus: 'verified' | 'pending' | 'none';
  insurance: boolean;
  centralizationRisks: string[];
  securityScore?: number;
}

export interface LiquidityPool {
  pair: string;
  volume24h: number;
  feeRate: number;
  tvl: number;
  apy?: number;
  analysis?: LiquidityAnalysis;
}

export interface LiquidityAnalysis {
  price: number;
  depth: number;
  impermanentLoss: number;
}

export interface GovernanceInfo {
  token: string;
  votingSystem: string;
  proposalCount?: number;
  totalVotingPower?: number;
}

export interface ContractAnalysis {
  security: {
    reentrancy: boolean;
    accessControl: boolean;
    oracleUsage: boolean;
  };
  features: {
    flashLoan: boolean;
    yieldStrategy: boolean;
  };
}

export interface ContractAnalysisResult {
  address: string;
  bytecodeAnalysis: BytecodeAnalysis;
  securityAnalysis: SecurityScore;
  riskAssessment: RiskAssessment;
  aiAnalysis: AIAnalysis | null;
  timestamp: number;
}

export interface BytecodeAnalysis {
  hasSelfdestruct: boolean;
  hasDelegatecall: boolean;
  hasAssembly: boolean;
  complexity: number;
}

export interface SecurityCheck {
  type: string;
  score: number;
  findings: string[];
}

export interface SecurityScore {
  overallScore: number;
  details: SecurityCheck[];
  recommendations: string[];
  timestamp: number;
}

export interface RiskFactors {
  codeQuality: number;
  securityRisk: number;
  liquidityRisk: number;
  marketRisk: number;
}

export interface RiskAssessment {
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  riskFactors: RiskFactors;
  recommendations: string[];
  timestamp: number;
}

export interface AIAnalysis {
  analysis: any;
  confidence: number;
  suggestions: string[];
}

export interface TokenMetrics {
  price: number;
  volume24h: number;
  marketCap: number;
  holders: number;
  priceChange?: {
    '1h': number;
    '24h': number;
    '7d': number;
  };
  socialMetrics?: {
    twitter: number;
    telegram: number;
    discord: number;
  };
}

export interface LiquidityAnalysis {
  totalLiquidity: number;
  liquidityDepth: number;
  concentrationRisk: number;
  poolDistribution?: {
    dex: string;
    amount: number;
    share: number;
  }[];
  historicalLiquidity?: {
    timestamp: number;
    value: number;
  }[];
}

export interface MarketMetrics {
  volatility: number;
  correlation: number;
  momentum: number;
  tradingVolume?: {
    buy: number;
    sell: number;
    ratio: number;
  };
  marketSentiment?: {
    score: number;
    signals: string[];
  };
}

export interface CrawlerConfig {
  chains: Chain[];
  protocols: string[];
  interval: number;
  maxConcurrency: number;
  dataProviders: {
    defiLlama?: boolean;
    coingecko?: boolean;
  };
}

export interface DataProvider {
  name: string;
  enabled: boolean;
  apiKey?: string;
  baseUrl: string;
  rateLimit: number;
}

export interface CrawlerResult {
  timestamp: number;
  chain: Chain;
  protocol: string;
  data: {
    tvl?: number;
    volume24h?: number;
    fees24h?: number;
    uniqueUsers24h?: number;
    [key: string]: any;
  };
  metadata?: {
    source: string;
    reliability: number;
    latency: number;
  };
}

export interface DeFiEvent {
  type: 'TVL_CHANGE' | 'VOLUME_SPIKE' | 'SECURITY_ALERT' | 'PRICE_MOVEMENT';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  timestamp: number;
  protocol: string;
  chain: Chain;
  data: any;
  metadata?: {
    confidence: number;
    source: string;
  };
}

export interface AnalysisReport {
  timestamp: number;
  protocol: string;
  chain: Chain;
  metrics: {
    tvl: number;
    volume: number;
    fees: number;
    users: number;
  };
  risks: {
    securityScore: number;
    liquidityRisk: number;
    centralityRisk: number;
    volatilityRisk: number;
  };
  recommendations: string[];
  metadata: {
    dataQuality: number;
    coverage: number;
    lastUpdate: number;
  };
}

export interface CrawlerStats {
  totalProtocols: number;
  totalPools: number;
  avgTvl: number;
  dataFreshness: number; // average age in seconds
  lastUpdated: number;
  errors: CrawlerError[];
}

export interface CrawlerError {
  source: string;
  error: string;
  timestamp: number;
  retryCount: number;
}

export interface Config {
  chains: Chain[];
  protocols: string[];
  interval: number;
  maxConcurrency: number;
  dataProviders: {
    defiLlama?: boolean;
    coingecko?: boolean;
  };
  priceOracle?: string;
}

export interface DeFiAnalyzerConfig {
  rpcUrl: string;
  chainId: number | string;
  apiEndpoints?: {
    dexScreener?: string;
    coingecko?: string;
  };
  cache?: {
    enabled: boolean;
    duration: number;
  };
  retryAttempts?: number;
  timeout?: number;
}
