import { v4 as uuidv4 } from 'uuid';
import { logger } from '../monitoring';
import { messagingMiddleware } from '../messaging';
import { EventType } from '../messaging/types';
import { chainAdapterFactory } from '../chain';
import { keyManager } from '../security';
import { databaseManager } from '../database';
import {
  Transaction,
  TransactionRequest,
  TransactionStatus,
  TransactionType,
  TransactionResult,
  TransactionEstimate,
  TransactionEngineConfig,
  GasSettings
} from './types';
import { ErrorHandler, Errors } from './errors';

export class TransactionEngine {
  private static instance: TransactionEngine;
  private config: TransactionEngineConfig;
  private pendingTransactions: Map<string, Transaction> = new Map();
  private processingTransactions: Set<string> = new Set();

  private constructor(config: TransactionEngineConfig) {
    this.config = config;
    this.initializeEngine();
  }

  public static getInstance(config?: TransactionEngineConfig): TransactionEngine {
    if (!TransactionEngine.instance) {
      if (!config) {
        throw new Error('Configuration required for transaction engine initialization');
      }
      TransactionEngine.instance = new TransactionEngine(config);
    }
    return TransactionEngine.instance;
  }

  private initializeEngine(): void {
    logger.info('Transaction', 'Initializing transaction engine');
    this.startTransactionProcessor();
    this.startTransactionMonitor();
  }

  // 创建交易
  public async createTransaction(request: TransactionRequest): Promise<Transaction> {
    // 验证请求
    await this.validateRequest(request);

    // 创建交易记录
    const transaction: Transaction = {
      id: uuidv4(),
      request,
      status: TransactionStatus.CREATED,
      timestamp: new Date()
    };

    // 保存到数据库
    await databaseManager.getAdapter().saveTransaction({
      id: transaction.id,
      chainType: request.chain,
      hash: '',
      from: request.from,
      to: this.getTransactionTarget(request),
      value: this.getTransactionValue(request),
      timestamp: transaction.timestamp,
      status: 'pending'
    });

    // 添加到待处理队列
    this.pendingTransactions.set(transaction.id, transaction);

    // 发出事件
    await messagingMiddleware.emitEvent({
      type: EventType.TRANSACTION_CREATED,
      timestamp: new Date(),
      data: transaction
    });

    logger.info('Transaction', `Transaction created: ${transaction.id}`, {
      type: request.type,
      chain: request.chain
    });

    return transaction;
  }

  // 估算交易费用
  public async estimateTransaction(request: TransactionRequest): Promise<TransactionEstimate> {
    const adapter = chainAdapterFactory.getAdapter(request.chain);
    
    try {
      // 根据链类型和交易类型估算gas
      const gasEstimate = await adapter.estimateGas(request);
      
      // 获取当前gas价格
      const gasPrice = await adapter.getGasPrice();

      // 计算总费用
      const fee = this.calculateTransactionFee(gasEstimate, gasPrice);
      const total = this.calculateTotalCost(request, fee);

      return {
        gasLimit: gasEstimate,
        gasPrice,
        fee,
        total
      };
    } catch (error) {
      logger.error('Transaction', `Failed to estimate transaction`, {
        type: request.type,
        chain: request.chain,
        error
      });
      throw error;
    }
  }

  // 签名交易
  private async signTransaction(transaction: Transaction): Promise<void> {
    try {
      const adapter = chainAdapterFactory.getAdapter(transaction.request.chain);
      const privateKey = keyManager.getPrivateKey(transaction.request.chain);

      // 签名交易
      const signedTx = await adapter.signTransaction(transaction.request, privateKey);
      transaction.hash = signedTx.hash;
      transaction.status = TransactionStatus.SIGNED;

      // 发出事件
      await messagingMiddleware.emitEvent({
        type: EventType.TRANSACTION_SIGNED,
        timestamp: new Date(),
        data: transaction
      });

      logger.debug('Transaction', `Transaction signed: ${transaction.id}`, {
        hash: transaction.hash
      });
    } catch (error) {
      transaction.status = TransactionStatus.FAILED;
      const txError = ErrorHandler.handleTransactionError(error);
      transaction.error = txError.message;
      throw txError;
    }
  }

  // 发送交易
  private async sendTransaction(transaction: Transaction): Promise<void> {
    try {
      const adapter = chainAdapterFactory.getAdapter(transaction.request.chain);

      // 发送交易
      await adapter.sendTransaction(transaction.hash!);
      transaction.status = TransactionStatus.SUBMITTED;

      // 发出事件
      await messagingMiddleware.emitEvent({
        type: EventType.TRANSACTION_SENT,
        timestamp: new Date(),
        data: transaction
      });

      logger.info('Transaction', `Transaction sent: ${transaction.id}`, {
        hash: transaction.hash
      });
    } catch (error) {
      transaction.status = TransactionStatus.FAILED;
      const txError = ErrorHandler.handleTransactionError(error);
      transaction.error = txError.message;
      throw txError;
    }
  }

