// Debug type imports
console.log('Loading chain types from:', '@lumix/types');
export * from '@lumix/types';

// Local type augmentations
import { ChainType, ChainProtocol } from '@lumix/types';
console.log('Imported types:', { ChainType, ChainProtocol });

// Re-export for backward compatibility
export { ChainType, ChainProtocol };

// Type validation helper
export function validateChainType(type: unknown): type is ChainType {
  console.log('Validating chain type:', type);
  return Object.values(ChainType).includes(type as ChainType);
}

export enum TransactionStatus {
  CREATED = 'created',
  SIGNED = 'signed',
  SUBMITTED = 'submitted',
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  FAILED = 'failed'
}

export interface ChainConfig {
  type: ChainType;
  protocol: ChainProtocol;
  rpcUrl: string;
  chainId?: number;
  blockTime?: number;
  nativeToken?: string;
}

export interface ChainGasPrice {
  slow: bigint;
  medium: bigint;
  fast: bigint;
  timestamp: number;
}

export interface ChainGasEstimate {
  gasLimit: bigint;
  gasPrice: bigint;
}

export interface ChainTransaction {
  hash: string;
  from: string;
  to: string;
  value: bigint;
  data: string;
  nonce: number;
  gasLimit: bigint;
  gasPrice: bigint;
  chainId: number;
  type?: number;
  maxFeePerGas?: bigint;
  maxPriorityFeePerGas?: bigint;
  timestamp?: number;
  status?: TransactionStatus;
}

export interface ChainTransactionReceipt {
  blockHash: string;
  blockNumber: number;
  contractAddress: string | null;
  cumulativeGasUsed: bigint;
  effectiveGasPrice: bigint;
  from: string;
  gasUsed: bigint;
  logs: any[];
  logsBloom: string;
  status: boolean;
  to: string;
  transactionHash: string;
  transactionIndex: number;
  type: number;
}

export interface ChainBlock {
  hash: string;
  parentHash: string;
  number: number;
  timestamp: number;
  nonce: string;
  difficulty: number;
  gasLimit: bigint;
  gasUsed: bigint;
  miner: string;
  extraData: string;
  transactions: string[];
}

export interface ChainBalance {
  address: string;
  token: string;
  amount: bigint;
  decimals: number;
  symbol: string;
  name: string;
}

export interface ChainToken {
  address: string;
  decimals: number;
  symbol: string;
  name: string;
  totalSupply: bigint;
}

export interface ChainEvent {
  address: string;
  topics: string[];
  data: string;
  blockNumber: number;
  transactionHash: string;
  transactionIndex: number;
  blockHash: string;
  logIndex: number;
  removed: boolean;
}