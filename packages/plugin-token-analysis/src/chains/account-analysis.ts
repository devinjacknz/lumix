import { BaseChain } from "langchain/chains";
import { ChainValues } from "langchain/schema";
import { ChainQueryTool } from "../tools/chain-query";
import { TransactionProcessorTool } from "../tools/transaction-processor";
import { AccountManagerTool } from "../tools/account-manager";
import { ChainProtocol } from "@lumix/core";
import { DatabaseManager } from "@lumix/core";
import { logger } from "@lumix/core";

export interface AccountAnalysisInput {
  chain: ChainProtocol;
  address: string;
  timeframe?: {
    start: number;
    end: number;
  };
  options?: {
    includeTokens?: boolean;
    includeContracts?: boolean;
    includeActivity?: boolean;
    calculateRisk?: boolean;
  };
}

export interface AccountAnalysisOutput {
  account: {
    address: string;
    type: "eoa" | "contract";
    balance: string;
    nonce: number;
    firstSeen: number;
    lastActive: number;
    code?: string;
  };
  tokens?: Array<{
    address: string;
    symbol: string;
    balance: string;
    value: string;
    percentage: number;
  }>;
  contracts?: Array<{
    address: string;
    type: string;
    interactions: number;
    lastInteraction: number;
    risk: {
      level: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
      factors: string[];
    };
  }>;
  activity?: {
    transactions: {
      total: number;
      sent: number;
      received: number;
      failed: number;
      avgGasUsed: string;
      totalGasCost: string;
    };
    volume: {
      sent: string;
      received: string;
      netFlow: string;
    };
    patterns: {
      hourlyDistribution: Array<{
        hour: number;
        count: number;
        volume: string;
      }>;
      topContacts: Array<{
        address: string;
        type: "sender" | "receiver" | "both";
        transactions: number;
        volume: string;
        lastInteraction: number;
      }>;
      unusualActivities: Array<{
        type: string;
        description: string;
        timestamp: number;
        severity: "low" | "medium" | "high";
      }>;
    };
  };
  risk?: {
    score: number;
    level: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    factors: Array<{
      name: string;
      impact: "POSITIVE" | "NEUTRAL" | "NEGATIVE";
      description: string;
    }>;
    warnings: string[];
    recommendations: string[];
  };
  summary: {
    totalAssetValue: string;
    activeContracts: number;
    transactionCount: number;
    uniqueContacts: number;
    avgDailyTransactions: number;
    avgTransactionValue: string;
  };
}

