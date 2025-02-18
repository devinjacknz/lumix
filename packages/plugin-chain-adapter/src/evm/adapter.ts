import { ethers } from 'ethers';
import {
  ChainAdapter,
  ChainConfig,
  ChainState,
  TransactionConfig,
  TransactionReceipt,
  BlockInfo,
  AccountInfo,
  ChainAdapterError
} from '../types';

export class EVMChainAdapter implements ChainAdapter {
  private config: Required<ChainConfig>;
  private provider: ethers.JsonRpcProvider;
  private initialized: boolean = false;

  constructor(config: ChainConfig) {
    this.config = {
      id: config.id,
      name: config.name,
      type: config.type,
      nativeCurrency: config.nativeCurrency,
      rpcUrls: config.rpcUrls,
      blockExplorerUrls: config.blockExplorerUrls || [],
      iconUrl: config.iconUrl,
      testnet: config.testnet || false,
      blockTime: config.blockTime || 15000, // 15秒
      confirmations: config.confirmations || 1,
      maxBlockRange: config.maxBlockRange || 1000,
      batchSize: config.batchSize || 100,
      retryAttempts: config.retryAttempts || 3,
      retryDelay: config.retryDelay || 1000,
      timeout: config.timeout || 30000
    };
  }

  /**
   * 初始化适配器
   */
  async initialize(config?: ChainConfig): Promise<void> {
    if (config) {
      this.config = { ...this.config, ...config };
    }

    try {
      // 创建 provider
      this.provider = new ethers.JsonRpcProvider(
        this.config.rpcUrls[0],
        this.config.id
      );

      // 验证连接
      await this.provider.getNetwork();
      this.initialized = true;
    } catch (error) {
      throw new ChainAdapterError('Failed to initialize EVM adapter', {
        cause: error
      });
    }
  }

  /**
   * 连接到链
   */
  async connect(): Promise<void> {
    if (!this.initialized) {
      throw new ChainAdapterError('Adapter not initialized');
    }

    try {
      await this.provider.getNetwork();
    } catch (error) {
      throw new ChainAdapterError('Failed to connect to EVM chain', {
        cause: error
      });
    }
  }

  /**
   * 断开连接
   */
  async disconnect(): Promise<void> {
    this.provider = null;
    this.initialized = false;
  }

  /**
   * 获取链 ID
   */
  async getChainId(): Promise<number> {
    this.ensureInitialized();
    const network = await this.provider.getNetwork();
    return Number(network.chainId);
  }

  /**
   * 获取当前区块高度
   */
  async getBlockNumber(): Promise<number> {
    this.ensureInitialized();
    return await this.provider.getBlockNumber();
  }

  /**
   * 获取 Gas 价格
   */
  async getGasPrice(): Promise<bigint> {
    this.ensureInitialized();
    return await this.provider.getGasPrice();
  }

  /**
   * 获取链状态
   */
  async getChainState(): Promise<ChainState> {
    this.ensureInitialized();

    try {
      const [
        network,
        blockNumber,
        block,
        gasPrice,
        feeData,
        peerCount,
        txPoolStatus
      ] = await Promise.all([
        this.provider.getNetwork(),
        this.provider.getBlockNumber(),
        this.provider.getBlock('latest'),
        this.provider.getGasPrice(),
        this.provider.getFeeData(),
        this.provider.send('net_peerCount', []),
        this.provider.send('txpool_status', [])
          .catch(() => ({ pending: '0x0', queued: '0x0' }))
      ]);

      return {
        chainId: Number(network.chainId),
        blockNumber,
        blockHash: block.hash,
        blockTimestamp: block.timestamp * 1000,
        gasPrice,
        baseFeePerGas: feeData.lastBaseFeePerGas || null,
        nextBaseFeePerGas: null, // 需要额外计算
        peers: parseInt(peerCount, 16),
        pendingTransactions: parseInt(txPoolStatus.pending, 16) + parseInt(txPoolStatus.queued, 16),
        tps: 0, // 需要额外计算
        syncing: false, // 需要检查同步状态
        lastUpdated: Date.now(),
        latency: 0, // 需要测量
        errors: 0
      };
    } catch (error) {
      throw new ChainAdapterError('Failed to get chain state', {
        cause: error
      });
    }
  }

