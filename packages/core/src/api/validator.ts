import { ChainType } from '../config/types';
import { Errors } from './errors';
import { chainAdapterFactory } from '../chain';
import {
  WalletCreateRequest,
  WalletImportRequest,
  TransactionRequest,
  TokenImportRequest,
  StrategyRequest
} from './types';

export class RequestValidator {
  // 验证链类型
  public static validateChain(chain: string): ChainType {
    if (!['solana', 'ethereum', 'base'].includes(chain)) {
      throw Errors.chainNotSupported(chain);
    }
    return chain as ChainType;
  }

  // 验证地址格式
  public static validateAddress(chain: ChainType, address: string): void {
    if (!chainAdapterFactory.validateAddress(chain, address)) {
      throw Errors.validation(`Invalid ${chain} address: ${address}`);
    }
  }

  // 验证私钥格式
  public static validatePrivateKey(chain: ChainType, privateKey: string): void {
    if (!chainAdapterFactory.validatePrivateKey(chain, privateKey)) {
      throw Errors.invalidPrivateKey();
    }
  }

  // 验证金额格式
  public static validateAmount(amount: string): void {
    if (!/^\d+(\.\d+)?$/.test(amount)) {
      throw Errors.validation('Invalid amount format');
    }
  }

  // 验证创建钱包请求
  public static validateWalletCreateRequest(request: WalletCreateRequest): void {
    this.validateChain(request.chain);
    
    if (request.mnemonic) {
      // 验证助记词格式（12或24个单词）
      const words = request.mnemonic.trim().split(/\s+/);
      if (![12, 24].includes(words.length)) {
        throw Errors.validation('Invalid mnemonic format');
      }
    }

    if (request.derivationPath) {
      // 验证推导路径格式
      if (!/^m(\/\d+'?)+$/.test(request.derivationPath)) {
        throw Errors.validation('Invalid derivation path');
      }
    }
  }

  // 验证导入钱包请求
  public static validateWalletImportRequest(request: WalletImportRequest): void {
    this.validateChain(request.chain);
    this.validatePrivateKey(request.chain, request.privateKey);
  }

  // 验证交易请求
  public static validateTransactionRequest(request: TransactionRequest): void {
    this.validateChain(request.chain);
    this.validateAddress(request.chain, request.from);
    this.validateAddress(request.chain, request.to);
    this.validateAmount(request.amount);

    if (request.token) {
      this.validateAddress(request.chain, request.token);
    }

    if (request.gasLimit) {
      if (!/^\d+$/.test(request.gasLimit)) {
        throw Errors.validation('Invalid gas limit');
      }
    }

    if (request.gasPrice) {
      if (!/^\d+(\.\d+)?$/.test(request.gasPrice)) {
        throw Errors.validation('Invalid gas price');
      }
    }

    if (request.nonce !== undefined) {
      if (!Number.isInteger(request.nonce) || request.nonce < 0) {
        throw Errors.validation('Invalid nonce');
      }
    }
  }

  // 验证Token导入请求
  public static validateTokenImportRequest(request: TokenImportRequest): void {
    this.validateChain(request.chain);
    this.validateAddress(request.chain, request.address);

    if (!request.symbol || !/^[A-Za-z0-9]+$/.test(request.symbol)) {
      throw Errors.validation('Invalid token symbol');
    }

    if (!Number.isInteger(request.decimals) || request.decimals < 0 || request.decimals > 18) {
      throw Errors.validation('Invalid decimals');
    }
  }

  // 验证策略生成请求
  public static validateStrategyRequest(request: StrategyRequest): void {
    if (!request.prompt.trim()) {
      throw Errors.validation('Empty strategy prompt');
    }

    if (request.constraints) {
      if (request.constraints.maxAmount) {
        this.validateAmount(request.constraints.maxAmount);
      }

      if (request.constraints.allowedChains) {
        request.constraints.allowedChains.forEach(chain => {
          this.validateChain(chain);
        });
      }

      if (request.constraints.allowedTokens) {
        request.constraints.allowedTokens.forEach(token => {
          if (!token || typeof token !== 'string') {
            throw Errors.validation('Invalid token address in constraints');
          }
        });
      }
    }
  }

  // 验证分页参数
  public static validatePagination(page?: number, limit?: number): void {
    if (page !== undefined && (!Number.isInteger(page) || page < 1)) {
      throw Errors.validation('Invalid page number');
    }

    if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > 100)) {
      throw Errors.validation('Invalid limit (must be between 1 and 100)');
    }
  }

  // 验证时间范围
  public static validateTimeRange(startTime?: Date, endTime?: Date): void {
    if (startTime && isNaN(startTime.getTime())) {
      throw Errors.validation('Invalid start time');
    }

    if (endTime && isNaN(endTime.getTime())) {
      throw Errors.validation('Invalid end time');
    }

    if (startTime && endTime && startTime > endTime) {
      throw Errors.validation('Start time must be before end time');
    }
  }
} 