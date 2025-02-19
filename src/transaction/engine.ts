import { ChainAdapter, ChainGasEstimate, ChainGasPrice, ChainTransaction, ChainTransactionReceipt, ChainType } from '../chain/types';
import { v4 as uuid } from 'uuid';
import { logger } from '../utils/logger';
import { messagingMiddleware } from '../messaging/middleware';
import { chainAdapterFactory } from '../chain/adapter-factory';
import { keyManager } from '../key/manager';
import { databaseManager, DatabaseAdapter } from '../database/manager';
import {
  TransactionType,
  TransactionStatus,
  TransactionRequest,
  TransactionBase,
  TransactionResponse,
  TransactionRecord,
  TransactionConfirmation,
  TransactionError,
  TransactionEngineConfig
} from './types';

const RETRY_DELAY = 1000; // 1 second
const MAX_RETRY_BACKOFF = 30000; // 30 seconds

export class TransactionEngine {
  private static instance: TransactionEngine;
  private processingTransactions: Map<string, boolean>;
  private adapter: ChainAdapter;
  private db: DatabaseAdapter;
  private config: TransactionEngineConfig;
  private retryAttempts: Map<string, number>;

  private constructor(config: TransactionEngineConfig, adapter: ChainAdapter, db: DatabaseAdapter) {
    this.config = config;
    this.processingTransactions = new Map();
    this.retryAttempts = new Map();
    this.adapter = adapter;
    this.db = db;
  }

  static getInstance(config: TransactionEngineConfig, adapter: ChainAdapter, db: DatabaseAdapter): TransactionEngine {
    if (!TransactionEngine.instance) {
      TransactionEngine.instance = new TransactionEngine(config, adapter, db);
    }
    return TransactionEngine.instance;
  }

  async processTransaction(request: TransactionRequest): Promise<TransactionResponse> {
    try {
      // Validate request
      this.validateRequest(request);

      // Generate transaction ID if not provided
      const txId = request.id || uuid();

      // Convert request to ChainTransaction
      const chainTx: ChainTransaction = await this.prepareChainTransaction(request);

      // Check concurrent transactions limit
      if (this.processingTransactions.size >= this.config.maxConcurrent) {
        throw new Error('Maximum concurrent transactions limit reached');
      }

      // Save pending transaction
      const pendingTx: TransactionBase = {
        id: txId,
        hash: undefined,
        from: request.from,
        to: this.getTransactionTarget(request),
        value: this.getTransactionValue(request),
        chain: request.chain,
        type: request.type,
        status: 'pending',
        timestamp: new Date()
      };

      await this.saveTransaction(pendingTx);

      // Send transaction with retry logic
      const txHash = await this.sendTransactionWithRetry(chainTx, txId);
      pendingTx.hash = txHash;

      // Update transaction with hash
      await this.saveTransaction(pendingTx);

      // Emit pending status
      await this.emitTransactionStatus(pendingTx);

      // Start monitoring
      this.monitorTransaction(pendingTx);

      return {
        id: pendingTx.id,
        hash: pendingTx.hash,
        status: pendingTx.status,
        timestamp: pendingTx.timestamp
      };
    } catch (error) {
      const txError = this.createTransactionError(error);
      logger.error('Transaction', `Transaction processor error: ${txError.message}`, { error: txError });
      throw txError;
    }
  }

  private async prepareChainTransaction(request: TransactionRequest): Promise<ChainTransaction> {
    // Estimate gas
    const chainTx: ChainTransaction = {
      from: request.from,
      to: this.getTransactionTarget(request),
      value: this.getTransactionValue(request),
      data: request.data,
      nonce: request.nonce,
      gasLimit: request.gasLimit || this.config.defaultGasLimit[request.chain],
      gasPrice: request.gasPrice,
      maxFeePerGas: request.maxFeePerGas,
      maxPriorityFeePerGas: request.maxPriorityFeePerGas,
      chain: request.chain
    };

    const gasEstimate = await this.estimateGasWithRetry(chainTx);
    const gasPrice = await this.getGasPriceWithRetry(request.chain);

    // Validate gas price against config limits
    this.validateGasPrice(gasPrice, request.chain);

    // Update gas settings
    chainTx.gasLimit = gasEstimate.gasLimit.toString();
    chainTx.gasPrice = gasPrice.gasPrice.toString();
    if (gasPrice.maxFeePerGas) {
      chainTx.maxFeePerGas = gasPrice.maxFeePerGas.toString();
    }
    if (gasPrice.maxPriorityFeePerGas) {
      chainTx.maxPriorityFeePerGas = gasPrice.maxPriorityFeePerGas.toString();
    }

    return chainTx;
  }