  // 确认交易
  private async confirmTransaction(transaction: Transaction): Promise<TransactionResult> {
    try {
      const adapter = chainAdapterFactory.getAdapter(transaction.request.chain);

      // 等待交易确认
      const receipt = await adapter.waitForTransaction(
        transaction.hash!,
        this.config.confirmationBlocks
      );

      // 更新交易状态
      transaction.status = TransactionStatus.CONFIRMED;
      transaction.confirmation = {
        blockNumber: receipt.blockNumber,
        blockHash: receipt.blockHash,
        timestamp: new Date(),
        gasUsed: receipt.gasUsed,
        effectiveGasPrice: receipt.effectiveGasPrice,
        logs: receipt.logs
      };

      // 发出事件
      await messagingMiddleware.emitEvent({
        type: EventType.TRANSACTION_CONFIRMED,
        timestamp: new Date(),
        data: transaction
      });

      logger.info('Transaction', `Transaction confirmed: ${transaction.id}`, {
        blockNumber: receipt.blockNumber
      });

      return {
        transaction,
        receipt,
        events: receipt.logs
      };
    } catch (error) {
      transaction.status = TransactionStatus.FAILED;
      const txError = ErrorHandler.handleTransactionError(error);
      transaction.error = txError.message;
      throw txError;
    }
  }

