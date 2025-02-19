import { ChainType, TransactionType } from './types';
import { logger } from '../monitoring';

// 交易错误代码
export enum TransactionErrorCode {
  // 通用错误 (1xxx)
  UNKNOWN_ERROR = '1000',
  VALIDATION_ERROR = '1001',
  TIMEOUT_ERROR = '1002',
  NETWORK_ERROR = '1003',
  
  // 初始化错误 (2xxx)
  INITIALIZATION_ERROR = '2000',
  CONFIG_ERROR = '2001',
  ADAPTER_ERROR = '2002',
  
  // 签名错误 (3xxx)
  SIGNING_ERROR = '3000',
  INVALID_PRIVATE_KEY = '3001',
  KEY_NOT_FOUND = '3002',
  
  // 发送错误 (4xxx)
  SENDING_ERROR = '4000',
  INSUFFICIENT_FUNDS = '4001',
  NONCE_TOO_LOW = '4002',
  GAS_TOO_LOW = '4003',
  GAS_TOO_HIGH = '4004',
  
  // 确认错误 (5xxx)
  CONFIRMATION_ERROR = '5000',
  TRANSACTION_DROPPED = '5001',
  TRANSACTION_FAILED = '5002',
  REVERT_ERROR = '5003',
  
  // 参数错误 (6xxx)
  INVALID_AMOUNT = '6000',
  INVALID_ADDRESS = '6001',
  INVALID_TOKEN = '6002',
  INVALID_CHAIN = '6003',
  
  // 限制错误 (7xxx)
  RATE_LIMIT_EXCEEDED = '7000',
  MAX_RETRIES_EXCEEDED = '7001',
  QUEUE_FULL = '7002',
  VALUE_TOO_HIGH = '7003'
}

// 交易错误基类
export class TransactionError extends Error {
  public readonly code: string;
  public readonly chain?: ChainType;
  public readonly type?: TransactionType;
  public readonly details?: Record<string, any>;

  constructor(
    code: TransactionErrorCode,
    message: string,
    options?: {
      chain?: ChainType;
      type?: TransactionType;
      details?: Record<string, any>;
    }
  ) {
    super(message);
    this.name = 'TransactionError';
    this.code = code;
    this.chain = options?.chain;
    this.type = options?.type;
    this.details = options?.details;

    // 记录错误
    logger.error('Transaction', message, {
      code,
      chain: options?.chain,
      type: options?.type,
      details: options?.details
    });
  }
}

// 验证错误
export class ValidationError extends TransactionError {
  constructor(
    message: string,
    options?: {
      chain?: ChainType;
      type?: TransactionType;
      details?: Record<string, any>;
    }
  ) {
    super(TransactionErrorCode.VALIDATION_ERROR, message, options);
    this.name = 'ValidationError';
  }
}

// 网络错误
export class NetworkError extends TransactionError {
  constructor(
    message: string,
    options?: {
      chain?: ChainType;
      type?: TransactionType;
      details?: Record<string, any>;
    }
  ) {
    super(TransactionErrorCode.NETWORK_ERROR, message, options);
    this.name = 'NetworkError';
  }
}

// 签名错误
export class SigningError extends TransactionError {
  constructor(
    message: string,
    options?: {
      chain?: ChainType;
      type?: TransactionType;
      details?: Record<string, any>;
    }
  ) {
    super(TransactionErrorCode.SIGNING_ERROR, message, options);
    this.name = 'SigningError';
  }
}

// 发送错误
export class SendingError extends TransactionError {
  constructor(
    message: string,
    options?: {
      chain?: ChainType;
      type?: TransactionType;
      details?: Record<string, any>;
    }
  ) {
    super(TransactionErrorCode.SENDING_ERROR, message, options);
    this.name = 'SendingError';
  }
}

// 确认错误
export class ConfirmationError extends TransactionError {
  constructor(
    message: string,
    options?: {
      chain?: ChainType;
      type?: TransactionType;
      details?: Record<string, any>;
    }
  ) {
    super(TransactionErrorCode.CONFIRMATION_ERROR, message, options);
    this.name = 'ConfirmationError';
  }
}

