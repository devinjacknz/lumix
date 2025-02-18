import { ethers } from 'ethers';
import { BaseChainAdapter } from './base';
import { BlockData, TransactionData, AccountData, TransactionConfig, ChainState, ChainCoreError } from '../types';

export class EVMChainAdapter extends BaseChainAdapter {
  private provider: ethers.providers.JsonRpcProvider;
  
  async connect(): Promise<void> {
    try {
      this.provider = new ethers.providers.JsonRpcProvider(this.config.rpcUrl);
      await this.provider.getNetwork();
      this.connected = true;
    } catch (error) {
      throw new ChainCoreError('Failed to connect to EVM chain', error as Error);
    }
  }

  async disconnect(): Promise<void> {
    this.provider = null;
    this.connected = false;
  }

  async getBlock(blockNumber: number): Promise<BlockData> {
    this.ensureConnected();
    
    try {
      const block = await this.provider.getBlock(blockNumber);
      return {
        number: block.number,
        hash: block.hash,
        timestamp: block.timestamp,
        transactions: block.transactions
      };
    } catch (error) {
      throw new ChainCoreError(`Failed to get block ${blockNumber}`, error as Error);
    }
  }

  async getTransaction(txHash: string): Promise<TransactionData> {
    this.ensureConnected();
    
    try {
      const tx = await this.provider.getTransaction(txHash);
      const receipt = await this.provider.getTransactionReceipt(txHash);
      
      if (!tx || !receipt) {
        throw new Error('Transaction not found');
      }

      return {
        hash: tx.hash,
        from: tx.from,
        to: tx.to,
        value: tx.value.toString(),
        blockNumber: tx.blockNumber,
        timestamp: (await this.provider.getBlock(tx.blockNumber)).timestamp,
        status: receipt.status === 1,
        gasUsed: receipt.gasUsed.toNumber(),
        effectiveGasPrice: receipt.effectiveGasPrice.toString()
      };
    } catch (error) {
      throw new ChainCoreError(`Failed to get transaction ${txHash}`, error as Error);
    }
  }

  async getAccount(address: string): Promise<AccountData> {
    this.ensureConnected();
    
    try {
      const [balance, code, nonce] = await Promise.all([
        this.provider.getBalance(address),
        this.provider.getCode(address),
        this.provider.getTransactionCount(address)
      ]);

      return {
        address,
        balance: balance.toString(),
        nonce,
        code: code !== '0x' ? code : undefined
      };
    } catch (error) {
      throw new ChainCoreError(`Failed to get account ${address}`, error as Error);
    }
  }

  async getGasPrice(): Promise<string> {
    this.ensureConnected();
    
    try {
      const gasPrice = await this.provider.getGasPrice();
      return gasPrice.toString();
    } catch (error) {
      throw new ChainCoreError('Failed to get gas price', error as Error);
    }
  }

  async sendTransaction(tx: TransactionConfig): Promise<string> {
    this.ensureConnected();
    this.validateTransaction(tx);
    
    try {
      const transaction = {
        to: tx.to,
        value: tx.value ? ethers.utils.parseEther(tx.value.toString()) : undefined,
        data: tx.data,
        nonce: tx.nonce,
        gasLimit: tx.gasLimit,
        gasPrice: tx.gasPrice ? ethers.utils.parseUnits(tx.gasPrice, 'gwei') : undefined,
        maxFeePerGas: tx.maxFeePerGas ? ethers.utils.parseUnits(tx.maxFeePerGas, 'gwei') : undefined,
        maxPriorityFeePerGas: tx.maxPriorityFeePerGas ? ethers.utils.parseUnits(tx.maxPriorityFeePerGas, 'gwei') : undefined
      };

      const response = await this.provider.sendTransaction(JSON.stringify(transaction));
      return response.hash;
    } catch (error) {
      throw new ChainCoreError('Failed to send transaction', error as Error);
    }
  }

  async estimateGas(tx: TransactionConfig): Promise<number> {
    this.ensureConnected();
    this.validateTransaction(tx);
    
    try {
      const gasEstimate = await this.provider.estimateGas({
        to: tx.to,
        value: tx.value ? ethers.utils.parseEther(tx.value.toString()) : undefined,
        data: tx.data
      });
      return gasEstimate.toNumber();
    } catch (error) {
      throw new ChainCoreError('Failed to estimate gas', error as Error);
    }
  }

  async getChainState(): Promise<ChainState> {
    this.ensureConnected();
    
    try {
      const [block, gasPrice, network] = await Promise.all([
        this.provider.getBlock('latest'),
        this.getGasPrice(),
        this.provider.getNetwork()
      ]);

      // 计算 TPS
      const prevBlock = await this.provider.getBlock(block.number - 1);
      const timeDiff = block.timestamp - prevBlock.timestamp;
      const tps = block.transactions.length / Math.max(timeDiff, 1);

      // 获取待处理交易数
      const pendingTxCount = (await this.provider.send('txpool_status', [])).pending || 0;

      return {
        latestBlock: {
          number: block.number,
          hash: block.hash,
          timestamp: block.timestamp,
          transactions: block.transactions
        },
        metrics: {
          blockTime: timeDiff,
          gasPrice,
          tps,
          pendingTxCount
        },
        timestamp: Date.now()
      };
    } catch (error) {
      throw new ChainCoreError('Failed to get chain state', error as Error);
    }
  }
} 