  // 启动交易处理器
  private async startTransactionProcessor(): Promise<void> {
    while (true) {
      try {
        // 检查是否有待处理的交易
        if (this.pendingTransactions.size === 0) {
          await new Promise(resolve => setTimeout(resolve, 1000));
          continue;
        }

        // 检查并发限制
        if (this.processingTransactions.size >= this.config.maxConcurrent) {
          await new Promise(resolve => setTimeout(resolve, 1000));
          continue;
        }

        // 获取下一个待处理交易
        const [id, transaction] = Array.from(this.pendingTransactions.entries())[0];
        this.pendingTransactions.delete(id);
        this.processingTransactions.add(id);

        // 处理交易
        this.processTransaction(transaction).catch(error => {
          logger.error('Transaction', `Transaction processing failed: ${error.message}`, {
            transactionId: id,
            error
          });
        });
      } catch (error) {
        logger.error('Transaction', `Transaction processor error: ${error.message}`, { error });
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }

  // 处理单个交易
  private async processTransaction(transaction: Transaction): Promise<void> {
    try {
      // 签名交易
      await this.signTransaction(transaction);

      // 发送交易
      await this.sendTransaction(transaction);

      // 确认交易
      await this.confirmTransaction(transaction);

      // 更新数据库
      await this.updateTransactionRecord(transaction);
    } catch (error) {
      const txError = ErrorHandler.handleTransactionError(error);
      
      logger.error('Transaction', `Transaction failed: ${txError.message}`, {
        transactionId: transaction.id,
        code: txError.code,
        chain: txError.chain,
        details: txError.details
      });

      // 发出失败事件
      await messagingMiddleware.emitEvent({
        type: EventType.TRANSACTION_FAILED,
        timestamp: new Date(),
        data: {
          transaction,
          error: txError
        }
      });

      // 如果错误可重试且未超过最大重试次数，则重新加入队列
      if (
        ErrorHandler.shouldRetry(txError) &&
        this.shouldRetryTransaction(transaction)
      ) {
        const retryCount = transaction.request.metadata?.retryCount || 0;
        const delay = ErrorHandler.getRetryDelay(txError, retryCount + 1);
        
        await new Promise(resolve => setTimeout(resolve, delay));
        await this.retryTransaction(transaction);
      }
    } finally {
      this.processingTransactions.delete(transaction.id);
    }
  }

  // 启动交易监控器
  private async startTransactionMonitor(): Promise<void> {
    while (true) {
      try {
        // 监控处理中的交易
        for (const id of this.processingTransactions) {
          const transaction = await this.getTransaction(id);
          if (!transaction) continue;

          // 检查超时
          if (this.isTransactionTimedOut(transaction)) {
            await this.handleTransactionTimeout(transaction);
          }

          // 检查是否需要重试
          if (this.shouldRetryTransaction(transaction)) {
            await this.retryTransaction(transaction);
          }
        }

        await new Promise(resolve => setTimeout(resolve, 5000));
      } catch (error) {
        logger.error('Transaction', `Transaction monitor error: ${error.message}`, { error });
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
  }

  // 辅助方法
  private async validateRequest(request: TransactionRequest): Promise<void> {
    try {
      // 验证链类型
      if (!chainAdapterFactory.getAdapter(request.chain)) {
        throw Errors.invalidChain(request.chain);
      }

      // 验证地址
      if (!chainAdapterFactory.validateAddress(request.chain, request.from)) {
        throw Errors.invalidAddress(request.from, request.chain);
      }

      // 验证gas设置
      if (request.gasSettings) {
        this.validateGasSettings(request.chain, request.gasSettings);
      }

      // 根据交易类型进行特定验证
      switch (request.type) {
        case TransactionType.TRANSFER:
        case TransactionType.TOKEN_TRANSFER:
          if (!chainAdapterFactory.validateAddress(request.chain, request.to)) {
            throw Errors.invalidAddress(request.to, request.chain);
          }
          break;
        case TransactionType.SWAP:
          // 验证Token地址
          if (!chainAdapterFactory.validateAddress(request.chain, request.tokenIn)) {
            throw Errors.invalidToken(request.tokenIn, request.chain);
          }
          if (!chainAdapterFactory.validateAddress(request.chain, request.tokenOut)) {
            throw Errors.invalidToken(request.tokenOut, request.chain);
          }
          break;
      }
    } catch (error) {
      if (error instanceof TransactionError) {
        throw error;
      }
      throw Errors.validation(error.message, {
        chain: request.chain,
        type: request.type,
        details: error
      });
    }
  }

  private validateGasSettings(chain: string, settings: GasSettings): void {
    if (settings.gasLimit) {
      const limit = BigInt(settings.gasLimit);
      if (limit <= BigInt(0)) {
        throw new Error('Invalid gas limit');
      }
    }

    if (settings.maxFeePerGas) {
      const maxFee = BigInt(settings.maxFeePerGas);
      if (maxFee <= BigInt(0)) {
        throw new Error('Invalid max fee per gas');
      }
    }

    // 添加其他gas设置验证
  }

  private getTransactionTarget(request: TransactionRequest): string {
    switch (request.type) {
      case TransactionType.TRANSFER:
      case TransactionType.TOKEN_TRANSFER:
        return request.to;
      case TransactionType.SWAP:
        return request.tokenOut;
      case TransactionType.APPROVE:
        return request.spender;
      case TransactionType.CONTRACT_CALL:
        return request.contract;
      default:
        return '';
    }
  }

  private getTransactionValue(request: TransactionRequest): string {
    switch (request.type) {
      case TransactionType.TRANSFER:
        return request.amount;
      case TransactionType.TOKEN_TRANSFER:
      case TransactionType.SWAP:
        return request.amountIn;
      case TransactionType.APPROVE:
        return request.amount;
      case TransactionType.CONTRACT_CALL:
        return request.value || '0';
      default:
        return '0';
    }
  }

  private calculateTransactionFee(gasLimit: string, gasPrice: string): string {
    return (BigInt(gasLimit) * BigInt(gasPrice)).toString();
  }

  private calculateTotalCost(request: TransactionRequest, fee: string): string {
    const value = this.getTransactionValue(request);
    return (BigInt(value) + BigInt(fee)).toString();
  }

  private async updateTransactionRecord(transaction: Transaction): Promise<void> {
    await databaseManager.getAdapter().saveTransaction({
      id: transaction.id,
      chainType: transaction.request.chain,
      hash: transaction.hash || '',
      from: transaction.request.from,
      to: this.getTransactionTarget(transaction.request),
      value: this.getTransactionValue(transaction.request),
      timestamp: transaction.timestamp,
      status: transaction.status,
      gasUsed: transaction.confirmation?.gasUsed,
      gasPrice: transaction.confirmation?.effectiveGasPrice,
      error: transaction.error
    });
  }

  // 公共方法
  public async getTransaction(id: string): Promise<Transaction | null> {
    // 首先检查内存中的交易
    if (this.pendingTransactions.has(id)) {
      return this.pendingTransactions.get(id)!;
    }
    
    // 从数据库加载交易
    const record = await databaseManager.getAdapter().getTransaction(id);
    if (!record) return null;

    // 转换为Transaction对象
    return {
      id: record.id,
      hash: record.hash,
      request: JSON.parse(record.metadata?.request || '{}'),
      status: record.status as TransactionStatus,
      timestamp: record.timestamp,
      error: record.error
    };
  }

  private isTransactionTimedOut(transaction: Transaction): boolean {
    const elapsed = Date.now() - transaction.timestamp.getTime();
    return elapsed > this.config.timeout;
  }

  private async handleTransactionTimeout(transaction: Transaction): Promise<void> {
    transaction.status = TransactionStatus.FAILED;
    transaction.error = 'Transaction timed out';
    await this.updateTransactionRecord(transaction);
    this.processingTransactions.delete(transaction.id);
  }

  private shouldRetryTransaction(transaction: Transaction): boolean {
    if (transaction.status !== TransactionStatus.FAILED) return false;
    const retryCount = transaction.request.metadata?.retryCount || 0;
    return retryCount < this.config.maxRetries;
  }

  private async retryTransaction(transaction: Transaction): Promise<void> {
    // 增加重试计数
    transaction.request.metadata = {
      ...transaction.request.metadata,
      retryCount: (transaction.request.metadata?.retryCount || 0) + 1
    };

    // 重置状态
    transaction.status = TransactionStatus.CREATED;
    transaction.error = undefined;
    transaction.hash = undefined;
    transaction.confirmation = undefined;

    // 重新添加到待处理队列
    this.pendingTransactions.set(transaction.id, transaction);
    this.processingTransactions.delete(transaction.id);
  }
} 