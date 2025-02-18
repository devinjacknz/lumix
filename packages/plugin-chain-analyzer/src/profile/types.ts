import { BaseError } from '@lumix/core';

export class ProfileError extends BaseError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ProfileError';
  }
}

export interface TransactionActivity {
  hash: string;
  blockNumber: number;
  timestamp: number;
  from: string;
  to: string;
  value: bigint;
  gasUsed: bigint;
  gasPrice: bigint;
  input: string;
  status: boolean;
  type: 'transfer' | 'contract_call' | 'contract_creation' | 'token_transfer';
  tokenInfo?: {
    address: string;
    symbol: string;
    amount: bigint;
  };
}

export interface ContractInteraction {
  contract: string;
  method: string;
  callCount: number;
  lastCall: number;
  totalGasUsed: bigint;
  averageGasUsed: bigint;
  successRate: number;
}

export interface TokenBalance {
  token: string;
  symbol: string;
  balance: bigint;
  lastUpdated: number;
}

export interface AddressTag {
  tag: string;
  confidence: number;
  source: string;
  timestamp: number;
}

export interface BehaviorPattern {
  type: 'trading' | 'farming' | 'staking' | 'lending' | 'governance' | 'bot';
  score: number;
  evidence: Array<{
    type: string;
    weight: number;
    data: any;
  }>;
}

export interface AddressProfile {
  address: string;
  firstSeen: number;
  lastActive: number;
  totalTransactions: number;
  nonce: number;
  balance: bigint;
  
  // 交易统计
  transactionStats: {
    sent: number;
    received: number;
    failed: number;
    avgGasUsed: bigint;
    totalGasSpent: bigint;
  };

  // 代币余额
  tokenBalances: TokenBalance[];

  // 合约交互
  contractInteractions: ContractInteraction[];

  // 标签
  tags: AddressTag[];

  // 行为模式
  patterns: BehaviorPattern[];

  // 风险评分 (0-100)
  riskScore: number;

  // 元数据
  metadata: Record<string, any>;
}

export interface ProfileFilter {
  minTransactions?: number;
  minBalance?: bigint;
  tags?: string[];
  patterns?: string[];
  riskScoreRange?: {
    min: number;
    max: number;
  };
  dateRange?: {
    start: number;
    end: number;
  };
}

export interface ProfileUpdateOptions {
  forceUpdate?: boolean;
  updateDepth?: number;
  includePending?: boolean;
  maxTransactions?: number;
} 