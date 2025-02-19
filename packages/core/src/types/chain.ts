export enum ChainProtocol {
  EVM = 'evm',
  SOLANA = 'solana'
}

export interface Transaction {
  hash: string;
  from: string;
  to: string;
  value?: bigint;
  data?: string;
  gasPrice?: bigint;
  gasLimit?: bigint;
  maxPriorityFeePerGas?: bigint;
  maxFeePerGas?: bigint;
  timestamp?: number;
  status?: 'pending' | 'confirmed' | 'failed';
}

export interface ChainConfig {
  rpcUrl: string;
  chainId: number;
  protocol: ChainProtocol;
  confirmationBlocks: number;
  gasMultiplier: number;
  maxGasPrice: bigint;
  retryAttempts: number;
  retryDelay: number;
} 