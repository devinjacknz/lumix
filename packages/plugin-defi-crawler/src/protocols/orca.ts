import { Chain } from '@thirdweb-dev/chains';
import { Connection, PublicKey } from '@solana/web3.js';
import { ProtocolAdapter } from './index';
import { DeFiProtocol, CrawlerConfig, LiquidityPool, RiskMetrics } from '../types';
import { PriceOraclePlugin } from '@lumix/plugin-price-oracle';
import { logger } from '@lumix/core';

// Orca 程序 ID
const PROGRAM_IDS = {
  WHIRLPOOL: 'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc',
  SWAP: '9W959DqEETiGZocYWCQPaJ6sBmUzgfxXfqGeTEdp3aQP',
  STAKE: 'DmRYs6Rf9zGtZsmvKRqx8vRnTUm8aDqMpzYyNbczFE7b'
};

// Whirlpool 状态布局
const WHIRLPOOL_LAYOUT = {
  tokenMintA: 0,
  tokenMintB: 32,
  tokenVaultA: 64,
  tokenVaultB: 96,
  tickSpacing: 128,
  tickCurrentIndex: 136,
  sqrtPrice: 144,
  liquidity: 152,
  feeRate: 160,
  protocolFeeRate: 168,
  feeGrowthGlobalA: 176,
  feeGrowthGlobalB: 192,
  protocolFeesTokenA: 208,
  protocolFeesTokenB: 224,
  bumps: 240
};

export class OrcaAdapter implements ProtocolAdapter {
  public readonly name = 'orca';
  public readonly chain: Chain;
  private connection: Connection;
  private priceOracle: PriceOraclePlugin;
  private cache: Map<string, any>;
  private cacheTimeout: number;

  constructor(config: CrawlerConfig) {
    this.chain = config.chains[0];
    this.connection = new Connection(config.rpcUrl);
    this.priceOracle = new PriceOraclePlugin();
    this.cache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5分钟缓存
  }

  public async isSupported(address: string): Promise<boolean> {
    try {
      const programId = new PublicKey(address);
      const accountInfo = await this.connection.getAccountInfo(programId);
      return accountInfo?.owner.toString() === PROGRAM_IDS.WHIRLPOOL;
    } catch (error) {
      return false;
    }
  }

  public async getProtocolInfo(address: string): Promise<DeFiProtocol> {
    try {
      // 获取所有流动性池
      const pools = await this.getLiquidityPools(address);
      
      // 计算总 TVL
      const tvl = pools.reduce((sum, pool) => sum + pool.tvl, 0);

      // 分析风险
      const risks = await this.analyzeRisks();

      return {
        chain: this.chain.name,
        name: 'Orca',
        contractAddress: PROGRAM_IDS.WHIRLPOOL,
        tvl,
        risks,
        liquidityPools: pools,
        governance: {
          token: 'ORCA',
          votingSystem: 'Impact Voting',
          proposalCount: 0,
          totalVotingPower: 0
        },
        createdAt: 1623196800000, // 2021-06-09
        updatedAt: Date.now()
      };
    } catch (error) {
      logger.error('Orca', `Failed to get protocol info: ${error.message}`);
      throw error;
    }
  }

  public async getLiquidityPools(address: string): Promise<LiquidityPool[]> {
    try {
      const cacheKey = 'pools';
      const cached = this.getFromCache(cacheKey);
      if (cached) return cached;

      // 获取所有 Whirlpool 账户
      const accounts = await this.connection.getProgramAccounts(
        new PublicKey(PROGRAM_IDS.WHIRLPOOL),
        {
          filters: [
            {
              dataSize: 256 // Whirlpool 账户大小
            }
          ]
        }
      );

      const pools = await Promise.all(
        accounts.map(async ({ pubkey, account }) => {
          try {
            return await this.getPoolInfo(pubkey, account.data);
          } catch (error) {
            logger.error('Orca', `Failed to get pool info: ${error.message}`);
            return null;
          }
        })
      );

      const validPools = pools.filter(Boolean) as LiquidityPool[];
      this.setCache(cacheKey, validPools);
      return validPools;
    } catch (error) {
      logger.error('Orca', `Failed to get liquidity pools: ${error.message}`);
      return [];
    }
  }

  private async getPoolInfo(pubkey: PublicKey, data: Buffer): Promise<LiquidityPool | null> {
    try {
      // 解析 Whirlpool 数据
      const poolData = this.decodeWhirlpoolData(data);
      
      // 获取代币信息
      const [tokenA, tokenB] = await Promise.all([
        this.getTokenInfo(poolData.tokenMintA),
        this.getTokenInfo(poolData.tokenMintB)
      ]);

      // 获取代币余额
      const [balanceA, balanceB] = await Promise.all([
        this.getTokenBalance(poolData.tokenVaultA),
        this.getTokenBalance(poolData.tokenVaultB)
      ]);

      // 获取代币价格
      const [priceA, priceB] = await Promise.all([
        this.priceOracle.getPrice({
          chain: this.chain.name,
          baseToken: tokenA.address,
          quoteToken: 'USD'
        }),
        this.priceOracle.getPrice({
          chain: this.chain.name,
          baseToken: tokenB.address,
          quoteToken: 'USD'
        })
      ]);

      // 计算 TVL
      const tvl = 
        (balanceA * priceA.price) +
        (balanceB * priceB.price);

      // 获取交易量
      const volume24h = await this.getPoolVolume(pubkey.toString());

      // 计算 APY
      const apy = await this.calculatePoolAPY(pubkey.toString(), tvl);

      // 计算当前价格
      const sqrtPrice = poolData.sqrtPrice;
      const price = (sqrtPrice * sqrtPrice) / (1 << 64);

      return {
        pair: `${tokenA.symbol}/${tokenB.symbol}`,
        volume24h,
        feeRate: poolData.feeRate / 1000000, // 转换为百分比
        tvl,
        apy,
        analysis: {
          price,
          depth: tvl,
          impermanentLoss: await this.calculateImpermanentLoss(tokenA.address, tokenB.address)
        }
      };
    } catch (error) {
      logger.error('Orca', `Failed to get pool info: ${error.message}`);
      return null;
    }
  }

