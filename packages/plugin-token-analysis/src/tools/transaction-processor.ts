import { Tool } from "langchain/tools";
import { logger } from "@lumix/core";
import { ChainProtocol, Transaction, SimulationResult } from "@lumix/core";
import { ethers } from "ethers";

export interface TransactionProcessorConfig {
  rpcUrl: string;
  protocol: ChainProtocol;
  maxConcurrent: number;
  maxRetries: number;
  retryDelay: number;
  gasMultiplier: number;
  minGasPrice: string;
  maxGasPrice: string;
  nonceManagement: {
    enabled: boolean;
    pendingTxTimeout: number;
  };
}

export interface TransactionRequest {
  from: string;
  to?: string;
  value?: string;
  data?: string;
  nonce?: number;
  gasLimit?: string;
  gasPrice?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
}

export interface TransactionReceipt {
  hash: string;
  blockNumber: number;
  blockHash: string;
  from: string;
  to: string;
  status: boolean;
  gasUsed: string;
  effectiveGasPrice: string;
  logs: Array<{
    address: string;
    topics: string[];
    data: string;
  }>;
}

export class TransactionProcessorTool extends Tool {
  name = "transaction_processor";
  description = "Processes and manages blockchain transactions";
  
  private provider: ethers.providers.JsonRpcProvider;
  private config: TransactionProcessorConfig;
  private nonceTracker: Map<string, {
    nonce: number;
    lastUpdate: number;
  }>;
  private pendingTransactions: Map<string, {
    hash: string;
    timestamp: number;
  }>;

  constructor(config: Partial<TransactionProcessorConfig> = {}) {
    super();
    this.config = {
      rpcUrl: "",
      protocol: ChainProtocol.EVM,
      maxConcurrent: 5,
      maxRetries: 3,
      retryDelay: 1000,
      gasMultiplier: 1.1,
      minGasPrice: "1000000000", // 1 Gwei
      maxGasPrice: "100000000000", // 100 Gwei
      nonceManagement: {
        enabled: true,
        pendingTxTimeout: 300000 // 5分钟
      },
      ...config
    };
    this.provider = new ethers.providers.JsonRpcProvider(this.config.rpcUrl);
    this.nonceTracker = new Map();
    this.pendingTransactions = new Map();
  }

  protected async _call(input: string): Promise<string> {
    try {
      const params = JSON.parse(input);
      
      switch (params.action) {
        case "send-transaction":
          const receipt = await this.sendTransaction(params.transaction);
          return JSON.stringify(receipt);
        
        case "simulate-transaction":
          const simulation = await this.simulateTransaction(params.transaction);
          return JSON.stringify(simulation);
        
        case "get-receipt":
          const txReceipt = await this.getTransactionReceipt(params.hash);
          return JSON.stringify(txReceipt);
        
        case "estimate-gas":
          const gasEstimate = await this.estimateGas(params.transaction);
          return JSON.stringify({ gasLimit: gasEstimate });
        
        default:
          throw new Error(`Unknown action: ${params.action}`);
      }
    } catch (error) {
      if (error instanceof Error) {
        logger.error("Transaction Processor Tool", error.message);
      }
      throw error;
    }
  }

  private async sendTransaction(request: TransactionRequest): Promise<TransactionReceipt> {
    try {
      // 验证交易请求
      this.validateTransactionRequest(request);

      // 获取或更新 nonce
      if (this.config.nonceManagement.enabled) {
        request.nonce = await this.getNextNonce(request.from);
      }

      // 估算 gas 限制
      if (!request.gasLimit) {
        request.gasLimit = await this.estimateGas(request);
      }

      // 获取 gas 价格
      if (!request.gasPrice && !request.maxFeePerGas) {
        const gasPrice = await this.getOptimalGasPrice();
        if (this.provider._network.supportsEIP1559) {
          request.maxFeePerGas = gasPrice;
          request.maxPriorityFeePerGas = (BigInt(gasPrice) / BigInt(4)).toString();
        } else {
          request.gasPrice = gasPrice;
        }
      }

      // 发送交易
      const tx = await this.provider.sendTransaction({
        from: request.from,
        to: request.to,
        value: request.value ? ethers.BigNumber.from(request.value) : undefined,
        data: request.data,
        nonce: request.nonce,
        gasLimit: ethers.BigNumber.from(request.gasLimit),
        gasPrice: request.gasPrice ? ethers.BigNumber.from(request.gasPrice) : undefined,
        maxFeePerGas: request.maxFeePerGas ? ethers.BigNumber.from(request.maxFeePerGas) : undefined,
        maxPriorityFeePerGas: request.maxPriorityFeePerGas ? ethers.BigNumber.from(request.maxPriorityFeePerGas) : undefined
      });

      // 跟踪待处理交易
      this.pendingTransactions.set(request.from, {
        hash: tx.hash,
        timestamp: Date.now()
      });

      // 等待交易确认
      const receipt = await this.waitForTransaction(tx.hash);

      // 更新 nonce
      if (this.config.nonceManagement.enabled && receipt.status) {
        this.updateNonce(request.from, request.nonce + 1);
      }

      return receipt;
    } catch (error) {
      if (error instanceof Error) {
        logger.error(
          "Transaction Processor Tool",
          `Failed to send transaction: ${error.message}`
        );
      }
      throw error;
    }
  }

