import { BigNumber } from 'ethers';

export enum ChainProtocol {
  SOLANA = 'SOLANA',
  EVM = 'EVM',
}

export interface Transaction {
  hash: string;
  from: string;
  to: string;
  value: BigNumber;
  data?: string;
  nonce?: number;
}

export interface ChainAdapter {
  protocol: ChainProtocol;
  getBalance(address: string): Promise<BigNumber>;
  getTransaction(hash: string): Promise<Transaction>;
  sendTransaction(tx: Transaction): Promise<string>;
  simulateTransaction(tx: Transaction): Promise<SimulationResult>;
}

export interface SimulationResult {
  success: boolean;
  gasUsed: BigNumber;
  logs: string[];
  error?: string;
}

export interface ChainConfig {
  protocol: ChainProtocol;
  rpcUrl: string;
  chainId?: number;
  networkVersion?: string;
} 