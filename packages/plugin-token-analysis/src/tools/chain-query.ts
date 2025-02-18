import { Tool } from "langchain/tools";
import { logger } from "@lumix/core";
import { ChainProtocol } from "@lumix/core";
import { ethers } from "ethers";

export interface BlockchainQueryConfig {
  rpcUrl: string;
  protocol: ChainProtocol;
  maxConcurrent: number;
  cacheEnabled: boolean;
  cacheTTL: number;
  retryAttempts: number;
  retryDelay: number;
}

export interface BlockInfo {
  number: number;
  hash: string;
  timestamp: number;
  transactions: number;
  gasUsed: string;
  gasLimit: string;
}

export interface AccountInfo {
  balance: string;
  nonce: number;
  code: string;
  storage: Record<string, string>;
}

export class ChainQueryTool extends Tool {
  name = "chain_query";
  description = "Queries blockchain data including blocks, accounts, and contract state";
  
  private provider: ethers.providers.JsonRpcProvider;
  private config: BlockchainQueryConfig;
  private cache: Map<string, {
    data: any;
    timestamp: number;
  }>;

  constructor(config: Partial<BlockchainQueryConfig> = {}) {
    super();
    this.config = {
      rpcUrl: "",
      protocol: ChainProtocol.EVM,
      maxConcurrent: 5,
      cacheEnabled: true,
      cacheTTL: 300000, // 5分钟
      retryAttempts: 3,
      retryDelay: 1000, // 1秒
      ...config
    };
    this.provider = new ethers.providers.JsonRpcProvider(this.config.rpcUrl);
    this.cache = new Map();
  }

  protected async _call(input: string): Promise<string> {
    try {
      const params = JSON.parse(input);
      
      switch (params.action) {
        case "get-block":
          const block = await this.getBlock(params.blockNumber || params.blockHash);
          return JSON.stringify(block);
        
        case "get-account":
          const account = await this.getAccount(params.address);
          return JSON.stringify(account);
        
        case "get-storage":
          const storage = await this.getStorage(
            params.address,
            params.slot
          );
          return JSON.stringify({ value: storage });
        
        case "get-logs":
          const logs = await this.getLogs(params.filter);
          return JSON.stringify(logs);
        
        default:
          throw new Error(`Unknown action: ${params.action}`);
      }
    } catch (error) {
      if (error instanceof Error) {
        logger.error("Chain Query Tool", error.message);
      }
      throw error;
    }
  }

  private async getBlock(blockHashOrNumber: string | number): Promise<BlockInfo> {
    const cacheKey = `block:${blockHashOrNumber}`;
    
    if (this.config.cacheEnabled) {
      const cached = this.cache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.config.cacheTTL) {
        return cached.data;
      }
    }

    try {
      const block = await this.retryOperation(() =>
        this.provider.getBlock(blockHashOrNumber)
      );

      if (!block) {
        throw new Error(`Block ${blockHashOrNumber} not found`);
      }

      const blockInfo: BlockInfo = {
        number: block.number,
        hash: block.hash,
        timestamp: block.timestamp,
        transactions: block.transactions.length,
        gasUsed: block.gasUsed.toString(),
        gasLimit: block.gasLimit.toString()
      };

      if (this.config.cacheEnabled) {
        this.cache.set(cacheKey, {
          data: blockInfo,
          timestamp: Date.now()
        });
      }

      return blockInfo;
    } catch (error) {
      if (error instanceof Error) {
        logger.error(
          "Chain Query Tool",
          `Failed to get block ${blockHashOrNumber}: ${error.message}`
        );
      }
      throw error;
    }
  }

  private async getAccount(address: string): Promise<AccountInfo> {
    const cacheKey = `account:${address}`;
    
    if (this.config.cacheEnabled) {
      const cached = this.cache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.config.cacheTTL) {
        return cached.data;
      }
    }

    try {
      const [balance, code, nonce] = await Promise.all([
        this.retryOperation(() => this.provider.getBalance(address)),
        this.retryOperation(() => this.provider.getCode(address)),
        this.retryOperation(() => this.provider.getTransactionCount(address))
      ]);

      const accountInfo: AccountInfo = {
        balance: balance.toString(),
        nonce,
        code,
        storage: {}
      };

      if (this.config.cacheEnabled) {
        this.cache.set(cacheKey, {
          data: accountInfo,
          timestamp: Date.now()
        });
      }

      return accountInfo;
    } catch (error) {
      if (error instanceof Error) {
        logger.error(
          "Chain Query Tool",
          `Failed to get account info for ${address}: ${error.message}`
        );
      }
      throw error;
    }
  }

  private async getStorage(
    address: string,
    slot: string
  ): Promise<string> {
    const cacheKey = `storage:${address}:${slot}`;
    
    if (this.config.cacheEnabled) {
      const cached = this.cache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.config.cacheTTL) {
        return cached.data;
      }
    }

    try {
      const storage = await this.retryOperation(() =>
        this.provider.getStorageAt(address, slot)
      );

      if (this.config.cacheEnabled) {
        this.cache.set(cacheKey, {
          data: storage,
          timestamp: Date.now()
        });
      }

      return storage;
    } catch (error) {
      if (error instanceof Error) {
        logger.error(
          "Chain Query Tool",
          `Failed to get storage at ${address}[${slot}]: ${error.message}`
        );
      }
      throw error;
    }
  }

  private async getLogs(filter: ethers.providers.Filter): Promise<ethers.providers.Log[]> {
    try {
      return await this.retryOperation(() =>
        this.provider.getLogs(filter)
      );
    } catch (error) {
      if (error instanceof Error) {
        logger.error(
          "Chain Query Tool",
          `Failed to get logs: ${error.message}`
        );
      }
      throw error;
    }
  }

  private async retryOperation<T>(
    operation: () => Promise<T>,
    attempt: number = 1
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (attempt >= this.config.retryAttempts) {
        throw error;
      }

      await new Promise(resolve =>
        setTimeout(resolve, this.config.retryDelay * attempt)
      );

      return this.retryOperation(operation, attempt + 1);
    }
  }

  public clearCache(): void {
    this.cache.clear();
  }

  public updateConfig(config: Partial<BlockchainQueryConfig>): void {
    this.config = {
      ...this.config,
      ...config
    };

    // 如果 RPC URL 改变,重新创建 provider
    if (config.rpcUrl) {
      this.provider = new ethers.providers.JsonRpcProvider(config.rpcUrl);
    }
  }
} 