  /**
   * 发送交易
   */
  async sendTransaction(config: TransactionConfig): Promise<string> {
    this.ensureInitialized();

    try {
      const tx = await this.createTransaction(config);
      const response = await this.provider.broadcastTransaction(tx);
      return response.hash;
    } catch (error) {
      throw new ChainAdapterError('Failed to send transaction', {
        cause: error
      });
    }
  }

  /**
   * 获取交易
   */
  async getTransaction(hash: string): Promise<TransactionConfig> {
    this.ensureInitialized();

    try {
      const tx = await this.provider.getTransaction(hash);
      if (!tx) {
        throw new ChainAdapterError('Transaction not found');
      }

      return {
        from: tx.from,
        to: tx.to,
        value: tx.value,
        data: tx.data,
        nonce: tx.nonce,
        gasLimit: tx.gasLimit,
        gasPrice: tx.gasPrice,
        maxFeePerGas: tx.maxFeePerGas || undefined,
        maxPriorityFeePerGas: tx.maxPriorityFeePerGas || undefined,
        chainId: tx.chainId,
        type: tx.type
      };
    } catch (error) {
      throw new ChainAdapterError('Failed to get transaction', {
        cause: error
      });
    }
  }

  /**
   * 获取交易收据
   */
  async getTransactionReceipt(hash: string): Promise<TransactionReceipt> {
    this.ensureInitialized();

    try {
      const receipt = await this.provider.getTransactionReceipt(hash);
      if (!receipt) {
        throw new ChainAdapterError('Transaction receipt not found');
      }

      return {
        hash: receipt.hash,
        blockNumber: receipt.blockNumber,
        blockHash: receipt.blockHash,
        timestamp: (await this.provider.getBlock(receipt.blockNumber)).timestamp * 1000,
        from: receipt.from,
        to: receipt.to,
        status: receipt.status === 1,
        gasUsed: receipt.gasUsed,
        effectiveGasPrice: receipt.effectiveGasPrice,
        cumulativeGasUsed: receipt.cumulativeGasUsed,
        logs: receipt.logs.map(log => ({
          address: log.address,
          topics: log.topics,
          data: log.data,
          logIndex: log.index,
          blockNumber: log.blockNumber,
          blockHash: log.blockHash,
          transactionHash: log.transactionHash,
          transactionIndex: log.transactionIndex
        })),
        contractAddress: receipt.contractAddress,
        type: receipt.type,
        root: receipt.root,
        logsBloom: receipt.logsBloom
      };
    } catch (error) {
      throw new ChainAdapterError('Failed to get transaction receipt', {
        cause: error
      });
    }
  }

  /**
   * 等待交易确认
   */
  async waitForTransaction(
    hash: string,
    confirmations: number = this.config.confirmations
  ): Promise<TransactionReceipt> {
    this.ensureInitialized();

    try {
      const receipt = await this.provider.waitForTransaction(
        hash,
        confirmations,
        this.config.timeout
      );
      return this.getTransactionReceipt(receipt.hash);
    } catch (error) {
      throw new ChainAdapterError('Failed to wait for transaction', {
        cause: error
      });
    }
  }

  /**
   * 估算 Gas 费用
   */
  async estimateGas(config: TransactionConfig): Promise<bigint> {
    this.ensureInitialized();

    try {
      return await this.provider.estimateGas({
        from: config.from,
        to: config.to,
        value: config.value,
        data: config.data,
        nonce: config.nonce,
        gasLimit: config.gasLimit,
        gasPrice: config.gasPrice,
        maxFeePerGas: config.maxFeePerGas,
        maxPriorityFeePerGas: config.maxPriorityFeePerGas,
        type: config.type,
        accessList: config.accessList
      });
    } catch (error) {
      throw new ChainAdapterError('Failed to estimate gas', {
        cause: error
      });
    }
  }