  private async simulateTransaction(request: TransactionRequest): Promise<SimulationResult> {
    try {
      // 验证交易请求
      this.validateTransactionRequest(request);

      // 估算 gas
      const gasEstimate = await this.estimateGas(request);

      // 模拟交易
      const result = await this.provider.call({
        from: request.from,
        to: request.to,
        value: request.value ? ethers.BigNumber.from(request.value) : undefined,
        data: request.data
      });

      return {
        success: true,
        gasUsed: ethers.BigNumber.from(gasEstimate),
        logs: [result]
      };
    } catch (error) {
      return {
        success: false,
        gasUsed: ethers.BigNumber.from(0),
        logs: [],
        error: error.message
      };
    }
  }

  private async getTransactionReceipt(hash: string): Promise<TransactionReceipt> {
    try {
      const receipt = await this.provider.getTransactionReceipt(hash);
      if (!receipt) {
        throw new Error(`Transaction ${hash} not found`);
      }

      return {
        hash: receipt.transactionHash,
        blockNumber: receipt.blockNumber,
        blockHash: receipt.blockHash,
        from: receipt.from,
        to: receipt.to,
        status: receipt.status === 1,
        gasUsed: receipt.gasUsed.toString(),
        effectiveGasPrice: receipt.effectiveGasPrice.toString(),
        logs: receipt.logs.map(log => ({
          address: log.address,
          topics: log.topics,
          data: log.data
        }))
      };
    } catch (error) {
      if (error instanceof Error) {
        logger.error(
          "Transaction Processor Tool",
          `Failed to get transaction receipt: ${error.message}`
        );
      }
      throw error;
    }
  }

  private async estimateGas(request: TransactionRequest): Promise<string> {
    try {
      const estimate = await this.provider.estimateGas({
        from: request.from,
        to: request.to,
        value: request.value ? ethers.BigNumber.from(request.value) : undefined,
        data: request.data
      });

      // 添加 gas 缓冲
      return (estimate.mul(ethers.BigNumber.from(Math.floor(this.config.gasMultiplier * 100)))
        .div(ethers.BigNumber.from(100))).toString();
    } catch (error) {
      if (error instanceof Error) {
        logger.error(
          "Transaction Processor Tool",
          `Failed to estimate gas: ${error.message}`
        );
      }
      throw error;
    }
  }

  private async getNextNonce(address: string): Promise<number> {
    const tracked = this.nonceTracker.get(address);
    if (tracked) {
      // 检查是否有待处理交易超时
      const pending = this.pendingTransactions.get(address);
      if (pending && Date.now() - pending.timestamp > this.config.nonceManagement.pendingTxTimeout) {
        // 清除超时交易
        this.pendingTransactions.delete(address);
        // 重新从链上获取 nonce
        return this.refreshNonce(address);
      }
      return tracked.nonce;
    }
    return this.refreshNonce(address);
  }

  private async refreshNonce(address: string): Promise<number> {
    const nonce = await this.provider.getTransactionCount(address);
    this.updateNonce(address, nonce);
    return nonce;
  }

  private updateNonce(address: string, nonce: number): void {
    this.nonceTracker.set(address, {
      nonce,
      lastUpdate: Date.now()
    });
  }

  private async getOptimalGasPrice(): Promise<string> {
    try {
      const gasPrice = await this.provider.getGasPrice();
      const minGasPrice = ethers.BigNumber.from(this.config.minGasPrice);
      const maxGasPrice = ethers.BigNumber.from(this.config.maxGasPrice);

      if (gasPrice.lt(minGasPrice)) return minGasPrice.toString();
      if (gasPrice.gt(maxGasPrice)) return maxGasPrice.toString();
      return gasPrice.toString();
    } catch (error) {
      // 如果获取失败,使用最小 gas 价格
      return this.config.minGasPrice;
    }
  }

  private async waitForTransaction(
    hash: string,
    confirmations: number = 1
  ): Promise<TransactionReceipt> {
    try {
      const receipt = await this.provider.waitForTransaction(
        hash,
        confirmations
      );
      return this.getTransactionReceipt(receipt.transactionHash);
    } catch (error) {
      if (error instanceof Error) {
        logger.error(
          "Transaction Processor Tool",
          `Failed to wait for transaction ${hash}: ${error.message}`
        );
      }
      throw error;
    }
  }

  private validateTransactionRequest(request: TransactionRequest): void {
    if (!request.from) {
      throw new Error("Transaction must have a 'from' address");
    }

    if (!request.to && !request.data) {
      throw new Error("Transaction must have either 'to' address or 'data'");
    }

    if (request.value) {
      try {
        ethers.BigNumber.from(request.value);
      } catch {
        throw new Error("Invalid transaction value");
      }
    }

    if (request.gasLimit) {
      try {
        ethers.BigNumber.from(request.gasLimit);
      } catch {
        throw new Error("Invalid gas limit");
      }
    }

    if (request.gasPrice) {
      try {
        ethers.BigNumber.from(request.gasPrice);
      } catch {
        throw new Error("Invalid gas price");
      }
    }

    if (request.maxFeePerGas) {
      try {
        ethers.BigNumber.from(request.maxFeePerGas);
      } catch {
        throw new Error("Invalid max fee per gas");
      }
    }

    if (request.maxPriorityFeePerGas) {
      try {
        ethers.BigNumber.from(request.maxPriorityFeePerGas);
      } catch {
        throw new Error("Invalid max priority fee per gas");
      }
    }
  }

  public clearPendingTransactions(): void {
    this.pendingTransactions.clear();
  }

  public clearNonceCache(): void {
    this.nonceTracker.clear();
  }

  public updateConfig(config: Partial<TransactionProcessorConfig>): void {
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