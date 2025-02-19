import { ChainProtocol, ChainAdapter } from "@lumix/core";
import { logger } from "@lumix/core";

export interface GenericChainConfig {
  protocol: ChainProtocol;
  rpcUrl: string;
  chainId: string;
  networkVersion: string;
  blockTime: number;
  confirmations: number;
  gasToken: string;
  nativeToken: string;
  explorerUrl?: string;
  bridgeContracts?: {
    [targetChain: string]: string;
  };
}

export class GenericChainAdapter implements ChainAdapter {
  private config: GenericChainConfig;
  private provider: any;
  private connected: boolean;
  private lastBlock: number;
  private syncStatus: {
    isSyncing: boolean;
    currentBlock: number;
    highestBlock: number;
  };

  constructor(config: GenericChainConfig) {
    this.config = config;
    this.connected = false;
    this.lastBlock = 0;
    this.syncStatus = {
      isSyncing: false,
      currentBlock: 0,
      highestBlock: 0
    };
  }

  async connect(): Promise<void> {
    try {
      // 实现连接逻辑
      this.provider = await this.createProvider();
      this.connected = true;
      
      // 获取初始区块
      this.lastBlock = await this.getLatestBlockNumber();
      
      // 开始同步状态监控
      this.startSyncMonitor();

      logger.info(
        "Generic Chain Adapter",
        `Connected to ${this.config.protocol} chain ${this.config.chainId}`
      );
    } catch (error) {
      if (error instanceof Error) {
        logger.error(
          "Generic Chain Adapter",
          `Connection failed: ${error.message}`
        );
      }
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    try {
      if (this.provider) {
        await this.provider.disconnect();
      }
      this.connected = false;
      logger.info(
        "Generic Chain Adapter",
        `Disconnected from ${this.config.protocol} chain ${this.config.chainId}`
      );
    } catch (error) {
      if (error instanceof Error) {
        logger.error(
          "Generic Chain Adapter",
          `Disconnection failed: ${error.message}`
        );
      }
      throw error;
    }
  }

  async getBalance(address: string): Promise<string> {
    try {
      this.checkConnection();
      const balance = await this.provider.getBalance(address);
      return balance.toString();
    } catch (error) {
      if (error instanceof Error) {
        logger.error(
          "Generic Chain Adapter",
          `Failed to get balance for ${address}: ${error.message}`
        );
      }
      throw error;
    }
  }

  async getTransaction(hash: string): Promise<any> {
    try {
      this.checkConnection();
      const tx = await this.provider.getTransaction(hash);
      if (!tx) {
        throw new Error(`Transaction ${hash} not found`);
      }
      return this.formatTransaction(tx);
    } catch (error) {
      if (error instanceof Error) {
        logger.error(
          "Generic Chain Adapter",
          `Failed to get transaction ${hash}: ${error.message}`
        );
      }
      throw error;
    }
  }

  async sendTransaction(tx: any): Promise<string> {
    try {
      this.checkConnection();
      this.validateTransaction(tx);
      
      // 添加链特定参数
      const enrichedTx = await this.enrichTransaction(tx);
      
      // 发送交易
      const result = await this.provider.sendTransaction(enrichedTx);
      
      // 等待确认
      await this.waitForConfirmation(result.hash);
      
      return result.hash;
    } catch (error) {
      if (error instanceof Error) {
        logger.error(
          "Generic Chain Adapter",
          `Failed to send transaction: ${error.message}`
        );
      }
      throw error;
    }
  }

  async estimateGas(tx: any): Promise<string> {
    try {
      this.checkConnection();
      const estimate = await this.provider.estimateGas(tx);
      return estimate.toString();
    } catch (error) {
      if (error instanceof Error) {
        logger.error(
          "Generic Chain Adapter",
          `Failed to estimate gas: ${error.message}`
        );
      }
      throw error;
    }
  }

  async getBlock(number: number): Promise<any> {
    try {
      this.checkConnection();
      const block = await this.provider.getBlock(number);
      if (!block) {
        throw new Error(`Block ${number} not found`);
      }
      return this.formatBlock(block);
    } catch (error) {
      if (error instanceof Error) {
        logger.error(
          "Generic Chain Adapter",
          `Failed to get block ${number}: ${error.message}`
        );
      }
      throw error;
    }
  }

  async getLatestBlockNumber(): Promise<number> {
    try {
      this.checkConnection();
      return await this.provider.getBlockNumber();
    } catch (error) {
      if (error instanceof Error) {
        logger.error(
          "Generic Chain Adapter",
          `Failed to get latest block number: ${error.message}`
        );
      }
      throw error;
    }
  }

  async getCode(address: string): Promise<string> {
    try {
      this.checkConnection();
      return await this.provider.getCode(address);
    } catch (error) {
      if (error instanceof Error) {
        logger.error(
          "Generic Chain Adapter",
          `Failed to get code for ${address}: ${error.message}`
        );
      }
      throw error;
    }
  }

  async getLogs(filter: any): Promise<any[]> {
    try {
      this.checkConnection();
      const logs = await this.provider.getLogs(filter);
      return logs.map(this.formatLog);
    } catch (error) {
      if (error instanceof Error) {
        logger.error(
          "Generic Chain Adapter",
          `Failed to get logs: ${error.message}`
        );
      }
      throw error;
    }
  }

  async call(tx: any): Promise<string> {
    try {
      this.checkConnection();
      return await this.provider.call(tx);
    } catch (error) {
      if (error instanceof Error) {
        logger.error(
          "Generic Chain Adapter",
          `Failed to call: ${error.message}`
        );
      }
      throw error;
    }
  }

  getChainId(): string {
    return this.config.chainId;
  }

  getProtocol(): ChainProtocol {
    return this.config.protocol;
  }

  isConnected(): boolean {
    return this.connected;
  }

  getSyncStatus(): { isSyncing: boolean; currentBlock: number; highestBlock: number } {
    return this.syncStatus;
  }

  private checkConnection(): void {
    if (!this.connected) {
      throw new Error("Not connected to chain");
    }
  }

  private async createProvider(): Promise<any> {
    // 根据协议创建相应的 provider
    switch (this.config.protocol) {
      case ChainProtocol.EVM:
        // 创建 EVM provider
        break;
      case ChainProtocol.SOLANA:
        // 创建 Solana provider
        break;
      case ChainProtocol.NEAR:
        // 创建 NEAR provider
        break;
      default:
        throw new Error(`Unsupported protocol: ${this.config.protocol}`);
    }
  }

  private startSyncMonitor(): void {
    setInterval(async () => {
      try {
        const currentBlock = await this.getLatestBlockNumber();
        const networkBlock = await this.provider.getHighestBlock();
        
        this.syncStatus = {
          isSyncing: currentBlock < networkBlock,
          currentBlock,
          highestBlock: networkBlock
        };

        this.lastBlock = currentBlock;
      } catch (error) {
        if (error instanceof Error) {
          logger.error(
            "Generic Chain Adapter",
            `Sync monitor error: ${error.message}`
          );
        }
      }
    }, 10000); // 每10秒检查一次
  }

  private validateTransaction(tx: any): void {
    if (!tx.from) {
      throw new Error("Transaction must have a 'from' address");
    }
    if (!tx.to && !tx.data) {
      throw new Error("Transaction must have either 'to' address or 'data'");
    }
  }

  private async enrichTransaction(tx: any): Promise<any> {
    // 添加链特定参数
    const enrichedTx = { ...tx };

    // 如果没有指定 gas 限制,进行估算
    if (!enrichedTx.gasLimit) {
      enrichedTx.gasLimit = await this.estimateGas(tx);
    }

    // 如果没有指定 nonce,获取当前 nonce
    if (!enrichedTx.nonce) {
      enrichedTx.nonce = await this.provider.getTransactionCount(tx.from);
    }

    // 根据协议添加特定字段
    switch (this.config.protocol) {
      case ChainProtocol.EVM:
        if (!enrichedTx.gasPrice && !enrichedTx.maxFeePerGas) {
          const gasPrice = await this.provider.getGasPrice();
          enrichedTx.gasPrice = gasPrice.toString();
        }
        break;
      case ChainProtocol.SOLANA:
        // 添加 Solana 特定字段
        break;
      case ChainProtocol.NEAR:
        // 添加 NEAR 特定字段
        break;
    }

    return enrichedTx;
  }

  private async waitForConfirmation(hash: string): Promise<void> {
    const confirmations = this.config.confirmations;
    await this.provider.waitForTransaction(hash, confirmations);
  }

  private formatTransaction(tx: any): any {
    // 根据协议格式化交易数据
    switch (this.config.protocol) {
      case ChainProtocol.EVM:
        return {
          hash: tx.hash,
          from: tx.from,
          to: tx.to,
          value: tx.value.toString(),
          gasLimit: tx.gasLimit.toString(),
          gasPrice: tx.gasPrice?.toString(),
          maxFeePerGas: tx.maxFeePerGas?.toString(),
          maxPriorityFeePerGas: tx.maxPriorityFeePerGas?.toString(),
          nonce: tx.nonce,
          data: tx.data,
          blockNumber: tx.blockNumber,
          blockHash: tx.blockHash,
          timestamp: tx.timestamp
        };
      case ChainProtocol.SOLANA:
        // 格式化 Solana 交易
        break;
      case ChainProtocol.NEAR:
        // 格式化 NEAR 交易
        break;
      default:
        return tx;
    }
  }

  private formatBlock(block: any): any {
    // 根据协议格式化区块数据
    switch (this.config.protocol) {
      case ChainProtocol.EVM:
        return {
          number: block.number,
          hash: block.hash,
          parentHash: block.parentHash,
          timestamp: block.timestamp,
          transactions: block.transactions,
          gasUsed: block.gasUsed.toString(),
          gasLimit: block.gasLimit.toString()
        };
      case ChainProtocol.SOLANA:
        // 格式化 Solana 区块
        break;
      case ChainProtocol.NEAR:
        // 格式化 NEAR 区块
        break;
      default:
        return block;
    }
  }

  private formatLog(log: any): any {
    // 根据协议格式化日志数据
    switch (this.config.protocol) {
      case ChainProtocol.EVM:
        return {
          address: log.address,
          topics: log.topics,
          data: log.data,
          blockNumber: log.blockNumber,
          blockHash: log.blockHash,
          transactionHash: log.transactionHash,
          transactionIndex: log.transactionIndex,
          logIndex: log.logIndex
        };
      case ChainProtocol.SOLANA:
        // 格式化 Solana 日志
        break;
      case ChainProtocol.NEAR:
        // 格式化 NEAR 日志
        break;
      default:
        return log;
    }
  }
} 