  /**
   * 获取区块信息
   */
  async getBlock(blockHashOrNumber: string | number): Promise<BlockInfo> {
    this.ensureInitialized();

    try {
      const block = await this.provider.getBlock(blockHashOrNumber);
      if (!block) {
        throw new ChainAdapterError('Block not found');
      }

      return {
        number: block.number,
        hash: block.hash,
        parentHash: block.parentHash,
        timestamp: block.timestamp * 1000,
        nonce: block.nonce,
        transactions: block.transactions as string[],
        transactionsRoot: block.transactionsRoot,
        receiptsRoot: block.receiptsRoot,
        stateRoot: block.stateRoot,
        gasLimit: block.gasLimit,
        gasUsed: block.gasUsed,
        baseFeePerGas: block.baseFeePerGas,
        miner: block.miner,
        difficulty: block.difficulty,
        totalDifficulty: block.totalDifficulty,
        size: block.size,
        extraData: block.extraData
      };
    } catch (error) {
      throw new ChainAdapterError('Failed to get block', {
        cause: error
      });
    }
  }

  /**
   * 获取带交易的区块信息
   */
  async getBlockWithTransactions(
    blockHashOrNumber: string | number
  ): Promise<BlockInfo & { transactions: TransactionConfig[] }> {
    this.ensureInitialized();

    try {
      const block = await this.provider.getBlock(blockHashOrNumber, true);
      if (!block) {
        throw new ChainAdapterError('Block not found');
      }

      const transactions = (block.transactions as ethers.TransactionResponse[])
        .map(tx => ({
          from: tx.from,
          to: tx.to,
          value: tx.value,
          data: tx.data,
          nonce: tx.nonce,
          gasLimit: tx.gasLimit,
          gasPrice: tx.gasPrice,
          maxFeePerGas: tx.maxFeePerGas || undefined,
          maxPriorityFeePerGas: tx.maxPriorityFeePerGas || undefined,
          chainId: tx.chainId,
          type: tx.type
        }));

      return {
        ...await this.getBlock(blockHashOrNumber),
        transactions
      };
    } catch (error) {
      throw new ChainAdapterError('Failed to get block with transactions', {
        cause: error
      });
    }
  }

  /**
   * 获取多个区块
   */
  async getBlocks(startBlock: number, endBlock: number): Promise<BlockInfo[]> {
    this.ensureInitialized();

    if (endBlock - startBlock > this.config.maxBlockRange) {
      throw new ChainAdapterError(
        `Block range exceeds maximum of ${this.config.maxBlockRange}`
      );
    }

    try {
      const promises = [];
      for (let i = startBlock; i <= endBlock; i += this.config.batchSize) {
        const batchEnd = Math.min(i + this.config.batchSize - 1, endBlock);
        const batchPromises = [];
        for (let j = i; j <= batchEnd; j++) {
          batchPromises.push(this.getBlock(j));
        }
        promises.push(Promise.all(batchPromises));
      }

      const results = await Promise.all(promises);
      return results.flat();
    } catch (error) {
      throw new ChainAdapterError('Failed to get blocks', {
        cause: error
      });
    }
  }

  /**
   * 获取账户余额
   */
  async getBalance(
    address: string,
    blockNumber?: number
  ): Promise<bigint> {
    this.ensureInitialized();

    try {
      return await this.provider.getBalance(
        address,
        blockNumber || 'latest'
      );
    } catch (error) {
      throw new ChainAdapterError('Failed to get balance', {
        cause: error
      });
    }
  }

  /**
   * 获取合约代码
   */
  async getCode(
    address: string,
    blockNumber?: number
  ): Promise<string> {
    this.ensureInitialized();

    try {
      return await this.provider.getCode(
        address,
        blockNumber || 'latest'
      );
    } catch (error) {
      throw new ChainAdapterError('Failed to get code', {
        cause: error
      });
    }
  }

  /**
   * 获取存储数据
   */
  async getStorageAt(
    address: string,
    position: string,
    blockNumber?: number
  ): Promise<string> {
    this.ensureInitialized();

    try {
      return await this.provider.getStorage(
        address,
        position,
        blockNumber || 'latest'
      );
    } catch (error) {
      throw new ChainAdapterError('Failed to get storage', {
        cause: error
      });
    }
  }

  /**
   * 获取账户 nonce
   */
  async getTransactionCount(
    address: string,
    blockNumber?: number
  ): Promise<number> {
    this.ensureInitialized();

    try {
      return await this.provider.getTransactionCount(
        address,
        blockNumber || 'latest'
      );
    } catch (error) {
      throw new ChainAdapterError('Failed to get transaction count', {
        cause: error
      });
    }
  }

