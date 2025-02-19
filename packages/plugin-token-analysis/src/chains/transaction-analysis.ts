import { BaseChain } from "langchain/chains";
import { ChainValues } from "langchain/schema";
import { ChainQueryTool } from "../tools/chain-query";
import { TransactionProcessorTool } from "../tools/transaction-processor";
import { AccountManagerTool } from "../tools/account-manager";
import { ChainProtocol } from "@lumix/core";
import { DatabaseManager } from "@lumix/core";
import { logger } from "@lumix/core";

export interface TransactionAnalysisInput {
  chain: ChainProtocol;
  transactions?: string[]; // 交易哈希列表
  addresses?: string[]; // 地址列表
  timeframe?: {
    start: number;
    end: number;
  };
  options?: {
    includeInternalTxs?: boolean;
    includeTokenTransfers?: boolean;
    calculateGasStats?: boolean;
    groupByAddress?: boolean;
  };
}

export interface TransactionAnalysisOutput {
  transactions: Array<{
    hash: string;
    from: string;
    to: string;
    value: string;
    gasUsed: string;
    gasPrice: string;
    blockNumber: number;
    timestamp: number;
    status: boolean;
    internalTxs?: Array<{
      from: string;
      to: string;
      value: string;
    }>;
    tokenTransfers?: Array<{
      token: string;
      from: string;
      to: string;
      value: string;
    }>;
  }>;
  addressStats?: Record<string, {
    sent: {
      count: number;
      volume: string;
      avgGasUsed: string;
      successRate: number;
    };
    received: {
      count: number;
      volume: string;
      fromAddresses: number;
    };
    tokenTransfers: {
      sent: number;
      received: number;
      tokens: Set<string>;
    };
  }>;
  gasStats?: {
    totalGasUsed: string;
    avgGasPrice: string;
    minGasPrice: string;
    maxGasPrice: string;
    gasUsedDistribution: {
      low: number;
      medium: number;
      high: number;
    };
  };
  patterns: {
    highValueTxs: Array<{
      hash: string;
      value: string;
      from: string;
      to: string;
      timestamp: number;
    }>;
    frequentAddresses: Array<{
      address: string;
      txCount: number;
      volume: string;
      type: "sender" | "receiver";
    }>;
    unusualPatterns: Array<{
      type: string;
      description: string;
      transactions: string[];
      severity: "low" | "medium" | "high";
    }>;
  };
  summary: {
    totalTransactions: number;
    totalVolume: string;
    uniqueAddresses: number;
    successRate: number;
    startTime: number;
    endTime: number;
  };
}

