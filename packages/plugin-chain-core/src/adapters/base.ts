import { ChainAdapter, ChainConfig, ChainState, BlockData, TransactionData, AccountData, TransactionConfig, ChainCoreError } from '../types';

export abstract class BaseChainAdapter implements ChainAdapter {
  protected connected: boolean = false;

  constructor(
    public readonly config: ChainConfig
  ) {}

  abstract connect(): Promise<void>;
  abstract disconnect(): Promise<void>;
  
  abstract getBlock(blockNumber: number): Promise<BlockData>;
  abstract getTransaction(txHash: string): Promise<TransactionData>;
  abstract getAccount(address: string): Promise<AccountData>;
  abstract getGasPrice(): Promise<string>;
  
  abstract sendTransaction(tx: TransactionConfig): Promise<string>;
  abstract estimateGas(tx: TransactionConfig): Promise<number>;
  
  abstract getChainState(): Promise<ChainState>;

  protected ensureConnected() {
    if (!this.connected) {
      throw new ChainCoreError('Chain adapter not connected');
    }
  }

  protected validateAddress(address: string): boolean {
    // 基础地址格式验证
    return address && typeof address === 'string' && address.length > 0;
  }

  protected validateTransaction(tx: TransactionConfig): void {
    if (!tx.to || !this.validateAddress(tx.to)) {
      throw new ChainCoreError('Invalid recipient address');
    }

    if (tx.value) {
      const value = Number(tx.value);
      if (isNaN(value) || value < 0) {
        throw new ChainCoreError('Invalid transaction value');
      }
    }

    if (tx.nonce !== undefined && (tx.nonce < 0 || !Number.isInteger(tx.nonce))) {
      throw new ChainCoreError('Invalid nonce');
    }

    if (tx.gasLimit !== undefined && (tx.gasLimit < 0 || !Number.isInteger(tx.gasLimit))) {
      throw new ChainCoreError('Invalid gas limit');
    }
  }

  protected async retryOperation<T>(
    operation: () => Promise<T>,
    retries: number = 3,
    delay: number = 1000
  ): Promise<T> {
    let lastError: Error;
    
    for (let i = 0; i < retries; i++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        if (i < retries - 1) {
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    throw new ChainCoreError('Operation failed after retries', lastError);
  }
} 