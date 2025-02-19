import { ChainType, TransactionStatus } from './chain';

export enum TransactionType {
  TRANSFER = 'transfer',
  SWAP = 'swap',
  APPROVE = 'approve',
  STAKE = 'stake',
  UNSTAKE = 'unstake',
  CLAIM = 'claim',
  BRIDGE = 'bridge',
  DEPLOY = 'deploy',
  EXECUTE = 'execute'
}

export interface TransactionConfig {
  maxGasPrice: string;
  gasLimitMultiplier: number;
  retryAttempts: number;
  retryDelay: number;
  confirmationBlocks: number;
  timeout: number;
}

export interface TransactionRequest {
  type: TransactionType;
  chain: ChainType;
  from: string;
  to: string;
  value?: string;
  data?: string;
  gasPrice?: string;
  gasLimit?: string;
  nonce?: number;
  metadata?: Record<string, any>;
}

export interface TransactionResponse {
  hash: string;
  status: TransactionStatus;
  receipt?: {
    blockNumber: number;
    blockHash: string;
    gasUsed: string;
    status: boolean;
  };
  error?: string;
}

export interface TransactionResult {
  success: boolean;
  hash?: string;
  status: TransactionStatus;
  receipt?: {
    blockNumber: number;
    blockHash: string;
    gasUsed: string;
    status: boolean;
  };
  error?: string;
  metadata?: Record<string, any>;
}

export interface TransactionError {
  code: string;
  message: string;
  details?: Record<string, any>;
}

export interface TransactionEvent {
  type: 'submitted' | 'confirmed' | 'failed';
  transaction: TransactionResponse;
  timestamp: number;
  metadata?: Record<string, any>;
}

export interface TransactionMetadata {
  request: TransactionRequest;
  response?: TransactionResponse;
  events: TransactionEvent[];
  timestamp: number;
}

export interface TransactionHistory {
  transactions: TransactionMetadata[];
  stats: TransactionStats;
}

export interface TransactionStats {
  total: number;
  successful: number;
  failed: number;
  pending: number;
  avgGasPrice: string;
  avgGasUsed: string;
  totalValue: string;
}

export interface TransactionReceipt {
  hash: string;
  blockNumber: number;
  blockHash: string;
  status: boolean;
  gasUsed: string;
  logs: Array<{
    address: string;
    topics: string[];
    data: string;
  }>;
}