  private async sendTransactionWithRetry(tx: ChainTransaction, txId: string): Promise<string> {
    let attempt = 0;
    while (attempt < this.config.maxRetries) {
      try {
        const preparedTx = await this.adapter.prepareTransaction(tx);
        const signedTx = await this.adapter.signTransaction(preparedTx, keyManager.getPrivateKey(tx.chain));
        return await this.adapter.sendTransaction(signedTx);
      } catch (error) {
        attempt++;
        if (attempt >= this.config.maxRetries) {
          throw error;
        }
        
        const delay = Math.min(RETRY_DELAY * Math.pow(2, attempt), MAX_RETRY_BACKOFF);
        logger.warn('Transaction', `Retry attempt ${attempt} for transaction ${txId}`, { error });
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    throw new Error('Max retry attempts reached');
  }

  private async estimateGasWithRetry(tx: ChainTransaction): Promise<ChainGasEstimate> {
    let attempt = 0;
    while (attempt < this.config.maxRetries) {
      try {
        return await this.adapter.estimateGas(tx);
      } catch (error) {
        attempt++;
        if (attempt >= this.config.maxRetries) {
          throw error;
        }
        
        const delay = Math.min(RETRY_DELAY * Math.pow(2, attempt), MAX_RETRY_BACKOFF);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    throw new Error('Failed to estimate gas after max retries');
  }

  private async getGasPriceWithRetry(chain: ChainType): Promise<ChainGasPrice> {
    let attempt = 0;
    while (attempt < this.config.maxRetries) {
      try {
        return await this.adapter.getGasPrice(chain);
      } catch (error) {
        attempt++;
        if (attempt >= this.config.maxRetries) {
          throw error;
        }
        
        const delay = Math.min(RETRY_DELAY * Math.pow(2, attempt), MAX_RETRY_BACKOFF);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    throw new Error('Failed to get gas price after max retries');
  }

  private async emitTransactionStatus(tx: TransactionBase): Promise<void> {
    await messagingMiddleware.emit('transaction', {
      type: 'transaction',
      sender: 'transaction-engine',
      recipient: 'all',
      content: JSON.stringify(tx)
    });
  }

  private createTransactionError(error: unknown): TransactionError {
    return {
      code: error instanceof Error ? error.name : 'UNKNOWN_ERROR',
      message: error instanceof Error ? error.message : 'An unknown error occurred',
      details: error instanceof Error ? { stack: error.stack } : undefined
    };
  }

  private validateRequest(request: TransactionRequest): void {
    // Validate chain
    if (!chainAdapterFactory.hasAdapter(request.chain)) {
      throw new Error(`Unsupported chain: ${request.chain}`);
    }

    // Validate addresses
    if (!this.adapter.validateAddress(request.from)) {
      throw new Error(`Invalid from address: ${request.from}`);
    }

    const to = this.getTransactionTarget(request);
    if (to && !this.adapter.validateAddress(to)) {
      throw new Error(`Invalid to address: ${to}`);
    }

    // Validate value
    const value = this.getTransactionValue(request);
    if (BigInt(value) < BigInt(0)) {
      throw new Error('Transaction value cannot be negative');
    }
  }

  private validateGasPrice(gasPrice: ChainGasPrice, chain: ChainType): void {
    const minGasPrice = BigInt(this.config.minGasPrice[chain]);
    const maxGasPrice = BigInt(this.config.maxGasPrice[chain]);

    if (gasPrice.gasPrice < minGasPrice) {
      throw new Error(`Gas price too low. Minimum: ${minGasPrice.toString()}`);
    }
    if (gasPrice.gasPrice > maxGasPrice) {
      throw new Error(`Gas price too high. Maximum: ${maxGasPrice.toString()}`);
    }
  }

  private async monitorTransaction(transaction: TransactionBase): Promise<void> {
    if (this.processingTransactions.get(transaction.id)) {
      return;
    }

    this.processingTransactions.set(transaction.id, true);
    const startTime = Date.now();

    try {
      while (true) {
        // Check timeout
        if (Date.now() - startTime > this.config.timeout) {
          throw new Error('Transaction monitoring timeout');
        }

        const receipt = await this.adapter.getTransactionReceipt(transaction.hash || '');
        if (receipt) {
          const confirmation: TransactionConfirmation = {
            blockNumber: receipt.blockNumber,
            blockHash: receipt.blockHash,
            timestamp: new Date(),
            gasUsed: receipt.gasUsed.toString(),
            effectiveGasPrice: receipt.effectiveGasPrice.toString(),
            logs: receipt.logs
          };

          const updatedTx: TransactionBase = {
            ...transaction,
            status: receipt.status ? 'confirmed' : 'failed',
            gasUsed: receipt.gasUsed.toString(),
            effectiveGasPrice: receipt.effectiveGasPrice.toString(),
            blockNumber: receipt.blockNumber,
            blockHash: receipt.blockHash
          };

          await this.saveTransaction(updatedTx);

          // Emit confirmed/failed status
          await messagingMiddleware.emit('transaction', {
            type: 'transaction',
            sender: 'transaction-engine',
            recipient: 'all',
            content: JSON.stringify({ ...updatedTx, confirmation })
          });

          break;
        }

        // Wait before next check
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } catch (error) {
      const txError: TransactionError = {
        code: error instanceof Error ? error.name : 'UNKNOWN_ERROR',
        message: error instanceof Error ? error.message : 'An unknown error occurred',
        details: error instanceof Error ? { stack: error.stack } : undefined
      };

      logger.error('Transaction', `Transaction monitor error: ${txError.message}`, { error: txError });
    } finally {
      this.processingTransactions.delete(transaction.id);
    }
  }

  private calculateTransactionFee(gasLimit: string, gasPrice: string): string {
    return (BigInt(gasLimit) * BigInt(gasPrice)).toString();
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
        return request.to;
      default:
        return '';
    }
  }

  private getTransactionValue(request: TransactionRequest): string {
    switch (request.type) {
      case TransactionType.TRANSFER:
        return request.amount;
      case TransactionType.TOKEN_TRANSFER:
        return request.amount;
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

  private async saveTransaction(transaction: TransactionBase): Promise<void> {
    const record: TransactionRecord = {
      id: transaction.id,
      hash: transaction.hash || '',
      from: transaction.from,
      to: transaction.to,
      value: transaction.value,
      chain: transaction.chain,
      type: transaction.type,
      status: transaction.status,
      timestamp: transaction.timestamp,
      gasUsed: transaction.gasUsed,
      effectiveGasPrice: transaction.effectiveGasPrice,
      blockNumber: transaction.blockNumber,
      blockHash: transaction.blockHash,
      error: transaction.error,
      metadata: {
        request: JSON.stringify(transaction)
      }
    };

    await this.db.saveTransaction(record);
  }
}