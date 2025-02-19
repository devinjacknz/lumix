import { ChainType, ChainGasEstimate, ChainGasPrice } from '@lumix/types';

// 交易类型
export enum TransactionType {
  TRANSFER = 'transfer',           // 原生代币转账
  TOKEN_TRANSFER = 'tokenTransfer', // Token转账
  SWAP = 'swap',                   // 代币兑换
  APPROVE = 'approve',             // Token授权
  STAKE = 'stake',                 // 质押
  UNSTAKE = 'unstake',            // 解除质押
  CLAIM = 'claim',                // 领取奖励
  CONTRACT_CALL = 'contractCall',   // 合约调用
  BRIDGE = 'bridge',               // 跨链转账
  DEPLOY = 'deploy',               // 合约部署
  EXECUTE = 'execute'             // 合约执行
}

// Gas设置
export interface GasSettings {
  maxFeePerGas?: string;          // EVM链最大gas费用
  maxPriorityFeePerGas?: string;  // EVM链最大优先费用
  gasLimit?: string;              // gas限制
  computeUnitLimit?: number;      // Solana计算单元限制
  computeUnitPrice?: number;      // Solana计算单元价格
}

// 交易状态
export enum TransactionStatus {
  CREATED = 'created',           // 交易已创建
  SIGNED = 'signed',            // 交易已签名
  SUBMITTED = 'submitted',      // 交易已提交
  PENDING = 'pending',          // 交易待确认
  CONFIRMED = 'confirmed',      // 交易已确认
  FAILED = 'failed',            // 交易失败
  DROPPED = 'dropped'           // 交易被丢弃
}

// 交易确认信息
export interface TransactionConfirmation {
  blockNumber: number;          // 区块高度
  blockHash: string;           // 区块哈希
  timestamp: Date;             // 确认时间
  gasUsed?: string;           // 使用的gas
  effectiveGasPrice?: string; // 实际gas价格
  logs?: any[];              // 交易日志
}

// 基础交易请求
export interface BaseTransactionRequest {
  chain: ChainType;           // 链类型
  from: string;               // 发送地址
  nonce?: number;             // 交易序号
  gasSettings?: GasSettings;  // gas设置
  metadata?: Record<string, any>; // 元数据
}

// 原生代币转账请求
export interface TransferRequest extends BaseTransactionRequest {
  type: TransactionType.TRANSFER;
  to: string;                 // 接收地址
  amount: string;             // 转账金额
}

// Token转账请求
export interface TokenTransferRequest extends BaseTransactionRequest {
  type: TransactionType.TOKEN_TRANSFER;
  token: string;              // Token地址
  to: string;                 // 接收地址
  amount: string;             // 转账金额
}

// 代币兑换请求
export interface SwapRequest extends BaseTransactionRequest {
  type: TransactionType.SWAP;
  tokenIn: string;            // 输入Token地址
  tokenOut: string;           // 输出Token地址
  amountIn: string;           // 输入金额
  amountOutMin: string;       // 最小输出金额
  route?: string[];           // 兑换路径
  deadline?: number;          // 截止时间
}

// Token授权请求
export interface ApproveRequest extends BaseTransactionRequest {
  type: TransactionType.APPROVE;
  token: string;              // Token地址
  spender: string;            // 授权地址
  amount: string;             // 授权金额
}

// 质押请求
export interface StakeRequest extends BaseTransactionRequest {
  type: TransactionType.STAKE;
  token: string;              // 质押Token地址
  amount: string;             // 质押金额
  validator?: string;         // 验证者地址（针对PoS链）
}

// 解除质押请求
export interface UnstakeRequest extends BaseTransactionRequest {
  type: TransactionType.UNSTAKE;
  token: string;              // 质押Token地址
  amount: string;             // 解除质押金额
  validator?: string;         // 验证者地址
}

