import { ChainType } from '../config/types';
import { TokenRecord, TransactionRecord } from '../database/types';
import { ChainAddress } from '../chain/types';

// API响应基础接口
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
}

// 钱包相关
export interface WalletCreateRequest {
  chain: ChainType;
  mnemonic?: string;
  derivationPath?: string;
}

export interface WalletImportRequest {
  chain: ChainType;
  privateKey: string;
}

export interface WalletInfo {
  chain: ChainType;
  address: string;
  publicKey: string;
  lastUsed: Date;
}

// 交易相关
export interface TransactionRequest {
  chain: ChainType;
  from: string;
  to: string;
  amount: string;
  token?: string;  // 如果是原生代币交易，则不需要
  gasLimit?: string;
  gasPrice?: string;
  nonce?: number;
  data?: string;
}

export interface TransactionEstimate {
  gasLimit: string;
  gasPrice: string;
  estimatedFee: string;
  total: string;
}

// Token相关
export interface TokenImportRequest {
  chain: ChainType;
  address: string;
  symbol: string;
  decimals: number;
}

export interface TokenBalance {
  chain: ChainType;
  token: string;
  address: string;
  balance: string;
  usdValue?: string;
}

// 市场数据
export interface PriceData {
  symbol: string;
  price: string;
  change24h: string;
  volume24h: string;
  lastUpdated: Date;
}

// AI/策略相关
export interface StrategyRequest {
  prompt: string;
  context?: Record<string, any>;
  constraints?: {
    maxAmount?: string;
    allowedChains?: ChainType[];
    allowedTokens?: string[];
  };
}

export interface StrategyResponse {
  actions: Array<{
    type: 'swap' | 'transfer' | 'approve' | 'stake' | 'unstake';
    chain: ChainType;
    params: Record<string, any>;
    estimatedGas?: string;
    priority: number;
  }>;
  reasoning: string;
  risks: Array<{
    type: string;
    level: 'low' | 'medium' | 'high';
    description: string;
  }>;
}

// 系统状态
export interface SystemStatus {
  version: string;
  uptime: number;
  chains: Array<{
    type: ChainType;
    status: 'active' | 'degraded' | 'inactive';
    blockHeight: number;
    syncStatus: number;
  }>;
  metrics: {
    cpuUsage: number;
    memoryUsage: number;
    activeConnections: number;
    requestsPerMinute: number;
  };
}

// API路由定义
export interface ApiRoutes {
  // 钱包管理
  'POST /wallet/create': { request: WalletCreateRequest; response: ApiResponse<ChainAddress> };
  'POST /wallet/import': { request: WalletImportRequest; response: ApiResponse<ChainAddress> };
  'GET /wallet/:chain': { response: ApiResponse<WalletInfo> };
  'GET /wallet/:chain/balance': { response: ApiResponse<TokenBalance[]> };

  // 交易管理
  'POST /transaction/create': { request: TransactionRequest; response: ApiResponse<TransactionRecord> };
  'GET /transaction/:id': { response: ApiResponse<TransactionRecord> };
  'POST /transaction/estimate': { request: TransactionRequest; response: ApiResponse<TransactionEstimate> };

  // Token管理
  'POST /token/import': { request: TokenImportRequest; response: ApiResponse<TokenRecord> };
  'GET /token/:chain/:symbol': { response: ApiResponse<TokenRecord> };
  'GET /token/:chain': { response: ApiResponse<TokenRecord[]> };

  // 市场数据
  'GET /market/price/:symbol': { response: ApiResponse<PriceData> };
  'GET /market/prices': { response: ApiResponse<PriceData[]> };

  // AI/策略
  'POST /strategy/generate': { request: StrategyRequest; response: ApiResponse<StrategyResponse> };
  'POST /strategy/execute': { request: StrategyResponse; response: ApiResponse<TransactionRecord[]> };

  // 系统状态
  'GET /system/status': { response: ApiResponse<SystemStatus> };
  'GET /system/metrics': { response: ApiResponse<Record<string, number>> };
} 