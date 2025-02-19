export type ChainType = 'SOLANA' | 'ETHEREUM' | 'BASE';

export enum ChainProtocol {
  SOLANA = 'SOLANA',
  EVM = 'EVM'
}

export interface ChainConfig {
  rpcUrl: string;
  chainId?: number;
  protocol: ChainProtocol;
}

export interface ChainGasEstimate {
  gasLimit: bigint;
  gasPrice?: bigint;
  priorityFee?: bigint;
  computeUnits?: number;
}

export interface ChainGasPrice {
  gasPrice: bigint;
  maxFeePerGas?: bigint;
  maxPriorityFeePerGas?: bigint;
  computeUnitPrice?: number;
}

export interface ChainTransaction {
  hash?: string;
  from: string;
  to: string;
  value: string;
  data?: string;
  nonce?: number;
  gasLimit?: string;
  gasPrice?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
  chain: ChainType;
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