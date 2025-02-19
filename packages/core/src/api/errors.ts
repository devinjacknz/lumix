import { ApiResponse } from './types';
import { logger } from '../monitoring';

export enum ErrorCode {
  // 通用错误 (1xxx)
  UNKNOWN_ERROR = '1000',
  INVALID_REQUEST = '1001',
  UNAUTHORIZED = '1002',
  FORBIDDEN = '1003',
  NOT_FOUND = '1004',
  VALIDATION_ERROR = '1005',
  RATE_LIMIT_EXCEEDED = '1006',

  // 钱包相关错误 (2xxx)
  WALLET_NOT_FOUND = '2000',
  INVALID_PRIVATE_KEY = '2001',
  INVALID_MNEMONIC = '2002',
  INSUFFICIENT_BALANCE = '2003',
  WALLET_EXISTS = '2004',

  // 交易相关错误 (3xxx)
  TRANSACTION_FAILED = '3000',
  INVALID_TRANSACTION = '3001',
  GAS_ESTIMATION_FAILED = '3002',
  NONCE_TOO_LOW = '3003',
  PENDING_TRANSACTION = '3004',

  // Token相关错误 (4xxx)
  TOKEN_NOT_FOUND = '4000',
  INVALID_TOKEN_ADDRESS = '4001',
  TOKEN_ALREADY_EXISTS = '4002',
  INSUFFICIENT_TOKEN_BALANCE = '4003',

  // 链相关错误 (5xxx)
  CHAIN_NOT_SUPPORTED = '5000',
  CHAIN_NOT_AVAILABLE = '5001',
  RPC_ERROR = '5002',
  NETWORK_ERROR = '5003',

  // AI/策略相关错误 (6xxx)
  STRATEGY_GENERATION_FAILED = '6000',
  INVALID_STRATEGY = '6001',
  STRATEGY_EXECUTION_FAILED = '6002',
  CONSTRAINT_VIOLATION = '6003',

  // 系统错误 (9xxx)
  SYSTEM_ERROR = '9000',
  DATABASE_ERROR = '9001',
  CONFIG_ERROR = '9002',
  MAINTENANCE_MODE = '9003'
}

export class ApiError extends Error {
  public readonly code: string;
  public readonly details?: any;

  constructor(code: ErrorCode, message: string, details?: any) {
    super(message);
    this.code = code;
    this.details = details;
    this.name = 'ApiError';
  }

  public toResponse(): ApiResponse {
    return {
      success: false,
      error: {
        code: this.code,
        message: this.message,
        details: this.details
      }
    };
  }
}

export function handleError(error: any): ApiResponse {
  if (error instanceof ApiError) {
    logger.error('API', error.message, {
      code: error.code,
      details: error.details
    });
    return error.toResponse();
  }

  // 处理其他类型的错误
  logger.error('API', 'Unexpected error', { error });
  return {
    success: false,
    error: {
      code: ErrorCode.UNKNOWN_ERROR,
      message: 'An unexpected error occurred',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    }
  };
}

export function createSuccessResponse<T>(data: T): ApiResponse<T> {
  return {
    success: true,
    data
  };
}

// 错误工厂函数
export const Errors = {
  invalidRequest: (message: string, details?: any) => 
    new ApiError(ErrorCode.INVALID_REQUEST, message, details),

  unauthorized: (message = 'Unauthorized') => 
    new ApiError(ErrorCode.UNAUTHORIZED, message),

  forbidden: (message = 'Forbidden') => 
    new ApiError(ErrorCode.FORBIDDEN, message),

  notFound: (resource: string) => 
    new ApiError(ErrorCode.NOT_FOUND, `${resource} not found`),

  validation: (message: string, details?: any) => 
    new ApiError(ErrorCode.VALIDATION_ERROR, message, details),

  walletNotFound: (chain: string) => 
    new ApiError(ErrorCode.WALLET_NOT_FOUND, `Wallet not found for chain: ${chain}`),

  invalidPrivateKey: (details?: any) => 
    new ApiError(ErrorCode.INVALID_PRIVATE_KEY, 'Invalid private key', details),

  insufficientBalance: (details?: any) => 
    new ApiError(ErrorCode.INSUFFICIENT_BALANCE, 'Insufficient balance', details),

  transactionFailed: (message: string, details?: any) => 
    new ApiError(ErrorCode.TRANSACTION_FAILED, message, details),

  chainNotSupported: (chain: string) => 
    new ApiError(ErrorCode.CHAIN_NOT_SUPPORTED, `Chain not supported: ${chain}`),

  rpcError: (message: string, details?: any) => 
    new ApiError(ErrorCode.RPC_ERROR, message, details),

  strategyError: (message: string, details?: any) => 
    new ApiError(ErrorCode.STRATEGY_GENERATION_FAILED, message, details),

  systemError: (message: string, details?: any) => 
    new ApiError(ErrorCode.SYSTEM_ERROR, message, details)
}; 