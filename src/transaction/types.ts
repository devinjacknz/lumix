import { ChainType, ChainGasEstimate, ChainGasPrice } from '@lumix/types';

// Re-export types from @lumix/types
export type { ChainType };

export enum TransactionType {
  TRANSFER = 'transfer',
  TOKEN_TRANSFER = 'tokenTransfer',
  SWAP = 'swap',
  APPROVE = 'approve',
  CONTRACT_CALL = 'contractCall'
}

export type TransactionStatus = 'pending' | 'confirmed' | 'failed';

export interface BaseTransactionRequest {
  id?: string;
  type: TransactionType;
  chain: ChainType;
  from: string;
  value?: string;
  data?: string;
  nonce?: number;
  gasLimit?: string;
  gasPrice?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
  metadata?: Record<string, any>;
}

export interface TransferRequest extends BaseTransactionRequest {
  type: TransactionType.TRANSFER;
  to: string;
  amount: string;
}

export interface TokenTransferRequest extends BaseTransactionRequest {
  type: TransactionType.TOKEN_TRANSFER;
  token: string;
  to: string;
  amount: string;
}

export interface SwapRequest extends BaseTransactionRequest {
  type: TransactionType.SWAP;
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  amountOutMin: string;
  route?: string[];
}

export interface ApproveRequest extends BaseTransactionRequest {
  type: TransactionType.APPROVE;
  token: string;
  spender: string;
  amount: string;
}

export interface ContractCallRequest extends BaseTransactionRequest {
  type: TransactionType.CONTRACT_CALL;
  to: string;
  method: string;
  params: any[];
}

export type TransactionRequest = 
  | TransferRequest 
  | TokenTransferRequest
  | SwapRequest 
  | ApproveRequest 
  | ContractCallRequest;

export interface TransactionBase {
  id: string;
  hash?: string;
  from: string;
  to: string;
  value: string;
  chain: ChainType;
  type: TransactionType;
  status: TransactionStatus;
  timestamp: Date;
  gasUsed?: string;
  effectiveGasPrice?: string;
  blockNumber?: number;
  blockHash?: string;
  error?: string;
}

export interface TransactionEstimate {
  gasLimit: string;
  gasPrice: string;
  fee: string;
}

export interface TransactionConfirmation {
  blockNumber: number;
  blockHash: string;
  timestamp: Date;
  gasUsed?: string;
  effectiveGasPrice?: string;
  logs?: any[];
}

export interface TransactionRecord {
  id: string;
  hash: string;
  from: string;
  to: string;
  value: string;
  chain: ChainType;
  type: TransactionType;
  status: TransactionStatus;
  timestamp: Date;
  gasUsed?: string;
  effectiveGasPrice?: string;
  blockNumber?: number;
  blockHash?: string;
  error?: string;
  metadata?: {
    request: string;
  };
}

export interface TransactionEngineConfig {
  maxConcurrent: number;
  timeout: number;
  maxRetries: number;
  confirmationBlocks: Record<ChainType, number>;
  minGasPrice: Record<ChainType, string>;
  maxGasPrice: Record<ChainType, string>;
  defaultGasLimit: Record<ChainType, string>;
}

export interface TransactionResponse {
  id: string;
  hash: string;
  status: TransactionStatus;
  timestamp: Date;
  gasUsed?: string;
  effectiveGasPrice?: string;
  blockNumber?: number;
  blockHash?: string;
  error?: string;
  confirmation?: TransactionConfirmation;
}

export interface TransactionError {
  code: string;
  message: string;
  details?: Record<string, any>;
} 