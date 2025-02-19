import { BaseError } from '@lumix/core';

export class ChainCoreError extends BaseError {
  constructor(message: string, cause?: Error) {
    super('ChainCore', message, cause);
  }
}

export interface ChainConfig {
  rpcUrl: string;
  chainId: number | string;
  name: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
  blockTime?: number;
  explorerUrl?: string;
}

export interface TransactionConfig {
  from?: string;
  to: string;
  value?: string | number;
  data?: string;
  nonce?: number;
  gasLimit?: number;
  gasPrice?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
}

export interface BlockData {
  number: number;
  hash: string;
  timestamp: number;
  transactions: string[];
}

export interface TransactionData {
  hash: string;
  from: string;
  to: string;
  value: string;
  blockNumber: number;
  timestamp: number;
  status: boolean;
  gasUsed: number;
  effectiveGasPrice: string;
}

export interface AccountData {
  address: string;
  balance: string;
  nonce: number;
  code?: string;
}

export interface ChainMetrics {
  blockTime: number;
  gasPrice: string;
  tps: number;
  pendingTxCount: number;
}

export interface ChainState {
  latestBlock: BlockData;
  metrics: ChainMetrics;
  timestamp: number;
}

// 链适配器接口
export interface ChainAdapter {
  readonly config: ChainConfig;
  
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  
  getBlock(blockNumber: number): Promise<BlockData>;
  getTransaction(txHash: string): Promise<TransactionData>;
  getAccount(address: string): Promise<AccountData>;
  getGasPrice(): Promise<string>;
  
  sendTransaction(tx: TransactionConfig): Promise<string>;
  estimateGas(tx: TransactionConfig): Promise<number>;
  
  getChainState(): Promise<ChainState>;
}

// 链分析器接口
export interface ChainAnalyzer {
  readonly adapter: ChainAdapter;
  
  analyzeTransaction(tx: TransactionData): Promise<TransactionAnalysis>;
  analyzeAccount(account: AccountData): Promise<AccountAnalysis>;
  analyzeBlock(block: BlockData): Promise<BlockAnalysis>;
  
  getMetrics(): Promise<ChainMetrics>;
  detectAnomalies(): Promise<AnomalyReport[]>;
}

export interface TransactionAnalysis {
  type: string;
  risk: number;
  value: number;
  gasEfficiency: number;
  relatedAddresses: string[];
  protocols?: string[];
  notes: string[];
}

export interface AccountAnalysis {
  type: 'contract' | 'eoa' | 'unknown';
  balance: number;
  activity: {
    txCount: number;
    lastActive: number;
    frequency: number;
  };
  risk: number;
  tags: string[];
  notes: string[];
}

export interface BlockAnalysis {
  difficulty: number;
  size: number;
  gasUsed: number;
  gasLimit: number;
  txCount: number;
  uniqueAddresses: number;
  valueTransferred: number;
  anomalies: string[];
}

export interface AnomalyReport {
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  evidence: any;
  timestamp: number;
  recommendations: string[];
}