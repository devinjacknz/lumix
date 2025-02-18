import {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
  Keypair,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
  AccountInfo as SolanaAccountInfo,
  ParsedAccountData,
  BlockResponse,
  ParsedTransactionWithMeta,
  TokenAccountsFilter
} from '@solana/web3.js';
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

export class SolanaChainAdapter implements ChainAdapter {
  private config: Required<ChainConfig>;
  private connection: Connection;
  private initialized: boolean = false;

  constructor(config: ChainConfig) {
    this.config = {
      id: config.id,
      name: config.name,
      type: config.type,
      nativeCurrency: config.nativeCurrency,
      rpcUrls: config.rpcUrls,
      blockExplorerUrls: config.blockExplorerUrls || [],
      iconUrl: config.iconUrl || '',
      testnet: config.testnet || false,
      blockTime: config.blockTime || 400, // 400ms
      confirmations: config.confirmations || 32,
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
      this.config = {
        ...this.config,
        ...config
      };
    }

    try {
      this.connection = new Connection(
        this.config.rpcUrls[0],
        {
          commitment: 'confirmed',
          confirmTransactionInitialTimeout: this.config.timeout
        }
      );
      this.initialized = true;
    } catch (error) {
      throw new ChainAdapterError('Failed to initialize Solana adapter', {
        cause: error
      });
    }
  }

  /**
   * 连接到链
   */
  async connect(): Promise<void> {
    this.ensureInitialized();
    try {
      // 验证连接
      await this.connection.getVersion();
    } catch (error) {
      throw new ChainAdapterError('Failed to connect to Solana network', {
        cause: error
      });
    }
  }

  /**
   * 断开连接
   */
  async disconnect(): Promise<void> {
    // Solana 连接不需要显式断开
    this.initialized = false;
  }

  /**
   * 获取链 ID
   */
  async getChainId(): Promise<number> {
    return this.config.id;
  }

  /**
   * 获取当前区块高度
   */
  async getBlockNumber(): Promise<number> {
    this.ensureInitialized();
    try {
      return await this.connection.getSlot();
    } catch (error) {
      throw new ChainAdapterError('Failed to get block number', {
        cause: error
      });
    }
  }

  /**
   * 获取 Gas 价格
   */
  async getGasPrice(): Promise<bigint> {
    this.ensureInitialized();
    try {
      const { feeCalculator } = await this.connection.getRecentBlockhash();
      return BigInt(feeCalculator.lamportsPerSignature);
    } catch (error) {
      throw new ChainAdapterError('Failed to get gas price', {
        cause: error
      });
    }
  }

