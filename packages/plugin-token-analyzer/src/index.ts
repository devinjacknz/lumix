import { Connection, PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { Decimal } from 'decimal.js';
import axios from 'axios';
import { SolanaPlugin } from '@lumix/plugin-solana';
import {
  TokenAnalyzerConfig,
  TokenMetrics,
  TokenHolding,
  TokenActivity,
  TokenDistribution,
  TokenAnalysis,
  PriceData
} from './types';

export class TokenAnalyzerPlugin {
  private connection: Connection;
  private solana: SolanaPlugin;
  private config: TokenAnalyzerConfig;

  constructor(config: TokenAnalyzerConfig) {
    this.connection = new Connection(config.rpcUrl);
    this.solana = new SolanaPlugin({
      rpcUrl: config.rpcUrl,
      wallet: config.wallet
    });
    this.config = config;
  }

  /**
   * Get comprehensive token metrics
   */
  async getTokenMetrics(tokenAddress: string): Promise<TokenMetrics> {
    const [supply, holders, priceData] = await Promise.all([
      this.getTokenSupply(tokenAddress),
      this.getHolderCount(tokenAddress),
      this.getTokenPrice(tokenAddress)
    ]);

    const marketCap = priceData ? supply.mul(priceData.current) : new Decimal(0);

    return {
      address: tokenAddress,
      supply,
      holders,
      price: priceData || {
        current: new Decimal(0),
        change24h: new Decimal(0),
        volume24h: new Decimal(0),
        lastUpdate: new Date().toISOString()
      },
      marketCap,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Get token holdings for an address
   */
  async getTokenHoldings(address: string): Promise<TokenHolding[]> {
    const tokenAccounts = await this.connection.getParsedTokenAccountsByOwner(
      new PublicKey(address),
      { programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA') }
    );

    return tokenAccounts.value.map(account => ({
      token: account.account.data.parsed.info.mint,
      balance: new Decimal(account.account.data.parsed.info.tokenAmount.amount),
      decimals: account.account.data.parsed.info.tokenAmount.decimals
    }));
  }

  /**
   * Get token activity history
   */
  async getTokenActivity(tokenAddress: string, limit = 100): Promise<TokenActivity[]> {
    const signatures = await this.connection.getSignaturesForAddress(
      new PublicKey(tokenAddress),
      { limit }
    );

    const activities: TokenActivity[] = [];

    for (const sig of signatures) {
      const tx = await this.connection.getParsedTransaction(sig.signature);
      if (!tx?.meta) continue;

      activities.push({
        type: this.getActivityType(tx),
        amount: this.getTransactionAmount(tx),
        timestamp: new Date(sig.blockTime! * 1000).toISOString(),
        signature: sig.signature,
        from: this.getTransactionSender(tx),
        to: this.getTransactionReceiver(tx)
      });
    }

    return activities;
  }

  /**
   * Get token holder distribution
   */
  async getTokenDistribution(tokenAddress: string): Promise<TokenDistribution> {
    const largeAccounts = await this.connection.getTokenLargestAccounts(
      new PublicKey(tokenAddress)
    );

    const total = largeAccounts.value.reduce(
      (sum, account) => sum.add(new Decimal(account.amount)),
      new Decimal(0)
    );

    const holders = largeAccounts.value.map(account => ({
      address: account.address.toString(),
      balance: new Decimal(account.amount),
      percentage: new Decimal(account.amount).div(total).mul(100)
    }));

    return {
      token: tokenAddress,
      holders: holders.sort((a, b) => b.percentage.minus(a.percentage).toNumber()),
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Analyze token metrics and patterns
   */
  async analyzeToken(tokenAddress: string): Promise<TokenAnalysis> {
    const [metrics, distribution, activity] = await Promise.all([
      this.getTokenMetrics(tokenAddress),
      this.getTokenDistribution(tokenAddress),
      this.getTokenActivity(tokenAddress)
    ]);

    // Calculate concentration metrics
    const topHoldersPercentage = distribution.holders
      .slice(0, 10)
      .reduce((sum, h) => sum.add(h.percentage), new Decimal(0));

    // Analyze transfer patterns
    const transferVolume = activity
      .filter(a => a.type === 'transfer')
      .reduce((sum, a) => sum.add(a.amount), new Decimal(0));

    return {
      token: tokenAddress,
      metrics,
      analysis: {
        concentration: {
          topHoldersPercentage,
          holderCount: metrics.holders,
          giniCoefficient: this.calculateGiniCoefficient(distribution.holders)
        },
        activity: {
          transferVolume,
          uniqueSenders: new Set(activity.map(a => a.from)).size,
          uniqueReceivers: new Set(activity.map(a => a.to)).size
        }
      },
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Get token total supply
   */
  private async getTokenSupply(tokenAddress: string): Promise<Decimal> {
    const supply = await this.connection.getTokenSupply(new PublicKey(tokenAddress));
    return new Decimal(supply.value.amount);
  }

  /**
   * Get token holder count
   */
  private async getHolderCount(tokenAddress: string): Promise<number> {
    const accounts = await this.connection.getParsedTokenAccountsByOwner(
      new PublicKey(tokenAddress),
      { programId: TOKEN_PROGRAM_ID }
    );
    return accounts.value.length;
  }

  /**
   * Get token price from external API
   */
  private async getTokenPrice(tokenAddress: string): Promise<PriceData | null> {
    try {
      const response = await axios.get(
        `${this.config.apiEndpoint}/price/${tokenAddress}`
      );
      const data = response.data;
      return {
        current: new Decimal(data.price),
        change24h: new Decimal(data.change24h || 0),
        volume24h: new Decimal(data.volume24h || 0),
        lastUpdate: data.lastUpdate || new Date().toISOString()
      };
    } catch {
      return null;
    }
  }

  /**
   * Calculate Gini coefficient for token distribution
   */
  private calculateGiniCoefficient(holders: { balance: Decimal }[]): Decimal {
    const n = holders.length;
    if (n === 0) return new Decimal(0);

    const sortedBalances = holders
      .map(h => h.balance)
      .sort((a, b) => a.minus(b).toNumber());

    let sumOfDifferences = new Decimal(0);
    let sumOfBalances = new Decimal(0);

    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        sumOfDifferences = sumOfDifferences.add(
          sortedBalances[i].minus(sortedBalances[j]).abs()
        );
      }
      sumOfBalances = sumOfBalances.add(sortedBalances[i]);
    }

    return sumOfDifferences.div(2).div(n).div(sumOfBalances.div(n));
  }

  private getActivityType(tx: any): 'transfer' | 'mint' | 'burn' | 'approve' {
    // Implement transaction type detection logic
    const instruction = tx.meta?.innerInstructions?.[0]?.instructions?.[0];
    if (!instruction) return 'transfer';

    switch (instruction.program) {
      case 'spl-token':
        switch (instruction.parsed.type) {
          case 'mintTo':
            return 'mint';
          case 'burn':
            return 'burn';
          case 'approve':
            return 'approve';
          default:
            return 'transfer';
        }
      default:
        return 'transfer';
    }
  }

  private getTransactionAmount(tx: any): Decimal {
    // Implement amount extraction logic
    return new Decimal(0);
  }

  private getTransactionSender(tx: any): string {
    // Implement sender extraction logic
    return '';
  }

  private getTransactionReceiver(tx: any): string {
    // Implement receiver extraction logic
    return '';
  }
}

export * from './types';