// 错误工厂
export const Errors = {
  validation: (
    message: string,
    options?: {
      chain?: ChainType;
      type?: TransactionType;
      details?: Record<string, any>;
    }
  ) => new ValidationError(message, options),

  network: (
    message: string,
    options?: {
      chain?: ChainType;
      type?: TransactionType;
      details?: Record<string, any>;
    }
  ) => new NetworkError(message, options),

  signing: (
    message: string,
    options?: {
      chain?: ChainType;
      type?: TransactionType;
      details?: Record<string, any>;
    }
  ) => new SigningError(message, options),

  sending: (
    message: string,
    options?: {
      chain?: ChainType;
      type?: TransactionType;
      details?: Record<string, any>;
    }
  ) => new SendingError(message, options),

  confirmation: (
    message: string,
    options?: {
      chain?: ChainType;
      type?: TransactionType;
      details?: Record<string, any>;
    }
  ) => new ConfirmationError(message, options),

  insufficientFunds: (
    chain: ChainType,
    details?: Record<string, any>
  ) => new TransactionError(
    TransactionErrorCode.INSUFFICIENT_FUNDS,
    `Insufficient funds on chain: ${chain}`,
    { chain, details }
  ),

  nonceTooLow: (
    chain: ChainType,
    details?: Record<string, any>
  ) => new TransactionError(
    TransactionErrorCode.NONCE_TOO_LOW,
    `Nonce too low on chain: ${chain}`,
    { chain, details }
  ),

  gasTooLow: (
    chain: ChainType,
    details?: Record<string, any>
  ) => new TransactionError(
    TransactionErrorCode.GAS_TOO_LOW,
    `Gas price too low on chain: ${chain}`,
    { chain, details }
  ),

  gasTooHigh: (
    chain: ChainType,
    details?: Record<string, any>
  ) => new TransactionError(
    TransactionErrorCode.GAS_TOO_HIGH,
    `Gas price too high on chain: ${chain}`,
    { chain, details }
  ),

  transactionDropped: (
    chain: ChainType,
    details?: Record<string, any>
  ) => new TransactionError(
    TransactionErrorCode.TRANSACTION_DROPPED,
    `Transaction dropped on chain: ${chain}`,
    { chain, details }
  ),

  transactionFailed: (
    chain: ChainType,
    details?: Record<string, any>
  ) => new TransactionError(
    TransactionErrorCode.TRANSACTION_FAILED,
    `Transaction failed on chain: ${chain}`,
    { chain, details }
  ),

  revertError: (
    chain: ChainType,
    details?: Record<string, any>
  ) => new TransactionError(
    TransactionErrorCode.REVERT_ERROR,
    `Transaction reverted on chain: ${chain}`,
    { chain, details }
  ),

  invalidAmount: (
    amount: string,
    chain?: ChainType
  ) => new TransactionError(
    TransactionErrorCode.INVALID_AMOUNT,
    `Invalid amount: ${amount}`,
    { chain }
  ),

  invalidAddress: (
    address: string,
    chain?: ChainType
  ) => new TransactionError(
    TransactionErrorCode.INVALID_ADDRESS,
    `Invalid address: ${address}`,
    { chain }
  ),

  invalidToken: (
    token: string,
    chain?: ChainType
  ) => new TransactionError(
    TransactionErrorCode.INVALID_TOKEN,
    `Invalid token: ${token}`,
    { chain }
  ),

  invalidChain: (
    chain: string
  ) => new TransactionError(
    TransactionErrorCode.INVALID_CHAIN,
    `Invalid chain: ${chain}`
  ),

  rateLimitExceeded: (
    chain: ChainType,
    details?: Record<string, any>
  ) => new TransactionError(
    TransactionErrorCode.RATE_LIMIT_EXCEEDED,
    `Rate limit exceeded on chain: ${chain}`,
    { chain, details }
  ),

  maxRetriesExceeded: (
    chain: ChainType,
    details?: Record<string, any>
  ) => new TransactionError(
    TransactionErrorCode.MAX_RETRIES_EXCEEDED,
    `Max retries exceeded on chain: ${chain}`,
    { chain, details }
  ),

  queueFull: () => new TransactionError(
    TransactionErrorCode.QUEUE_FULL,
    'Transaction queue is full'
  ),

  valueTooHigh: (
    value: string,
    chain?: ChainType
  ) => new TransactionError(
    TransactionErrorCode.VALUE_TOO_HIGH,
    `Transaction value too high: ${value}`,
    { chain }
  )
};

// 错误处理工具
export const ErrorHandler = {
  // 处理交易错误
  handleTransactionError: (error: any): TransactionError => {
    if (error instanceof TransactionError) {
      return error;
    }

    // 处理特定链的错误
    if (error.code) {
      switch (error.code) {
        case 'INSUFFICIENT_FUNDS':
          return Errors.insufficientFunds(error.chain, error);
        case 'NONCE_TOO_LOW':
          return Errors.nonceTooLow(error.chain, error);
        case 'GAS_TOO_LOW':
          return Errors.gasTooLow(error.chain, error);
        case 'GAS_TOO_HIGH':
          return Errors.gasTooHigh(error.chain, error);
        default:
          break;
      }
    }

    // 处理网络错误
    if (error.message?.includes('network') || error.message?.includes('timeout')) {
      return Errors.network(error.message, { details: error });
    }

    // 处理签名错误
    if (error.message?.includes('signing') || error.message?.includes('key')) {
      return Errors.signing(error.message, { details: error });
    }

    // 处理确认错误
    if (error.message?.includes('confirmation') || error.message?.includes('receipt')) {
      return Errors.confirmation(error.message, { details: error });
    }

    // 默认返回未知错误
    return new TransactionError(
      TransactionErrorCode.UNKNOWN_ERROR,
      error.message || 'Unknown transaction error',
      { details: error }
    );
  },

  // 是否应该重试错误
  shouldRetry: (error: TransactionError): boolean => {
    const retryableCodes = [
      TransactionErrorCode.NETWORK_ERROR,
      TransactionErrorCode.NONCE_TOO_LOW,
      TransactionErrorCode.GAS_TOO_LOW,
      TransactionErrorCode.CONFIRMATION_ERROR,
      TransactionErrorCode.TRANSACTION_DROPPED
    ];

    return retryableCodes.includes(error.code as TransactionErrorCode);
  },

  // 获取重试延迟（毫秒）
  getRetryDelay: (error: TransactionError, attempt: number): number => {
    const baseDelay = 1000; // 1秒
    const maxDelay = 30000; // 30秒

    let delay = baseDelay * Math.pow(2, attempt - 1);
    delay = Math.min(delay, maxDelay);

    // 对于某些错误类型增加额外延迟
    if (error.code === TransactionErrorCode.RATE_LIMIT_EXCEEDED) {
      delay += 5000; // 额外5秒
    }

    return delay;
  }
}; 