  /**
   * 获取链状态
   */
  async getChainState(): Promise<ChainState> {
    this.ensureInitialized();
    try {
      const [slot, block, performance] = await Promise.all([
        this.connection.getSlot(),
        this.connection.getLatestBlockhash(),
        this.connection.getRecentPerformanceSamples(1)
      ]);

      // 计算 TPS
      const tps = performance.length > 0 ? 
        performance[0].numTransactions / performance[0].samplePeriodSecs : 
        0;

      return {
        chainId: this.config.id,
        blockNumber: slot,
        blockHash: block.blockhash,
        blockTimestamp: Date.now(), // Solana 没有区块时间戳
        gasPrice: BigInt(block.feeCalculator.lamportsPerSignature),
        baseFeePerGas: undefined,
        nextBaseFeePerGas: undefined,
        peers: 0, // Solana 不提供节点数量
        pendingTransactions: 0, // Solana 不提供待处理交易数量
        tps,
        syncing: false,
        lastUpdated: Date.now(),
        latency: 0,
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
      const signature = await this.connection.sendRawTransaction(tx);
      return signature;
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
      const tx = await this.connection.getParsedTransaction(hash);
      if (!tx) {
        throw new Error('Transaction not found');
      }
      return this.parseSolanaTransaction(tx);
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
      const tx = await this.connection.getParsedTransaction(hash, {
        commitment: 'confirmed'
      });

      if (!tx) {
        throw new Error('Transaction not found');
      }

      return {
        hash,
        blockNumber: tx.slot,
        blockHash: tx.transaction.message.recentBlockhash,
        timestamp: Date.now(),
        from: tx.transaction.message.accountKeys[0].pubkey.toString(),
        to: tx.transaction.message.accountKeys[1]?.pubkey.toString(),
        status: tx.meta?.err === null,
        gasUsed: BigInt(tx.meta?.fee || 0),
        effectiveGasPrice: BigInt(0),
        cumulativeGasUsed: BigInt(0),
        logs: tx.meta?.logMessages?.map((msg: string, index: number) => ({
          address: '',
          topics: [],
          data: msg,
          logIndex: index,
          blockNumber: tx.slot,
          blockHash: tx.transaction.message.recentBlockhash,
          transactionHash: hash,
          transactionIndex: 0
        })) || [],
        contractAddress: undefined,
        type: 0,
        root: undefined,
        logsBloom: undefined
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
      await this.connection.confirmTransaction(hash, confirmations);
      return this.getTransactionReceipt(hash);
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
      const tx = await this.createTransaction(config);
      const fee = await this.connection.getFeeForMessage(
        Transaction.from(tx).compileMessage()
      );
      return BigInt(fee.value);
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
      const block = await this.connection.getBlock(
        typeof blockHashOrNumber === 'string' ? 
          parseInt(blockHashOrNumber) : 
          blockHashOrNumber
      );

      if (!block) {
        throw new Error('Block not found');
      }

      return {
        number: block.slot,
        hash: block.blockhash,
        parentHash: block.previousBlockhash,
        timestamp: block.blockTime ? block.blockTime * 1000 : Date.now(),
        nonce: undefined,
        transactions: block.transactions.map((tx: any) => tx.transaction.signatures[0]),
        transactionsRoot: '',
        receiptsRoot: '',
        stateRoot: '',
        gasLimit: BigInt(0),
        gasUsed: BigInt(block.transactions.reduce((sum: number, tx: any) => 
          sum + (tx.meta?.fee || 0), 0)),
        baseFeePerGas: undefined,
        miner: '',
        difficulty: undefined,
        totalDifficulty: undefined,
        size: block.transactions.length,
        extraData: ''
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
      const block = await this.connection.getBlock(
        typeof blockHashOrNumber === 'string' ? 
          parseInt(blockHashOrNumber) : 
          blockHashOrNumber,
        {
          maxSupportedTransactionVersion: 0,
          transactionDetails: 'full'
        }
      );

      if (!block) {
        throw new Error('Block not found');
      }

      const transactions = block.transactions.map((tx: any) => 
        this.parseSolanaTransaction(tx)
      );

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
      const balance = await this.connection.getBalance(
        new PublicKey(address),
        blockNumber ? { slot: blockNumber } : undefined
      );
      return BigInt(balance);
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
      const accountInfo = await this.connection.getAccountInfo(
        new PublicKey(address),
        blockNumber ? { slot: blockNumber } : undefined
      );
      return accountInfo?.data.toString('hex') || '0x';
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
      const accountInfo = await this.connection.getAccountInfo(
        new PublicKey(address),
        blockNumber ? { slot: blockNumber } : undefined
      );
      return accountInfo?.data.toString('hex') || '0x';
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
    return 0; // Solana 不使用 nonce
  }

  /**
   * 获取账户信息
   */
  async getAccountInfo(address: string): Promise<AccountInfo> {
    this.ensureInitialized();

    try {
      const [balance, accountInfo] = await Promise.all([
        this.getBalance(address),
        this.connection.getParsedAccountInfo(new PublicKey(address))
      ]);

      return {
        address,
        balance,
        nonce: 0,
        code: accountInfo.value?.data.toString('hex'),
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
      const tx = await this.createTransaction(config);
      const sim = await this.connection.simulateTransaction(
        Transaction.from(tx),
        undefined,
        blockNumber ? { slot: blockNumber } : undefined
      );
      return sim.value.logs?.join('\n') || '';
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
      const signatures = await this.connection.getSignaturesForAddress(
        new PublicKey(Array.isArray(options.address) ? options.address[0] : options.address),
        {
          limit: this.config.maxBlockRange
        }
      );

      const logs: TransactionReceipt['logs'] = [];
      for (const sig of signatures) {
        const tx = await this.connection.getParsedTransaction(sig.signature);
        if (tx?.meta?.logMessages) {
          logs.push(...tx.meta.logMessages.map((msg, index) => ({
            address: options.address as string,
            topics: [],
            data: msg,
            logIndex: index,
            blockNumber: tx.slot,
            blockHash: '',
            transactionHash: sig.signature,
            transactionIndex: 0
          })));
        }
      }

      return logs;
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
    switch (event) {
      case 'block':
        this.connection.onSlotChange(listener);
        break;
      case 'logs':
        this.connection.onLogs(new PublicKey('11111111111111111111111111111111'), listener);
        break;
      default:
        throw new ChainAdapterError(`Unsupported event type: ${event}`);
    }
  }

  /**
   * 取消订阅事件
   */
  off(event: string, listener: (...args: any[]) => void): void {
    this.ensureInitialized();
    // Solana web3.js 不支持取消特定监听器
  }

  /**
   * 订阅一次性事件
   */
  once(event: string, listener: (...args: any[]) => void): void {
    this.ensureInitialized();
    const wrapper = (...args: any[]) => {
      this.off(event, wrapper);
      listener(...args);
    };
    this.on(event, wrapper);
  }

  /**
   * 确保适配器已初始化
   */
  private ensureInitialized(): void {
    if (!this.initialized || !this.connection) {
      throw new ChainAdapterError('Adapter not initialized');
    }
  }

  /**
   * 创建交易对象
   */
  private async createTransaction(
    config: TransactionConfig
  ): Promise<Buffer> {
    const recentBlockhash = await this.connection.getRecentBlockhash();
    const tx = new Transaction({
      recentBlockhash: recentBlockhash.blockhash,
      feePayer: new PublicKey(config.from)
    });

    if (config.data) {
      tx.add(new TransactionInstruction({
        keys: [
          { pubkey: new PublicKey(config.from), isSigner: true, isWritable: true },
          { pubkey: new PublicKey(config.to), isSigner: false, isWritable: true }
        ],
        programId: new PublicKey(config.to),
        data: Buffer.from(config.data.slice(2), 'hex')
      }));
    } else if (config.value) {
      tx.add(SystemProgram.transfer({
        fromPubkey: new PublicKey(config.from),
        toPubkey: new PublicKey(config.to),
        lamports: Number(config.value)
      }));
    }

    return tx.serialize({ requireAllSignatures: false });
  }

  /**
   * 解析 Solana 交易
   */
  private parseSolanaTransaction(
    tx: ParsedTransactionWithMeta
  ): TransactionConfig {
    return {
      from: tx.transaction.message.accountKeys[0].pubkey.toString(),
      to: tx.transaction.message.accountKeys[1]?.pubkey.toString(),
      value: BigInt(tx.meta?.postBalances[1] || 0) - 
             BigInt(tx.meta?.preBalances[1] || 0),
      data: tx.transaction.message.instructions[0]?.data || '',
      nonce: undefined,
      gasLimit: undefined,
      gasPrice: undefined,
      maxFeePerGas: undefined,
      maxPriorityFeePerGas: undefined,
      chainId: this.config.id,
      type: 0
    };
  }
} 