import { BaseChain } from "langchain/chains";
import { ChainValues } from "langchain/schema";
import { ChainQueryTool } from "../tools/chain-query";
import { TransactionProcessorTool } from "../tools/transaction-processor";
import { AccountManagerTool } from "../tools/account-manager";
import { ChainProtocol } from "@lumix/core";
import { DatabaseManager } from "@lumix/core";
import { logger } from "@lumix/core";

export interface BlockchainMonitorInput {
  chain: ChainProtocol;
  startBlock?: number;
  endBlock?: number;
  filters?: {
    addresses?: string[];
    eventSignatures?: string[];
    minValue?: string;
  };
  options?: {
    interval?: number;
    batchSize?: number;
    confirmations?: number;
    saveToDb?: boolean;
  };
}

export interface BlockchainMonitorOutput {
  blocks: Array<{
    number: number;
    hash: string;
    timestamp: number;
    transactions: number;
    gasUsed: string;
  }>;
  transactions: Array<{
    hash: string;
    from: string;
    to: string;
    value: string;
    status: boolean;
    blockNumber: number;
    timestamp: number;
  }>;
  events: Array<{
    address: string;
    topics: string[];
    data: string;
    blockNumber: number;
    transactionHash: string;
    timestamp: number;
  }>;
  stats: {
    processedBlocks: number;
    totalTransactions: number;
    totalEvents: number;
    averageBlockTime: number;
    averageGasUsed: string;
    startTime: number;
    endTime: number;
  };
}

export class BlockchainMonitorChain extends BaseChain {
  private queryTool: ChainQueryTool;
  private txProcessor: TransactionProcessorTool;
  private accountManager: AccountManagerTool;
  private dbManager: DatabaseManager;
  private isMonitoring: boolean;
  private lastProcessedBlock: number;

  constructor(
    queryTool: ChainQueryTool,
    txProcessor: TransactionProcessorTool,
    accountManager: AccountManagerTool
  ) {
    super();
    this.queryTool = queryTool;
    this.txProcessor = txProcessor;
    this.accountManager = accountManager;
    this.dbManager = DatabaseManager.getInstance();
    this.isMonitoring = false;
    this.lastProcessedBlock = 0;
  }

  _chainType(): string {
    return "blockchain_monitor";
  }

  async _call(values: ChainValues): Promise<ChainValues> {
    try {
      const input = values.input as BlockchainMonitorInput;
      const output: BlockchainMonitorOutput = {
        blocks: [],
        transactions: [],
        events: [],
        stats: {
          processedBlocks: 0,
          totalTransactions: 0,
          totalEvents: 0,
          averageBlockTime: 0,
          averageGasUsed: "0",
          startTime: Date.now(),
          endTime: 0
        }
      };

      // 获取区块范围
      const startBlock = input.startBlock || await this.getLatestBlockNumber() - 100;
      const endBlock = input.endBlock || await this.getLatestBlockNumber();

      // 配置选项
      const options = {
        interval: input.options?.interval || 1000,
        batchSize: input.options?.batchSize || 10,
        confirmations: input.options?.confirmations || 12,
        saveToDb: input.options?.saveToDb ?? true
      };

      // 开始监控
      this.isMonitoring = true;
      this.lastProcessedBlock = startBlock - 1;

      // 按批次处理区块
      for (let i = startBlock; i <= endBlock && this.isMonitoring; i += options.batchSize) {
        const batchEnd = Math.min(i + options.batchSize - 1, endBlock);
        
        // 处理一批区块
        const batchResults = await this.processBatch(i, batchEnd, input.filters);
        
        // 更新输出
        output.blocks.push(...batchResults.blocks);
        output.transactions.push(...batchResults.transactions);
        output.events.push(...batchResults.events);
        
        // 更新统计信息
        output.stats.processedBlocks += batchResults.blocks.length;
        output.stats.totalTransactions += batchResults.transactions.length;
        output.stats.totalEvents += batchResults.events.length;

        // 保存到数据库
        if (options.saveToDb) {
          await this.saveToDatabase(batchResults);
        }

        // 更新最后处理的区块
        this.lastProcessedBlock = batchEnd;

        // 等待下一批
        if (batchEnd < endBlock) {
          await new Promise(resolve => setTimeout(resolve, options.interval));
        }
      }

      // 计算统计信息
      output.stats.endTime = Date.now();
      output.stats.averageBlockTime = this.calculateAverageBlockTime(output.blocks);
      output.stats.averageGasUsed = this.calculateAverageGasUsed(output.blocks);

      return { output };
    } catch (error) {
      if (error instanceof Error) {
        logger.error("Blockchain Monitor Chain", `Monitoring failed: ${error.message}`);
      }
      throw error;
    }
  }

  private async getLatestBlockNumber(): Promise<number> {
    const result = await this.queryTool._call(JSON.stringify({
      action: "get-block",
      blockNumber: "latest"
    }));
    return JSON.parse(result).number;
  }