export class TransactionAnalysisChain extends BaseChain {
  private queryTool: ChainQueryTool;
  private txProcessor: TransactionProcessorTool;
  private accountManager: AccountManagerTool;
  private dbManager: DatabaseManager;

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
  }

  _chainType(): string {
    return "transaction_analysis";
  }

  async _call(values: ChainValues): Promise<ChainValues> {
    try {
      const input = values.input as TransactionAnalysisInput;
      const output: TransactionAnalysisOutput = {
        transactions: [],
        patterns: {
          highValueTxs: [],
          frequentAddresses: [],
          unusualPatterns: []
        },
        summary: {
          totalTransactions: 0,
          totalVolume: "0",
          uniqueAddresses: 0,
          successRate: 0,
          startTime: 0,
          endTime: 0
        }
      };

      // 获取交易数据
      const transactions = await this.getTransactions(input);
      output.transactions = transactions;

      // 计算地址统计
      if (input.options?.groupByAddress) {
        output.addressStats = this.calculateAddressStats(transactions);
      }

      // 计算 gas 统计
      if (input.options?.calculateGasStats) {
        output.gasStats = this.calculateGasStats(transactions);
      }

      // 分析模式
      output.patterns = await this.analyzePatterns(transactions);

      // 生成汇总
      output.summary = this.generateSummary(transactions);

      return { output };
    } catch (error) {
      if (error instanceof Error) {
        logger.error("Transaction Analysis Chain", `Analysis failed: ${error.message}`);
      }
      throw error;
    }
  }

  private async getTransactions(
    input: TransactionAnalysisInput
  ): Promise<TransactionAnalysisOutput["transactions"]> {
    try {
      let transactions: TransactionAnalysisOutput["transactions"] = [];

      if (input.transactions?.length) {
        // 按哈希获取交易
        transactions = await Promise.all(
          input.transactions.map(hash => this.getTransactionByHash(hash))
        );
      } else if (input.addresses?.length) {
        // 按地址获取交易
        transactions = await this.getTransactionsByAddresses(
          input.addresses,
          input.timeframe
        );
      } else if (input.timeframe) {
        // 按时间范围获取交易
        transactions = await this.getTransactionsByTimeframe(input.timeframe);
      }

      // 过滤掉无效交易
      transactions = transactions.filter(tx => tx !== null);

      // 获取内部交易
      if (input.options?.includeInternalTxs) {
        await Promise.all(
          transactions.map(tx => this.getInternalTransactions(tx))
        );
      }

      // 获取代币转账
      if (input.options?.includeTokenTransfers) {
        await Promise.all(
          transactions.map(tx => this.getTokenTransfers(tx))
        );
      }

      return transactions;
    } catch (error) {
      if (error instanceof Error) {
        logger.error(
          "Transaction Analysis Chain",
          `Failed to get transactions: ${error.message}`
        );
      }
      throw error;
    }
  }

  private async getTransactionByHash(
    hash: string
  ): Promise<TransactionAnalysisOutput["transactions"][0] | null> {
    try {
      const receipt = await this.txProcessor._call(JSON.stringify({
        action: "get-receipt",
        hash
      }));
      const receiptData = JSON.parse(receipt);

      return {
        hash: receiptData.hash,
        from: receiptData.from,
        to: receiptData.to,
        value: receiptData.value || "0",
        gasUsed: receiptData.gasUsed,
        gasPrice: receiptData.effectiveGasPrice,
        blockNumber: receiptData.blockNumber,
        timestamp: 0, // 需要从区块获取
        status: receiptData.status
      };
    } catch (error) {
      logger.warn(
        "Transaction Analysis Chain",
        `Failed to get transaction ${hash}: ${error.message}`
      );
      return null;
    }
  }

  private async getTransactionsByAddresses(
    addresses: string[],
    timeframe?: TransactionAnalysisInput["timeframe"]
  ): Promise<TransactionAnalysisOutput["transactions"]> {
    try {
      const db = this.dbManager.getAdapter();
      const transactions = await db.listTransactions({
        address: addresses.join(","),
        startTime: timeframe?.start ? new Date(timeframe.start) : undefined,
        endTime: timeframe?.end ? new Date(timeframe.end) : undefined
      });

      return transactions.map(tx => ({
        hash: tx.hash,
        from: tx.from,
        to: tx.to,
        value: tx.value,
        gasUsed: tx.gasUsed || "0",
        gasPrice: tx.gasPrice || "0",
        blockNumber: 0, // 需要从链上获取
        timestamp: tx.timestamp.getTime(),
        status: tx.status === "confirmed"
      }));
    } catch (error) {
      logger.error(
        "Transaction Analysis Chain",
        `Failed to get transactions for addresses: ${error.message}`
      );
      return [];
    }
  }

  private async getTransactionsByTimeframe(
    timeframe: NonNullable<TransactionAnalysisInput["timeframe"]>
  ): Promise<TransactionAnalysisOutput["transactions"]> {
    try {
      const db = this.dbManager.getAdapter();
      const transactions = await db.listTransactions({
        startTime: new Date(timeframe.start),
        endTime: new Date(timeframe.end)
      });

      return transactions.map(tx => ({
        hash: tx.hash,
        from: tx.from,
        to: tx.to,
        value: tx.value,
        gasUsed: tx.gasUsed || "0",
        gasPrice: tx.gasPrice || "0",
        blockNumber: 0, // 需要从链上获取
        timestamp: tx.timestamp.getTime(),
        status: tx.status === "confirmed"
      }));
    } catch (error) {
      logger.error(
        "Transaction Analysis Chain",
        `Failed to get transactions by timeframe: ${error.message}`
      );
      return [];
    }
  }

  private async getInternalTransactions(
    tx: TransactionAnalysisOutput["transactions"][0]
  ): Promise<void> {
    try {
      // TODO: 实现获取内部交易的逻辑
      tx.internalTxs = [];
    } catch (error) {
      logger.warn(
        "Transaction Analysis Chain",
        `Failed to get internal transactions for ${tx.hash}: ${error.message}`
      );
    }
  }

  private async getTokenTransfers(
    tx: TransactionAnalysisOutput["transactions"][0]
  ): Promise<void> {
    try {
      const logs = await this.queryTool._call(JSON.stringify({
        action: "get-logs",
        filter: {
          fromBlock: tx.blockNumber,
          toBlock: tx.blockNumber,
          topics: [
            "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef" // Transfer(address,address,uint256)
          ]
        }
      }));

      const transfers = JSON.parse(logs);
      tx.tokenTransfers = transfers.map((log: any) => ({
        token: log.address,
        from: "0x" + log.topics[1].slice(26),
        to: "0x" + log.topics[2].slice(26),
        value: log.data
      }));
    } catch (error) {
      logger.warn(
        "Transaction Analysis Chain",
        `Failed to get token transfers for ${tx.hash}: ${error.message}`
      );
      tx.tokenTransfers = [];
    }
  }

  private calculateAddressStats(
    transactions: TransactionAnalysisOutput["transactions"]
  ): NonNullable<TransactionAnalysisOutput["addressStats"]> {
    const stats: NonNullable<TransactionAnalysisOutput["addressStats"]> = {};

    // 初始化地址统计
    const initAddressStats = (address: string) => {
      if (!stats[address]) {
        stats[address] = {
          sent: {
            count: 0,
            volume: "0",
            avgGasUsed: "0",
            successRate: 0
          },
          received: {
            count: 0,
            volume: "0",
            fromAddresses: 0
          },
          tokenTransfers: {
            sent: 0,
            received: 0,
            tokens: new Set()
          }
        };
      }
    };

    // 处理每个交易
    transactions.forEach(tx => {
      // 发送方统计
      initAddressStats(tx.from);
      const sender = stats[tx.from];
      sender.sent.count++;
      sender.sent.volume = (BigInt(sender.sent.volume) + BigInt(tx.value)).toString();
      sender.sent.avgGasUsed = (
        (BigInt(sender.sent.avgGasUsed) * BigInt(sender.sent.count - 1) +
          BigInt(tx.gasUsed)) /
        BigInt(sender.sent.count)
      ).toString();
      sender.sent.successRate =
        (sender.sent.successRate * (sender.sent.count - 1) + (tx.status ? 1 : 0)) /
        sender.sent.count;

      // 接收方统计
      if (tx.to) {
        initAddressStats(tx.to);
        const receiver = stats[tx.to];
        receiver.received.count++;
        receiver.received.volume = (
          BigInt(receiver.received.volume) + BigInt(tx.value)
        ).toString();
        receiver.received.fromAddresses++;
      }

      // 代币转账统计
      tx.tokenTransfers?.forEach(transfer => {
        initAddressStats(transfer.from);
        initAddressStats(transfer.to);
        
        stats[transfer.from].tokenTransfers.sent++;
        stats[transfer.from].tokenTransfers.tokens.add(transfer.token);
        
        stats[transfer.to].tokenTransfers.received++;
        stats[transfer.to].tokenTransfers.tokens.add(transfer.token);
      });
    });

    return stats;
  }

  private calculateGasStats(
    transactions: TransactionAnalysisOutput["transactions"]
  ): NonNullable<TransactionAnalysisOutput["gasStats"]> {
    if (transactions.length === 0) {
      return {
        totalGasUsed: "0",
        avgGasPrice: "0",
        minGasPrice: "0",
        maxGasPrice: "0",
        gasUsedDistribution: {
          low: 0,
          medium: 0,
          high: 0
        }
      };
    }

    // 计算基本统计
    let totalGasUsed = BigInt(0);
    let totalGasPrice = BigInt(0);
    let minGasPrice = BigInt(transactions[0].gasPrice);
    let maxGasPrice = BigInt(transactions[0].gasPrice);

    transactions.forEach(tx => {
      const gasUsed = BigInt(tx.gasUsed);
      const gasPrice = BigInt(tx.gasPrice);
      
      totalGasUsed += gasUsed;
      totalGasPrice += gasPrice;
      
      if (gasPrice < minGasPrice) minGasPrice = gasPrice;
      if (gasPrice > maxGasPrice) maxGasPrice = gasPrice;
    });

    // 计算 gas 使用分布
    const avgGasUsed = totalGasUsed / BigInt(transactions.length);
    const distribution = {
      low: 0,
      medium: 0,
      high: 0
    };

    transactions.forEach(tx => {
      const gasUsed = BigInt(tx.gasUsed);
      if (gasUsed < avgGasUsed * BigInt(75) / BigInt(100)) {
        distribution.low++;
      } else if (gasUsed > avgGasUsed * BigInt(125) / BigInt(100)) {
        distribution.high++;
      } else {
        distribution.medium++;
      }
    });

    return {
      totalGasUsed: totalGasUsed.toString(),
      avgGasPrice: (totalGasPrice / BigInt(transactions.length)).toString(),
      minGasPrice: minGasPrice.toString(),
      maxGasPrice: maxGasPrice.toString(),
      gasUsedDistribution: distribution
    };
  }

  private async analyzePatterns(
    transactions: TransactionAnalysisOutput["transactions"]
  ): Promise<TransactionAnalysisOutput["patterns"]> {
    const patterns: TransactionAnalysisOutput["patterns"] = {
      highValueTxs: [],
      frequentAddresses: [],
      unusualPatterns: []
    };

    // 找出高价值交易
    const sortedByValue = [...transactions].sort(
      (a, b) => Number(BigInt(b.value) - BigInt(a.value))
    );
    patterns.highValueTxs = sortedByValue.slice(0, 10).map(tx => ({
      hash: tx.hash,
      value: tx.value,
      from: tx.from,
      to: tx.to,
      timestamp: tx.timestamp
    }));

    // 找出频繁地址
    const addressStats = new Map<string, {
      sent: number;
      received: number;
      volume: bigint;
    }>();

    transactions.forEach(tx => {
      // 发送方
      const sender = addressStats.get(tx.from) || {
        sent: 0,
        received: 0,
        volume: BigInt(0)
      };
      sender.sent++;
      sender.volume += BigInt(tx.value);
      addressStats.set(tx.from, sender);

      // 接收方
      if (tx.to) {
        const receiver = addressStats.get(tx.to) || {
          sent: 0,
          received: 0,
          volume: BigInt(0)
        };
        receiver.received++;
        receiver.volume += BigInt(tx.value);
        addressStats.set(tx.to, receiver);
      }
    });

    // 转换为数组并排序
    const sortedAddresses = Array.from(addressStats.entries())
      .map(([address, stats]) => ({
        address,
        txCount: stats.sent + stats.received,
        volume: stats.volume.toString(),
        type: stats.sent > stats.received ? "sender" : "receiver" as const
      }))
      .sort((a, b) => b.txCount - a.txCount);

    patterns.frequentAddresses = sortedAddresses.slice(0, 10);

    // 检测异常模式
    patterns.unusualPatterns = await this.detectUnusualPatterns(transactions);

    return patterns;
  }

  private async detectUnusualPatterns(
    transactions: TransactionAnalysisOutput["transactions"]
  ): Promise<TransactionAnalysisOutput["patterns"]["unusualPatterns"]> {
    const patterns: TransactionAnalysisOutput["patterns"]["unusualPatterns"] = [];

    // 检测循环交易
    const circularTxs = this.detectCircularTransactions(transactions);
    if (circularTxs.length > 0) {
      patterns.push({
        type: "circular_transactions",
        description: "Detected circular transaction pattern",
        transactions: circularTxs,
        severity: "high"
      });
    }

    // 检测高频小额交易
    const highFreqTxs = this.detectHighFrequencyTransactions(transactions);
    if (highFreqTxs.length > 0) {
      patterns.push({
        type: "high_frequency_transactions",
        description: "Detected high frequency small value transactions",
        transactions: highFreqTxs,
        severity: "medium"
      });
    }

    // 检测异常 gas 价格
    const unusualGasTxs = this.detectUnusualGasPrice(transactions);
    if (unusualGasTxs.length > 0) {
      patterns.push({
        type: "unusual_gas_price",
        description: "Detected transactions with unusually high gas price",
        transactions: unusualGasTxs,
        severity: "low"
      });
    }

    return patterns;
  }

  private detectCircularTransactions(
    transactions: TransactionAnalysisOutput["transactions"]
  ): string[] {
    const circularTxs: string[] = [];
    const addressFlow = new Map<string, Set<string>>();

    // 构建地址流向图
    transactions.forEach(tx => {
      if (!tx.to) return;

      const fromSet = addressFlow.get(tx.from) || new Set();
      fromSet.add(tx.to);
      addressFlow.set(tx.from, fromSet);
    });

    // 检测循环
    transactions.forEach(tx => {
      if (!tx.to) return;

      const visited = new Set<string>([tx.from]);
      const path = [tx.from];
      
      const findCycle = (current: string): boolean => {
        const nextAddresses = addressFlow.get(current);
        if (!nextAddresses) return false;

        for (const next of nextAddresses) {
          if (next === tx.from && path.length > 2) {
            // 找到循环
            circularTxs.push(tx.hash);
            return true;
          }

          if (!visited.has(next)) {
            visited.add(next);
            path.push(next);
            if (findCycle(next)) return true;
            path.pop();
            visited.delete(next);
          }
        }

        return false;
      };

      findCycle(tx.from);
    });

    return circularTxs;
  }

  private detectHighFrequencyTransactions(
    transactions: TransactionAnalysisOutput["transactions"]
  ): string[] {
    const highFreqTxs: string[] = [];
    const addressTxs = new Map<string, {
      timestamps: number[];
      hashes: string[];
    }>();

    // 按地址分组交易
    transactions.forEach(tx => {
      const senderTxs = addressTxs.get(tx.from) || {
        timestamps: [],
        hashes: []
      };
      senderTxs.timestamps.push(tx.timestamp);
      senderTxs.hashes.push(tx.hash);
      addressTxs.set(tx.from, senderTxs);
    });

    // 检测高频模式
    addressTxs.forEach(({ timestamps, hashes }) => {
      if (timestamps.length < 5) return;

      // 检查是否有在短时间内的多笔交易
      for (let i = 0; i < timestamps.length - 4; i++) {
        const timeWindow = timestamps[i + 4] - timestamps[i];
        if (timeWindow <= 300000) { // 5分钟内
          highFreqTxs.push(...hashes.slice(i, i + 5));
          i += 4;
        }
      }
    });

    return [...new Set(highFreqTxs)];
  }

  private detectUnusualGasPrice(
    transactions: TransactionAnalysisOutput["transactions"]
  ): string[] {
    const unusualGasTxs: string[] = [];
    
    if (transactions.length === 0) return unusualGasTxs;

    // 计算平均 gas 价格
    const totalGasPrice = transactions.reduce(
      (sum, tx) => sum + BigInt(tx.gasPrice),
      BigInt(0)
    );
    const avgGasPrice = totalGasPrice / BigInt(transactions.length);

    // 找出 gas 价格异常的交易
    transactions.forEach(tx => {
      const gasPrice = BigInt(tx.gasPrice);
      if (gasPrice > avgGasPrice * BigInt(3)) { // gas 价格超过平均值 3 倍
        unusualGasTxs.push(tx.hash);
      }
    });

    return unusualGasTxs;
  }

  private generateSummary(
    transactions: TransactionAnalysisOutput["transactions"]
  ): TransactionAnalysisOutput["summary"] {
    const addresses = new Set<string>();
    let totalVolume = BigInt(0);
    let successCount = 0;

    transactions.forEach(tx => {
      addresses.add(tx.from);
      if (tx.to) addresses.add(tx.to);
      totalVolume += BigInt(tx.value);
      if (tx.status) successCount++;
    });

    return {
      totalTransactions: transactions.length,
      totalVolume: totalVolume.toString(),
      uniqueAddresses: addresses.size,
      successRate: transactions.length > 0 ? successCount / transactions.length : 0,
      startTime: Math.min(...transactions.map(tx => tx.timestamp)),
      endTime: Math.max(...transactions.map(tx => tx.timestamp))
    };
  }
} 