  /**
   * 获取账户信息
   */
  async getAccountInfo(address: string): Promise<AccountInfo> {
    this.ensureInitialized();

    try {
      const [balance, nonce, code] = await Promise.all([
        this.getBalance(address),
        this.getTransactionCount(address),
        this.getCode(address)
      ]);

      return {
        address,
        balance,
        nonce,
        code: code === '0x' ? undefined : code,
        lastUpdated: Date.now()
      };
    } catch (error) {
      throw new ChainAdapterError('Failed to get account info', {
        cause: error
      });
    }
  }

  /**
   * 调用合约方法
   */
  async call(
    config: TransactionConfig,
    blockNumber?: number
  ): Promise<string> {
    this.ensureInitialized();

    try {
      return await this.provider.call(
        {
          from: config.from,
          to: config.to,
          value: config.value,
          data: config.data,
          nonce: config.nonce,
          gasLimit: config.gasLimit,
          gasPrice: config.gasPrice,
          maxFeePerGas: config.maxFeePerGas,
          maxPriorityFeePerGas: config.maxPriorityFeePerGas,
          type: config.type,
          accessList: config.accessList
        },
        blockNumber || 'latest'
      );
    } catch (error) {
      throw new ChainAdapterError('Failed to call contract', {
        cause: error
      });
    }
  }

  /**
   * 获取事件日志
   */
  async getLogs(options: {
    fromBlock?: number;
    toBlock?: number;
    address?: string | string[];
    topics?: (string | string[] | null)[];
  }): Promise<TransactionReceipt['logs']> {
    this.ensureInitialized();

    try {
      const logs = await this.provider.getLogs({
        fromBlock: options.fromBlock || 0,
        toBlock: options.toBlock || 'latest',
        address: options.address,
        topics: options.topics
      });

      return logs.map(log => ({
        address: log.address,
        topics: log.topics,
        data: log.data,
        logIndex: log.index,
        blockNumber: log.blockNumber,
        blockHash: log.blockHash,
        transactionHash: log.transactionHash,
        transactionIndex: log.transactionIndex
      }));
    } catch (error) {
      throw new ChainAdapterError('Failed to get logs', {
        cause: error
      });
    }
  }

  /**
   * 订阅事件
   */
  on(event: string, listener: (...args: any[]) => void): void {
    this.ensureInitialized();
    this.provider.on(event, listener);
  }

  /**
   * 取消订阅事件
   */
  off(event: string, listener: (...args: any[]) => void): void {
    this.ensureInitialized();
    this.provider.off(event, listener);
  }

  /**
   * 订阅一次性事件
   */
  once(event: string, listener: (...args: any[]) => void): void {
    this.ensureInitialized();
    this.provider.once(event, listener);
  }

  /**
   * 确保适配器已初始化
   */
  private ensureInitialized(): void {
    if (!this.initialized || !this.provider) {
      throw new ChainAdapterError('Adapter not initialized');
    }
  }

  /**
   * 创建交易对象
   */
  private async createTransaction(
    config: TransactionConfig
  ): Promise<string> {
    const tx: ethers.TransactionRequest = {
      from: config.from,
      to: config.to,
      value: config.value,
      data: config.data,
      nonce: config.nonce,
      gasLimit: config.gasLimit,
      gasPrice: config.gasPrice,
      maxFeePerGas: config.maxFeePerGas,
      maxPriorityFeePerGas: config.maxPriorityFeePerGas,
      type: config.type,
      accessList: config.accessList
    };

    // 如果没有指定 nonce，获取当前 nonce
    if (tx.nonce === undefined) {
      tx.nonce = await this.provider.getTransactionCount(config.from);
    }

    // 如果没有指定 gasLimit，估算 gas
    if (tx.gasLimit === undefined) {
      tx.gasLimit = await this.estimateGas(config);
    }

    // 如果是 EIP-1559 交易但没有指定 maxFeePerGas
    if (tx.type === 2 && !tx.maxFeePerGas) {
      const feeData = await this.provider.getFeeData();
      tx.maxFeePerGas = feeData.maxFeePerGas;
      tx.maxPriorityFeePerGas = feeData.maxPriorityFeePerGas;
    }

    // 序列化交易
    return ethers.Transaction.from(tx).serialized;
  }
} 