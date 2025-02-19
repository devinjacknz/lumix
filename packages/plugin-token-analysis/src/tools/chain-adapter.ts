import { Tool } from "langchain/tools";
import { logger } from "@lumix/core";
import { EVMAdapter, ChainProtocol, Transaction, SimulationResult } from "@lumix/core";
import { ethers } from "ethers";

export interface ChainAdapterConfig {
  rpcUrl: string;
  protocol: ChainProtocol;
  chainId?: number;
  networkVersion?: string;
  cacheEnabled?: boolean;
  cacheTTL?: number;
}

export class ChainAdapterTool extends Tool {
  name = "chain_adapter";
  description = "Interacts with blockchain networks and manages transactions";
  
  private adapter: EVMAdapter;
  private config: ChainAdapterConfig;
  private cache: Map<string, {
    data: any;
    timestamp: number;
  }>;

  constructor(config: ChainAdapterConfig) {
    super();
    this.config = {
      cacheEnabled: true,
      cacheTTL: 300000, // 5分钟
      ...config
    };
    this.adapter = new EVMAdapter(config.rpcUrl);
    this.cache = new Map();
  }

  protected async _call(input: string): Promise<string> {
    try {
      const params = JSON.parse(input);
      
      switch (params.action) {
        case "get-balance":
          const balance = await this.getBalance(params.address);
          return JSON.stringify(balance);
        
        case "get-transaction":
          const transaction = await this.getTransaction(params.hash);
          return JSON.stringify(transaction);
        
        case "send-transaction":
          const txHash = await this.sendTransaction(params.transaction);
          return JSON.stringify({ hash: txHash });
        
        case "simulate-transaction":
          const simulation = await this.simulateTransaction(params.transaction);
          return JSON.stringify(simulation);
        
        default:
          throw new Error(`Unknown action: ${params.action}`);
      }
    } catch (error) {
      if (error instanceof Error) {
        logger.error("Chain Adapter Tool", error.message);
      }
      throw error;
    }
  }

  private async getBalance(address: string): Promise<string> {
    const cacheKey = `balance:${address}`;
    
    if (this.config.cacheEnabled) {
      const cached = this.cache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.config.cacheTTL) {
        return cached.data;
      }
    }

    try {
      const balance = await this.adapter.getBalance(address);
      
      if (this.config.cacheEnabled) {
        this.cache.set(cacheKey, {
          data: balance.toString(),
          timestamp: Date.now()
        });
      }

      return balance.toString();
    } catch (error) {
      if (error instanceof Error) {
        logger.error(
          "Chain Adapter Tool",
          `Failed to get balance for address ${address}: ${error.message}`
        );
      }
      throw error;
    }
  }

  private async getTransaction(hash: string): Promise<Transaction> {
    const cacheKey = `transaction:${hash}`;
    
    if (this.config.cacheEnabled) {
      const cached = this.cache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.config.cacheTTL) {
        return cached.data;
      }
    }

    try {
      const transaction = await this.adapter.getTransaction(hash);
      
      if (this.config.cacheEnabled) {
        this.cache.set(cacheKey, {
          data: transaction,
          timestamp: Date.now()
        });
      }

      return transaction;
    } catch (error) {
      if (error instanceof Error) {
        logger.error(
          "Chain Adapter Tool",
          `Failed to get transaction ${hash}: ${error.message}`
        );
      }
      throw error;
    }
  }

  private async sendTransaction(tx: Transaction): Promise<string> {
    try {
      // 验证交易参数
      this.validateTransaction(tx);

      // 发送交易
      const hash = await this.adapter.sendTransaction(tx);

      // 清除相关缓存
      if (this.config.cacheEnabled) {
        this.clearRelatedCache(tx.from);
        if (tx.to) this.clearRelatedCache(tx.to);
      }

      return hash;
    } catch (error) {
      if (error instanceof Error) {
        logger.error(
          "Chain Adapter Tool",
          `Failed to send transaction: ${error.message}`
        );
      }
      throw error;
    }
  }

  private async simulateTransaction(tx: Transaction): Promise<SimulationResult> {
    try {
      // 验证交易参数
      this.validateTransaction(tx);

      // 模拟交易
      return await this.adapter.simulateTransaction(tx);
    } catch (error) {
      if (error instanceof Error) {
        logger.error(
          "Chain Adapter Tool",
          `Failed to simulate transaction: ${error.message}`
        );
      }
      throw error;
    }
  }

  private validateTransaction(tx: Transaction): void {
    if (!tx.from) {
      throw new Error("Transaction must have a 'from' address");
    }

    if (!tx.to && !tx.data) {
      throw new Error("Transaction must have either 'to' address or 'data'");
    }

    if (tx.value && !ethers.BigNumber.isBigNumber(tx.value)) {
      throw new Error("Transaction value must be a BigNumber");
    }
  }

  private clearRelatedCache(address: string): void {
    const keysToDelete: string[] = [];
    
    this.cache.forEach((_, key) => {
      if (key.includes(address)) {
        keysToDelete.push(key);
      }
    });

    keysToDelete.forEach(key => this.cache.delete(key));
  }

  public clearCache(): void {
    this.cache.clear();
  }

  public updateConfig(config: Partial<ChainAdapterConfig>): void {
    this.config = {
      ...this.config,
      ...config
    };
  }
}