  private decodeWhirlpoolData(data: Buffer): any {
    const layout = WHIRLPOOL_LAYOUT;
    return {
      tokenMintA: new PublicKey(data.slice(layout.tokenMintA, layout.tokenMintA + 32)),
      tokenMintB: new PublicKey(data.slice(layout.tokenMintB, layout.tokenMintB + 32)),
      tokenVaultA: new PublicKey(data.slice(layout.tokenVaultA, layout.tokenVaultA + 32)),
      tokenVaultB: new PublicKey(data.slice(layout.tokenVaultB, layout.tokenVaultB + 32)),
      tickSpacing: data.readInt32LE(layout.tickSpacing),
      tickCurrentIndex: data.readInt32LE(layout.tickCurrentIndex),
      sqrtPrice: data.readBigUInt64LE(layout.sqrtPrice),
      liquidity: data.readBigUInt64LE(layout.liquidity),
      feeRate: data.readUInt32LE(layout.feeRate),
      protocolFeeRate: data.readUInt32LE(layout.protocolFeeRate),
      feeGrowthGlobalA: data.readBigUInt64LE(layout.feeGrowthGlobalA),
      feeGrowthGlobalB: data.readBigUInt64LE(layout.feeGrowthGlobalB),
      protocolFeesTokenA: data.readBigUInt64LE(layout.protocolFeesTokenA),
      protocolFeesTokenB: data.readBigUInt64LE(layout.protocolFeesTokenB),
      bumps: data.readUInt8(layout.bumps)
    };
  }

  private async getTokenInfo(address: PublicKey): Promise<{
    address: string;
    name: string;
    symbol: string;
    decimals: number;
  }> {
    const cacheKey = `token:${address.toString()}`;
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    const info = await this.connection.getParsedAccountInfo(address);
    const data = info.value?.data;
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid token account data');
    }

    const result = {
      address: address.toString(),
      name: data.parsed.info.name,
      symbol: data.parsed.info.symbol,
      decimals: data.parsed.info.decimals
    };

    this.setCache(cacheKey, result);
    return result;
  }

  private async getTokenBalance(address: PublicKey): Promise<number> {
    const accountInfo = await this.connection.getTokenAccountBalance(address);
    return Number(accountInfo.value.uiAmount);
  }

  private async calculatePoolAPY(address: string, tvl: number): Promise<number> {
    try {
      // 获取 ORCA 代币价格
      const orcaPrice = await this.priceOracle.getPrice({
        chain: this.chain.name,
        baseToken: 'ORCA',
        quoteToken: 'USD'
      });

      // 获取每日奖励
      const dailyRewards = await this.getDailyRewards(address);
      const yearlyRewardValue = dailyRewards * orcaPrice.price * 365;

      return tvl > 0 ? (yearlyRewardValue / tvl) * 100 : 0;
    } catch (error) {
      logger.error('Orca', `Failed to calculate pool APY: ${error.message}`);
      return 0;
    }
  }

  private async getDailyRewards(address: string): Promise<number> {
    // TODO: 实现从 Stake 程序获取每日奖励
    return 0;
  }

  private async calculateImpermanentLoss(
    token0: string,
    token1: string,
    days: number = 30
  ): Promise<number> {
    try {
      // 获取历史价格数据
      const [price0History, price1History] = await Promise.all([
        this.getHistoricalPrices(token0, days),
        this.getHistoricalPrices(token1, days)
      ]);

      // 计算价格变化
      const price0Change = price0History[price0History.length - 1] / price0History[0];
      const price1Change = price1History[price1History.length - 1] / price1History[0];

      // 计算无常损失
      const sqrtK = Math.sqrt(price0Change * price1Change);
      const impermanentLoss = 2 * sqrtK / (1 + sqrtK) - 1;

      return impermanentLoss * 100; // 转换为百分比
    } catch (error) {
      logger.error('Orca', `Failed to calculate impermanent loss: ${error.message}`);
      return 0;
    }
  }

  private async getHistoricalPrices(token: string, days: number): Promise<number[]> {
    // TODO: 实现获取历史价格数据
    return Array(days).fill(1);
  }

  private async getPoolVolume(address: string): Promise<number> {
    // TODO: 实现获取池子交易量
    return 0;
  }

  private async analyzeRisks(): Promise<RiskMetrics> {
    return {
      auditStatus: 'verified',
      insurance: false,
      centralizationRisks: [
        'Admin key control',
        'Price oracle dependency'
      ],
      securityScore: 88
    };
  }

  public async getYieldStrategies(address: string): Promise<any[]> {
    // TODO: 实现收益策略获取逻辑
    return [];
  }

  public async getGovernanceInfo(address: string): Promise<any> {
    // TODO: 实现治理信息获取逻辑
    return {
      token: 'ORCA',
      votingSystem: 'Impact Voting'
    };
  }

  public async getAnalytics(address: string): Promise<any> {
    // TODO: 实现分析指标获取逻辑
    return {
      uniqueUsers24h: 0,
      transactions24h: 0,
      fees24h: 0
    };
  }

  private getFromCache(key: string): any {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.data;
    }
    return null;
  }

  private setCache(key: string, data: any): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }
} 