// 领取奖励请求
export interface ClaimRequest extends BaseTransactionRequest {
  type: TransactionType.CLAIM;
  token?: string;             // 奖励Token地址
  amount?: string;            // 领取金额
}

// 合约调用请求
export interface ContractCallRequest extends BaseTransactionRequest {
  type: TransactionType.CONTRACT_CALL;
  contract: string;           // 合约地址
  method: string;             // 方法名
  params: any[];             // 参数列表
  value?: string;            // 调用金额
}

// 交易请求联合类型
export type TransactionRequest =
  | TransferRequest
  | TokenTransferRequest
  | SwapRequest
  | ApproveRequest
  | StakeRequest
  | UnstakeRequest
  | ClaimRequest
  | ContractCallRequest;

// 交易记录
export interface Transaction {
  id: string;                 // 交易ID
  hash?: string;              // 交易哈希
  request: TransactionRequest; // 交易请求
  status: TransactionStatus;   // 交易状态
  timestamp: Date;            // 创建时间
  confirmation?: TransactionConfirmation; // 确认信息
  error?: string;             // 错误信息
}

// 交易结果
export interface TransactionResult {
  transaction: Transaction;    // 交易信息
  receipt?: any;              // 交易收据
  events?: any[];            // 交易事件
}

// 交易费用估算
export interface TransactionEstimate {
  gasLimit: string;           // 预估gas限制
  gasPrice: string;           // 预估gas价格
  fee: string;                // 预估费用
  total: string;              // 总费用（包含交易金额）
}

// 交易引擎配置
export interface TransactionEngineConfig {
  maxConcurrent: number;      // 最大并发交易数
  confirmationBlocks: number; // 确认区块数
  timeout: number;            // 超时时间(ms)
  maxRetries: number;         // 最大重试次数
  minGasPrice: Record<ChainType, string>; // 最低gas价格
  maxGasPrice: Record<ChainType, string>; // 最高gas价格
  defaultGasLimit: Record<ChainType, string>; // 默认gas限制
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

export interface TransactionError {
  code: string;
  message: string;
  details?: Record<string, any>;
}

export interface Transaction {
  id: string;
  hash: string;
  from: string;
  to: string;
  value: string;
  status: TransactionStatus;
  timestamp: Date;
  chain: ChainType;
  type: 'transfer' | 'swap';
  gasUsed?: string;
  effectiveGasPrice?: string;
  blockNumber?: number;
  blockHash?: string;
  error?: string;
}

export type TransactionStatus = 'pending' | 'confirmed' | 'failed';

export interface TransactionRecord {
  id: string;
  hash: string;
  from: string;
  to: string;
  value: string;
  status: TransactionStatus;
  timestamp: Date;
  chain: ChainType;
  type: 'transfer' | 'swap';
  metadata?: string;
}

export interface TransactionRequest {
  id: string;
  from: string;
  to: string;
  value: string;
  data?: string;
  gasLimit?: string;
  gasPrice?: string;
  chain: ChainType;
  type: 'transfer' | 'swap';
}

export interface TransactionResponse {
  id: string;
  hash: string;
  from: string;
  to: string;
  value: string;
  status: TransactionStatus;
  timestamp: Date;
  chain: ChainType;
  type: 'transfer' | 'swap';
  gasUsed: string;
  effectiveGasPrice: string;
  blockNumber?: number;
  blockHash?: string;
  error?: string;
}

export interface TokenTransferRequest {
  id: string;
  from: string;
  to: string;
  amount: string;
  token: string;
  chain: ChainType;
  type: 'transfer';
}

export interface SwapRequest {
  id: string;
  from: string;
  amountIn: string;
  tokenIn: string;
  tokenOut: string;
  chain: ChainType;
  type: 'swap';
}

export interface TransactionEngineConfig {
  confirmationBlocks: Record<ChainType, number>;
  minGasPrice: Record<ChainType, string>;
  maxGasPrice: Record<ChainType, string>;
  defaultGasLimit: Record<ChainType, string>;
} 