export class AccountAnalysisChain extends BaseChain {
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
    return "account_analysis";
  }

  async _call(values: ChainValues): Promise<ChainValues> {
    try {
      const input = values.input as AccountAnalysisInput;
      const output: AccountAnalysisOutput = {
        account: null,
        summary: {
          totalAssetValue: "0",
          activeContracts: 0,
          transactionCount: 0,
          uniqueContacts: 0,
          avgDailyTransactions: 0,
          avgTransactionValue: "0"
        }
      };

      // 获取账户信息
      output.account = await this.getAccountInfo(input.address);

      // 获取代币信息
      if (input.options?.includeTokens) {
        output.tokens = await this.getTokenBalances(input.address);
      }

      // 获取合约交互信息
      if (input.options?.includeContracts) {
        output.contracts = await this.getContractInteractions(
          input.address,
          input.timeframe
        );
      }

      // 获取活动信息
      if (input.options?.includeActivity) {
        output.activity = await this.getActivityInfo(
          input.address,
          input.timeframe
        );
      }

      // 计算风险评估
      if (input.options?.calculateRisk) {
        output.risk = await this.calculateRisk(
          input.address,
          output
        );
      }

      // 生成汇总信息
      output.summary = this.generateSummary(output);

      return { output };
    } catch (error) {
      if (error instanceof Error) {
        logger.error("Account Analysis Chain", `Analysis failed: ${error.message}`);
      }
      throw error;
    }
  }

  private async getAccountInfo(address: string): Promise<AccountAnalysisOutput["account"]> {
    try {
      // 获取账户基本信息
      const accountResult = await this.accountManager._call(JSON.stringify({
        action: "get-account",
        address
      }));
      const accountData = JSON.parse(accountResult);

      // 获取首次出现时间
      const firstTx = await this.getFirstTransaction(address);
      const lastTx = await this.getLastTransaction(address);

      return {
        address,
        type: accountData.type,
        balance: accountData.balance,
        nonce: accountData.nonce,
        firstSeen: firstTx?.timestamp || 0,
        lastActive: lastTx?.timestamp || 0,
        code: accountData.code
      };
    } catch (error) {
      logger.error(
        "Account Analysis Chain",
        `Failed to get account info for ${address}: ${error.message}`
      );
      throw error;
    }
  }

  private async getTokenBalances(
    address: string
  ): Promise<AccountAnalysisOutput["tokens"]> {
    try {
      // 获取账户代币余额
      const accountResult = await this.accountManager._call(JSON.stringify({
        action: "get-account",
        address,
        includeTokens: true
      }));
      const accountData = JSON.parse(accountResult);

      if (!accountData.tokens) return [];

      // TODO: 获取代币价格和百分比
      return accountData.tokens.map(token => ({
        ...token,
        value: "0", // 需要从价格预言机获取
        percentage: 0 // 需要计算
      }));
    } catch (error) {
      logger.error(
        "Account Analysis Chain",
        `Failed to get token balances for ${address}: ${error.message}`
      );
      return [];
    }
  }

  private async getContractInteractions(
    address: string,
    timeframe?: AccountAnalysisInput["timeframe"]
  ): Promise<AccountAnalysisOutput["contracts"]> {
    try {
      // 获取交易历史
      const db = this.dbManager.getAdapter();
      const transactions = await db.listTransactions({
        address,
        startTime: timeframe?.start ? new Date(timeframe.start) : undefined,
        endTime: timeframe?.end ? new Date(timeframe.end) : undefined
      });

      // 统计合约交互
      const contractStats = new Map<string, {
        interactions: number;
        lastInteraction: number;
      }>();

      transactions.forEach(tx => {
        if (tx.to && tx.to !== address) {
          const stats = contractStats.get(tx.to) || {
            interactions: 0,
            lastInteraction: 0
          };
          stats.interactions++;
          stats.lastInteraction = Math.max(
            stats.lastInteraction,
            tx.timestamp.getTime()
          );
          contractStats.set(tx.to, stats);
        }
      });

      // 获取合约信息
      const contracts: AccountAnalysisOutput["contracts"] = [];
      for (const [contractAddress, stats] of contractStats.entries()) {
        try {
          const code = await this.queryTool._call(JSON.stringify({
            action: "get-account",
            address: contractAddress
          }));
          const contractData = JSON.parse(code);

          if (contractData.type === "contract") {
            contracts.push({
              address: contractAddress,
              type: this.identifyContractType(contractData.code),
              interactions: stats.interactions,
              lastInteraction: stats.lastInteraction,
              risk: await this.assessContractRisk(contractAddress, contractData.code)
            });
          }
        } catch (error) {
          logger.warn(
            "Account Analysis Chain",
            `Failed to get contract info for ${contractAddress}: ${error.message}`
          );
        }
      }

      return contracts;
    } catch (error) {
      logger.error(
        "Account Analysis Chain",
        `Failed to get contract interactions for ${address}: ${error.message}`
      );
      return [];
    }
  }

  private async getActivityInfo(
    address: string,
    timeframe?: AccountAnalysisInput["timeframe"]
  ): Promise<AccountAnalysisOutput["activity"]> {
    try {
      // 获取交易历史
      const db = this.dbManager.getAdapter();
      const transactions = await db.listTransactions({
        address,
        startTime: timeframe?.start ? new Date(timeframe.start) : undefined,
        endTime: timeframe?.end ? new Date(timeframe.end) : undefined
      });

      // 初始化统计数据
      const activity: AccountAnalysisOutput["activity"] = {
        transactions: {
          total: transactions.length,
          sent: 0,
          received: 0,
          failed: 0,
          avgGasUsed: "0",
          totalGasCost: "0"
        },
        volume: {
          sent: "0",
          received: "0",
          netFlow: "0"
        },
        patterns: {
          hourlyDistribution: Array(24).fill(null).map((_, hour) => ({
            hour,
            count: 0,
            volume: "0"
          })),
          topContacts: [],
          unusualActivities: []
        }
      };

      // 统计交易数据
      let totalGasUsed = BigInt(0);
      let totalGasCost = BigInt(0);
      let sentVolume = BigInt(0);
      let receivedVolume = BigInt(0);

      // 统计联系人
      const contacts = new Map<string, {
        sent: number;
        received: number;
        volume: bigint;
        lastInteraction: number;
      }>();

      transactions.forEach(tx => {
        // 交易统计
        if (tx.from === address) {
          activity.transactions.sent++;
          sentVolume += BigInt(tx.value);
          
          // 更新联系人统计
          if (tx.to) {
            const contact = contacts.get(tx.to) || {
              sent: 0,
              received: 0,
              volume: BigInt(0),
              lastInteraction: 0
            };
            contact.sent++;
            contact.volume += BigInt(tx.value);
            contact.lastInteraction = Math.max(
              contact.lastInteraction,
              tx.timestamp.getTime()
            );
            contacts.set(tx.to, contact);
          }
        } else if (tx.to === address) {
          activity.transactions.received++;
          receivedVolume += BigInt(tx.value);
          
          // 更新联系人统计
          const contact = contacts.get(tx.from) || {
            sent: 0,
            received: 0,
            volume: BigInt(0),
            lastInteraction: 0
          };
          contact.received++;
          contact.volume += BigInt(tx.value);
          contact.lastInteraction = Math.max(
            contact.lastInteraction,
            tx.timestamp.getTime()
          );
          contacts.set(tx.from, contact);
        }

        if (tx.status !== "confirmed") {
          activity.transactions.failed++;
        }

        // Gas 统计
        if (tx.gasUsed) {
          totalGasUsed += BigInt(tx.gasUsed);
          if (tx.gasPrice) {
            totalGasCost += BigInt(tx.gasUsed) * BigInt(tx.gasPrice);
          }
        }

        // 小时分布统计
        const hour = new Date(tx.timestamp).getHours();
        activity.patterns.hourlyDistribution[hour].count++;
        activity.patterns.hourlyDistribution[hour].volume = (
          BigInt(activity.patterns.hourlyDistribution[hour].volume) +
          BigInt(tx.value)
        ).toString();
      });

      // 更新统计结果
      activity.transactions.avgGasUsed = (
        totalGasUsed / BigInt(Math.max(1, transactions.length))
      ).toString();
      activity.transactions.totalGasCost = totalGasCost.toString();
      
      activity.volume.sent = sentVolume.toString();
      activity.volume.received = receivedVolume.toString();
      activity.volume.netFlow = (receivedVolume - sentVolume).toString();

      // 生成联系人排名
      activity.patterns.topContacts = Array.from(contacts.entries())
        .map(([address, stats]) => ({
          address,
          type: stats.sent > 0 && stats.received > 0
            ? "both"
            : stats.sent > 0
              ? "sender"
              : "receiver",
          transactions: stats.sent + stats.received,
          volume: stats.volume.toString(),
          lastInteraction: stats.lastInteraction
        }))
        .sort((a, b) => b.transactions - a.transactions)
        .slice(0, 10);

      // 检测异常活动
      activity.patterns.unusualActivities = await this.detectUnusualActivities(
        transactions,
        address
      );

      return activity;
    } catch (error) {
      logger.error(
        "Account Analysis Chain",
        `Failed to get activity info for ${address}: ${error.message}`
      );
      throw error;
    }
  }

  private async calculateRisk(
    address: string,
    data: AccountAnalysisOutput
  ): Promise<AccountAnalysisOutput["risk"]> {
    const risk: AccountAnalysisOutput["risk"] = {
      score: 0,
      level: "LOW",
      factors: [],
      warnings: [],
      recommendations: []
    };

    try {
      // 评估账户年龄
      const accountAge = Date.now() - data.account.firstSeen;
      if (accountAge < 7 * 24 * 60 * 60 * 1000) { // 7天
        risk.factors.push({
          name: "account_age",
          impact: "NEGATIVE",
          description: "Account is relatively new"
        });
        risk.score += 2;
      } else if (accountAge > 180 * 24 * 60 * 60 * 1000) { // 180天
        risk.factors.push({
          name: "account_age",
          impact: "POSITIVE",
          description: "Account has long history"
        });
      }

      // 评估交易模式
      if (data.activity) {
        // 检查失败率
        const failureRate = data.activity.transactions.failed / data.activity.transactions.total;
        if (failureRate > 0.1) {
          risk.factors.push({
            name: "transaction_failures",
            impact: "NEGATIVE",
            description: "High transaction failure rate"
          });
          risk.score += 1;
        }

        // 检查交易集中度
        const topContactVolume = BigInt(data.activity.patterns.topContacts[0]?.volume || "0");
        const totalVolume = BigInt(data.activity.volume.sent) + BigInt(data.activity.volume.received);
        if (topContactVolume > totalVolume * BigInt(80) / BigInt(100)) {
          risk.factors.push({
            name: "volume_concentration",
            impact: "NEGATIVE",
            description: "High volume concentration with single counterparty"
          });
          risk.score += 2;
        }
      }

      // 评估合约交互
      if (data.contracts) {
        const riskyContracts = data.contracts.filter(c => 
          c.risk.level === "HIGH" || c.risk.level === "CRITICAL"
        );
        if (riskyContracts.length > 0) {
          risk.factors.push({
            name: "risky_contracts",
            impact: "NEGATIVE",
            description: "Interactions with high-risk contracts"
          });
          risk.score += riskyContracts.length;
          
          risk.warnings.push(
            `Interacting with ${riskyContracts.length} high-risk contracts`
          );
        }
      }

      // 评估资产分布
      if (data.tokens) {
        const highConcentration = data.tokens.some(t => t.percentage > 80);
        if (highConcentration) {
          risk.factors.push({
            name: "token_concentration",
            impact: "NEGATIVE",
            description: "High concentration in single token"
          });
          risk.score += 1;
        }
      }

      // 确定风险等级
      if (risk.score >= 6) {
        risk.level = "CRITICAL";
      } else if (risk.score >= 4) {
        risk.level = "HIGH";
      } else if (risk.score >= 2) {
        risk.level = "MEDIUM";
      }

      // 生成建议
      if (risk.level !== "LOW") {
        risk.recommendations = this.generateRiskRecommendations(risk.factors);
      }

      return risk;
    } catch (error) {
      logger.error(
        "Account Analysis Chain",
        `Failed to calculate risk for ${address}: ${error.message}`
      );
      throw error;
    }
  }

  private async getFirstTransaction(address: string): Promise<{
    hash: string;
    timestamp: number;
  } | null> {
    try {
      const db = this.dbManager.getAdapter();
      const transactions = await db.listTransactions({
        address,
        limit: 1
      });
      
      if (transactions.length === 0) return null;
      
      return {
        hash: transactions[0].hash,
        timestamp: transactions[0].timestamp.getTime()
      };
    } catch (error) {
      logger.warn(
        "Account Analysis Chain",
        `Failed to get first transaction for ${address}: ${error.message}`
      );
      return null;
    }
  }

  private async getLastTransaction(address: string): Promise<{
    hash: string;
    timestamp: number;
  } | null> {
    try {
      const db = this.dbManager.getAdapter();
      const transactions = await db.listTransactions({
        address,
        limit: 1,
        // TODO: 添加排序参数
      });
      
      if (transactions.length === 0) return null;
      
      return {
        hash: transactions[0].hash,
        timestamp: transactions[0].timestamp.getTime()
      };
    } catch (error) {
      logger.warn(
        "Account Analysis Chain",
        `Failed to get last transaction for ${address}: ${error.message}`
      );
      return null;
    }
  }

  private identifyContractType(code: string): string {
    // TODO: 实现合约类型识别逻辑
    return "unknown";
  }

  private async assessContractRisk(
    address: string,
    code: string
  ): Promise<{ level: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"; factors: string[] }> {
    // TODO: 实现合约风险评估逻辑
    return {
      level: "LOW",
      factors: []
    };
  }

  private async detectUnusualActivities(
    transactions: any[],
    address: string
  ): Promise<AccountAnalysisOutput["activity"]["patterns"]["unusualActivities"]> {
    const activities: AccountAnalysisOutput["activity"]["patterns"]["unusualActivities"] = [];

    // 检测大额交易
    const avgValue = transactions.reduce(
      (sum, tx) => sum + BigInt(tx.value),
      BigInt(0)
    ) / BigInt(transactions.length);

    transactions.forEach(tx => {
      const value = BigInt(tx.value);
      if (value > avgValue * BigInt(10)) {
        activities.push({
          type: "large_transaction",
          description: "Unusually large transaction detected",
          timestamp: tx.timestamp.getTime(),
          severity: "medium"
        });
      }
    });

    // 检测高频交易
    const timeGroups = new Map<number, number>();
    transactions.forEach(tx => {
      const hour = Math.floor(tx.timestamp.getTime() / (60 * 60 * 1000));
      timeGroups.set(hour, (timeGroups.get(hour) || 0) + 1);
    });

    timeGroups.forEach((count, hour) => {
      if (count > 10) { // 每小时超过10笔交易
        activities.push({
          type: "high_frequency",
          description: "High frequency trading detected",
          timestamp: hour * 60 * 60 * 1000,
          severity: "medium"
        });
      }
    });

    // 检测异常失败
    const failedTxs = transactions.filter(tx => tx.status !== "confirmed");
    if (failedTxs.length > transactions.length * 0.2) { // 失败率超过20%
      activities.push({
        type: "high_failure_rate",
        description: "High transaction failure rate detected",
        timestamp: Date.now(),
        severity: "high"
      });
    }

    return activities;
  }

  private generateRiskRecommendations(
    factors: AccountAnalysisOutput["risk"]["factors"]
  ): string[] {
    const recommendations: string[] = [];

    factors.forEach(factor => {
      if (factor.impact === "NEGATIVE") {
        switch (factor.name) {
          case "account_age":
            recommendations.push(
              "Consider waiting for account to establish longer history before large transactions"
            );
            break;
          case "transaction_failures":
            recommendations.push(
              "Review transaction parameters and gas settings to reduce failure rate"
            );
            break;
          case "volume_concentration":
            recommendations.push(
              "Consider diversifying transaction counterparties to reduce concentration risk"
            );
            break;
          case "risky_contracts":
            recommendations.push(
              "Review and audit smart contracts before interaction"
            );
            break;
          case "token_concentration":
            recommendations.push(
              "Consider diversifying token holdings to reduce concentration risk"
            );
            break;
        }
      }
    });

    return recommendations;
  }

  private generateSummary(data: AccountAnalysisOutput): AccountAnalysisOutput["summary"] {
    let totalAssetValue = BigInt(data.account.balance);
    if (data.tokens) {
      totalAssetValue += data.tokens.reduce(
        (sum, token) => sum + BigInt(token.value),
        BigInt(0)
      );
    }

    const activeContracts = data.contracts?.filter(c =>
      Date.now() - c.lastInteraction < 30 * 24 * 60 * 60 * 1000 // 30天内活跃
    ).length || 0;

    const txCount = data.activity?.transactions.total || 0;
    const uniqueContacts = new Set(
      data.activity?.patterns.topContacts.map(c => c.address) || []
    ).size;

    let avgDailyTx = 0;
    let avgTxValue = "0";
    if (data.activity) {
      const days = Math.ceil(
        (data.account.lastActive - data.account.firstSeen) /
        (24 * 60 * 60 * 1000)
      );
      avgDailyTx = txCount / Math.max(1, days);

      const totalVolume = BigInt(data.activity.volume.sent) + BigInt(data.activity.volume.received);
      avgTxValue = (totalVolume / BigInt(Math.max(1, txCount))).toString();
    }

    return {
      totalAssetValue: totalAssetValue.toString(),
      activeContracts,
      transactionCount: txCount,
      uniqueContacts,
      avgDailyTransactions: avgDailyTx,
      avgTransactionValue: avgTxValue
    };
  }
} 