  private async processBatch(
    startBlock: number,
    endBlock: number,
    filters?: BlockchainMonitorInput["filters"]
  ): Promise<{
    blocks: BlockchainMonitorOutput["blocks"];
    transactions: BlockchainMonitorOutput["transactions"];
    events: BlockchainMonitorOutput["events"];
  }> {
    const blocks: BlockchainMonitorOutput["blocks"] = [];
    const transactions: BlockchainMonitorOutput["transactions"] = [];
    const events: BlockchainMonitorOutput["events"] = [];

    // 处理每个区块
    for (let blockNumber = startBlock; blockNumber <= endBlock; blockNumber++) {
      // 获取区块信息
      const blockResult = await this.queryTool._call(JSON.stringify({
        action: "get-block",
        blockNumber
      }));
      const block = JSON.parse(blockResult);
      blocks.push(block);

      // 获取区块中的交易
      const txs = await this.getBlockTransactions(blockNumber, filters);
      transactions.push(...txs);

      // 获取事件日志
      const logs = await this.getBlockLogs(blockNumber, filters);
      events.push(...logs);
    }

    return { blocks, transactions, events };
  }

  private async getBlockTransactions(
    blockNumber: number,
    filters?: BlockchainMonitorInput["filters"]
  ): Promise<BlockchainMonitorOutput["transactions"]> {
    try {
      const block = await this.queryTool._call(JSON.stringify({
        action: "get-block",
        blockNumber,
        includeTransactions: true
      }));
      const blockData = JSON.parse(block);

      // 过滤并处理交易
      return blockData.transactions
        .filter((tx: any) => this.filterTransaction(tx, filters))
        .map((tx: any) => ({
          hash: tx.hash,
          from: tx.from,
          to: tx.to,
          value: tx.value,
          status: true, // 需要通过 getTransactionReceipt 获取实际状态
          blockNumber: tx.blockNumber,
          timestamp: blockData.timestamp
        }));
    } catch (error) {
      logger.error(
        "Blockchain Monitor Chain",
        `Failed to get transactions for block ${blockNumber}: ${error.message}`
      );
      return [];
    }
  }

  private async getBlockLogs(
    blockNumber: number,
    filters?: BlockchainMonitorInput["filters"]
  ): Promise<BlockchainMonitorOutput["events"]> {
    try {
      const result = await this.queryTool._call(JSON.stringify({
        action: "get-logs",
        filter: {
          fromBlock: blockNumber,
          toBlock: blockNumber,
          address: filters?.addresses,
          topics: filters?.eventSignatures ? [filters.eventSignatures] : undefined
        }
      }));

      const logs = JSON.parse(result);
      const block = await this.queryTool._call(JSON.stringify({
        action: "get-block",
        blockNumber
      }));
      const blockData = JSON.parse(block);

      return logs.map((log: any) => ({
        ...log,
        timestamp: blockData.timestamp
      }));
    } catch (error) {
      logger.error(
        "Blockchain Monitor Chain",
        `Failed to get logs for block ${blockNumber}: ${error.message}`
      );
      return [];
    }
  }

  private filterTransaction(
    tx: any,
    filters?: BlockchainMonitorInput["filters"]
  ): boolean {
    if (!filters) return true;

    // 地址过滤
    if (filters.addresses?.length > 0) {
      const matchesAddress = filters.addresses.some(address =>
        address.toLowerCase() === tx.from.toLowerCase() ||
        address.toLowerCase() === tx.to?.toLowerCase()
      );
      if (!matchesAddress) return false;
    }

    // 金额过滤
    if (filters.minValue) {
      const value = BigInt(tx.value);
      const minValue = BigInt(filters.minValue);
      if (value < minValue) return false;
    }

    return true;
  }

  private async saveToDatabase(data: {
    blocks: BlockchainMonitorOutput["blocks"];
    transactions: BlockchainMonitorOutput["transactions"];
    events: BlockchainMonitorOutput["events"];
  }): Promise<void> {
    try {
      const db = this.dbManager.getAdapter();

      // 保存交易记录
      for (const tx of data.transactions) {
        await db.saveTransaction({
          id: `${tx.blockNumber}-${tx.hash}`,
          chainType: ChainProtocol.EVM,
          hash: tx.hash,
          from: tx.from,
          to: tx.to,
          value: tx.value,
          timestamp: new Date(tx.timestamp * 1000),
          status: tx.status ? "confirmed" : "failed"
        });
      }

      // 保存事件日志
      await db.saveLogs(data.events.map(event => ({
        level: "info",
        module: "blockchain",
        message: `Event: ${event.topics[0]}`,
        metadata: {
          address: event.address,
          topics: event.topics,
          data: event.data,
          blockNumber: event.blockNumber,
          transactionHash: event.transactionHash
        },
        timestamp: new Date(event.timestamp * 1000)
      })));
    } catch (error) {
      logger.error(
        "Blockchain Monitor Chain",
        `Failed to save data to database: ${error.message}`
      );
    }
  }

  private calculateAverageBlockTime(blocks: BlockchainMonitorOutput["blocks"]): number {
    if (blocks.length < 2) return 0;
    
    let totalTime = 0;
    for (let i = 1; i < blocks.length; i++) {
      totalTime += blocks[i].timestamp - blocks[i - 1].timestamp;
    }
    
    return totalTime / (blocks.length - 1);
  }

  private calculateAverageGasUsed(blocks: BlockchainMonitorOutput["blocks"]): string {
    if (blocks.length === 0) return "0";
    
    const total = blocks.reduce(
      (sum, block) => sum + BigInt(block.gasUsed),
      BigInt(0)
    );
    
    return (total / BigInt(blocks.length)).toString();
  }

  public stopMonitoring(): void {
    this.isMonitoring = false;
  }

  public getLastProcessedBlock(): number {
    return this.lastProcessedBlock;
  }
} 