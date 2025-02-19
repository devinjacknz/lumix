export type ChainType = 'SOLANA' | 'ETHEREUM' | 'BASE';

export enum ChainProtocol {
  SOLANA = 'SOLANA',
  EVM = 'EVM'
}

export type TransactionStatus = 'pending' | 'confirmed' | 'failed';

export interface ChainConfig {
  rpcUrl: string;
  chainId?: number;
  protocol: ChainProtocol;
}

export interface ChainTransaction {
  hash: string;
  from: string;
  to: string;
  value: string;
  data?: string;
  nonce?: number;
  gasLimit?: string;
  gasPrice?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
}

export interface ChainTransactionReceipt {
  blockNumber: number;
  blockHash: string;
  transactionHash: string;
  status: boolean;
  gasUsed: bigint;
  effectiveGasPrice: bigint;
  logs: any[];
}

export interface ChainBlock {
  hash: string;
  number: number;
  timestamp: number;
  parentHash: string;
  transactions: string[];
}

export interface ChainEvent {
  address: string;
  topics: string[];
  data: string;
  blockNumber: number;
  transactionHash: string;
  logIndex: number;
}

export interface ChainFilter {
  fromBlock?: number;
  toBlock?: number;
  address?: string | string[];
  topics?: (string | string[] | null)[];
}

export interface ChainLog {
  address: string;
  topics: string[];
  data: string;
  blockNumber: number;
  transactionHash: string;
  logIndex: number;
}

export interface ChainBalance {
  address: string;
  balance: string;
  token?: string;
  timestamp?: number;
}

export interface ChainNonce {
  address: string;
  nonce: number;
}

export interface ChainGasPrice {
  gasPrice: bigint;
  maxFeePerGas?: bigint;
  maxPriorityFeePerGas?: bigint;
  computeUnitPrice?: number;
}

export interface ChainGasEstimate {
  gasLimit: bigint;
  priorityFee?: bigint;
  computeUnits?: number;
}

export interface ChainAddress {
  address: string;
  publicKey: string;
  chain: ChainType;
}

export interface AddressDerivationOptions {
  network?: string;
  index?: number;
  path?: string;
}

export interface ChainAdapter {
  getChainType(): ChainType;
  
  // Transaction methods
  prepareTransaction(transaction: ChainTransaction): Promise<ChainTransaction>;
  signTransaction(transaction: ChainTransaction, privateKey: string): Promise<ChainTransaction>;
  sendTransaction(transaction: ChainTransaction): Promise<string>;
  getTransactionReceipt(hash: string): Promise<ChainTransactionReceipt | null>;
  
  // Gas estimation
  estimateGas(transaction: ChainTransaction): Promise<ChainGasEstimate>;
  getGasPrice(chain?: ChainType): Promise<ChainGasPrice>;
  
  // Address methods
  deriveAddress(privateKey: string, options?: AddressDerivationOptions): Promise<ChainAddress>;
  validateAddress(address: string): boolean;
  validatePrivateKey(privateKey: string): boolean;
  formatAddress(address: string): string;
  
  // Balance methods
  getBalance(address: string): Promise<string>;
  getTokenBalance(address: string, token: string): Promise<string>;
}
