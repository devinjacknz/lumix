import { BaseError } from '@lumix/core';

export class ChainAdapterError extends BaseError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ChainAdapterError';
  }
}

/**
 * 链类型
 */
export enum ChainType {
  EVM = 'evm',
  SOLANA = 'solana',
  SUBSTRATE = 'substrate',
  COSMOS = 'cosmos',
  NEAR = 'near'
}

/**
 * 链配置
 */
export interface ChainConfig {
  // 基础信息
  id: number;
  name: string;
  type: 'evm' | 'solana' | 'near' | 'polkadot';
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
  
  // 网络配置
  rpcUrls: string[];
  blockExplorerUrls?: string[];
  iconUrl?: string;
  testnet?: boolean;
  
  // 性能配置
  blockTime?: number;
  confirmations?: number;
  maxBlockRange?: number;
  batchSize?: number;
  
  // 重试配置
  retryAttempts?: number;
  retryDelay?: number;
  timeout?: number;
}

/**
 * 交易配置
 */
export interface TransactionConfig {
  from: string;
  to?: string;
  value: bigint;
  data?: string;
  nonce?: number;
  gasLimit?: bigint;
  gasPrice?: bigint;
  maxFeePerGas?: bigint;
  maxPriorityFeePerGas?: bigint;
  chainId?: number;
  type?: number;
}

/**
 * 交易日志
 */
export interface TransactionLog {
  address: string;
  topics: string[];
  data: string;
  logIndex: number;
  blockNumber: number;
  blockHash: string;
  transactionHash: string;
  transactionIndex: number;
}

/**
 * 交易回执
 */
export interface TransactionReceipt {
  hash: string;
  blockNumber: number;
  blockHash: string;
  timestamp: number;
  from: string;
  to?: string;
  status: boolean;
  gasUsed: bigint;
  effectiveGasPrice: bigint;
  cumulativeGasUsed: bigint;
  logs: TransactionLog[];
  contractAddress?: string;
  type: number;
  root?: string;
  logsBloom?: string;
}

/**
 * 区块信息
 */
export interface BlockInfo {
  number: number;
  hash: string;
  parentHash: string;
  timestamp: number;
  nonce?: string;
  transactions: string[];
  transactionsRoot: string;
  receiptsRoot: string;
  stateRoot: string;
  gasLimit: bigint;
  gasUsed: bigint;
  baseFeePerGas?: bigint;
  miner: string;
  difficulty?: bigint;
  totalDifficulty?: bigint;
  size: number;
  extraData: string;
}

/**
 * 账户信息
 */
export interface AccountInfo {
  address: string;
  balance: bigint;
  nonce: number;
  code?: string;
  storage?: Record<string, string>;
}

/**
 * 链状态
 */
export interface ChainState {
  chainId: number;
  blockNumber: number;
  blockHash: string;
  blockTimestamp: number;
  gasPrice: bigint;
  baseFeePerGas?: bigint;
  nextBaseFeePerGas?: bigint;
  peers: number;
  pendingTransactions: number;
  tps: number;
  syncing: boolean;
  lastUpdated: number;
  latency: number;
  errors: number;
}

export enum ChainProtocol {
  EVM = 'EVM',
  SOLANA = 'SOLANA',
  COSMOS = 'COSMOS'
}

export interface ChainContext {
  chainId: number;
  protocol: ChainProtocol;
  networkVersion?: string;
}

export interface ChainAdapter {
  protocol: ChainProtocol;
  chainId: number;
  
  // 基础链操作
  getBalance(address: string): Promise<string>;
  getTransaction(txHash: string): Promise<any>;
  
  // 合约交互
  callContract(address: string, method: string, params: any[]): Promise<any>;
  estimateGas(tx: any): Promise<string>;
  
  // 交易相关
  sendTransaction(tx: any): Promise<string>;
  waitForTransaction(txHash: string): Promise<any>;
  
  // 状态查询
  getBlockNumber(): Promise<number>;
  getCode(address: string): Promise<string>;
}

export interface AnalysisResult {
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  findings: Array<{
    type: string;
    description: string;
    severity: string;
  }>;
  recommendations: string[];
  formattedOutput?: string;
}

/**
 * 链适配器工厂接口
 */
export interface ChainAdapterFactory {
  // 工厂信息
  readonly type: string;
  readonly version: string;
  
  // 适配器管理
  createAdapter(config: ChainConfig): Promise<ChainAdapter>;
  validateConfig(config: ChainConfig): Promise<boolean>;
  getDefaultConfig(): ChainConfig;
}

/**
 * 链适配器注册表接口
 */
export interface ChainAdapterRegistry {
  // 工厂管理
  registerFactory(factory: ChainAdapterFactory): void;
  unregisterFactory(type: string): void;
  getFactory(type: string): ChainAdapterFactory | undefined;
  getAllFactories(): ChainAdapterFactory[];
  
  // 适配器管理
  createAdapter(config: ChainConfig): Promise<ChainAdapter>;
  validateConfig(config: ChainConfig): Promise<boolean>;
  getDefaultConfig(type: string): ChainConfig;
}

/**
 * 链适配器管理器接口
 */
export interface ChainAdapterManager {
  // 适配器管理
  addChain(config: ChainConfig): Promise<void>;
  removeChain(chainId: number): Promise<void>;
  getChain(chainId: number): ChainAdapter | undefined;
  getAllChains(): ChainAdapter[];
  
  // 状态管理
  updateChainState(chainId: number): Promise<ChainState>;
  getAllChainStates(): Promise<Record<number, ChainState>>;
  
  // 配置管理
  updateChainConfig(chainId: number, config: Partial<ChainConfig>): Promise<void>;
  getChainConfig(chainId: number): ChainConfig | undefined;
  getAllChainConfigs(): Record<number, ChainConfig>;
  
  // 事件监听
  on(event: string, listener: (...args: any[]) => void): void;
  off(event: string, listener: (...args: any[]) => void): void;
  once(event: string, listener: (...args: any[]) => void): void;
} 