import { Chain } from '@thirdweb-dev/chains';
import { Connection, PublicKey } from '@solana/web3.js';
import { ProtocolAdapter } from './index';
import { DeFiProtocol, CrawlerConfig, LiquidityPool, RiskMetrics } from '../types';
import { PriceOraclePlugin } from '@lumix/plugin-price-oracle';
import { logger } from '@lumix/core';

// Raydium 程序 ID
const PROGRAM_IDS = {
  AMM_V4: '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8',
  STAKE: '93wH4UjGGDZFqV1nGBnkjYUYdk1GCEPbhi7uBgBEZLzF',
  FARM: 'EhhTKczWMGQt46ynNeRX1WfeagwwJd7ufHvCDjRxjo5Q',
  IDO: '6FJon3QE27qgPVggARueB22hLvoh22VzJpXv4rBEoSLF'
};

// Raydium AMM 布局
const AMM_INFO_LAYOUT = {
  status: 0,
  nonce: 8,
  orderNum: 16,
  depth: 24,
  coinDecimals: 32,
  pcDecimals: 40,
  state: 48,
  resetFlag: 56,
  minSize: 64,
  volMaxCutRatio: 72,
  amountWaveRatio: 80,
  coinLotSize: 88,
  pcLotSize: 96,
  minPriceMultiplier: 104,
  maxPriceMultiplier: 112,
  systemDecimalsValue: 120,
  poolCoinTokenAccount: 128,
  poolPcTokenAccount: 160,
  coinMintAddress: 192,
  pcMintAddress: 224,
  lpMintAddress: 256,
  ammOpenOrders: 288,
  serumMarket: 320,
  serumProgramId: 352,
  ammTargetOrders: 384,
  poolWithdrawQueue: 416,
  poolTempLpTokenAccount: 448,
  ammOwner: 480,
  pnlOwner: 512
};

export class RaydiumAdapter implements ProtocolAdapter {
  public readonly name = 'raydium';
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
      return accountInfo?.owner.toString() === PROGRAM_IDS.AMM_V4;
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
        name: 'Raydium',
        contractAddress: PROGRAM_IDS.AMM_V4,
        tvl,
        risks,
        liquidityPools: pools,
        governance: {
          token: 'RAY',
          votingSystem: 'Staking Governance',
          proposalCount: 0,
          totalVotingPower: 0
        },
        createdAt: 1615564800000, // 2021-03-13
        updatedAt: Date.now()
      };
    } catch (error) {
      logger.error('Raydium', `Failed to get protocol info: ${error.message}`);
      throw error;
    }
  }

  public async getLiquidityPools(address: string): Promise<LiquidityPool[]> {
    try {
      const cacheKey = 'pools';
      const cached = this.getFromCache(cacheKey);
      if (cached) return cached;

      // 获取所有 AMM 账户
      const accounts = await this.connection.getProgramAccounts(
        new PublicKey(PROGRAM_IDS.AMM_V4),
        {
          filters: [
            {
              dataSize: 544 // AMM 账户大小
            }
          ]
        }
      );

      const pools = await Promise.all(
        accounts.map(async ({ pubkey, account }) => {
          try {
            return await this.getPoolInfo(pubkey, account.data);
          } catch (error) {
            logger.error('Raydium', `Failed to get pool info: ${error.message}`);
            return null;
          }
        })
      );

      const validPools = pools.filter(Boolean) as LiquidityPool[];
      this.setCache(cacheKey, validPools);
      return validPools;
    } catch (error) {
      logger.error('Raydium', `Failed to get liquidity pools: ${error.message}`);
      return [];
    }
  }

  private async getPoolInfo(pubkey: PublicKey, data: Buffer): Promise<LiquidityPool | null> {
    try {
      // 解析 AMM 数据
      const ammInfo = this.decodeAMMData(data);
      
      // 获取代币信息
      const [baseToken, quoteToken] = await Promise.all([
        this.getTokenInfo(ammInfo.coinMintAddress),
        this.getTokenInfo(ammInfo.pcMintAddress)
      ]);

      // 获取池子余额
      const [baseBalance, quoteBalance] = await Promise.all([
        this.getTokenBalance(ammInfo.poolCoinTokenAccount),
        this.getTokenBalance(ammInfo.poolPcTokenAccount)
      ]);

      // 获取代币价格
      const [basePrice, quotePrice] = await Promise.all([
        this.priceOracle.getPrice({
          chain: this.chain.name,
          baseToken: baseToken.address,
          quoteToken: 'USD'
        }),
        this.priceOracle.getPrice({
          chain: this.chain.name,
          baseToken: quoteToken.address,
          quoteToken: 'USD'
        })
      ]);

      // 计算 TVL
      const tvl = 
        (baseBalance * basePrice.price) +
        (quoteBalance * quotePrice.price);

      // 获取交易量
      const volume24h = await this.getPoolVolume(pubkey.toString());

      // 计算 APY
      const apy = await this.calculatePoolAPY(pubkey.toString(), tvl);

      return {
        pair: `${baseToken.symbol}/${quoteToken.symbol}`,
        volume24h,
        feeRate: 0.0025, // 0.25%
        tvl,
        apy,
        analysis: {
          price: quoteBalance / baseBalance,
          depth: tvl,
          impermanentLoss: await this.calculateImpermanentLoss(baseToken.address, quoteToken.address)
        }
      };
    } catch (error) {
      logger.error('Raydium', `Failed to get pool info: ${error.message}`);
      return null;
    }
  }

  private decodeAMMData(data: Buffer): any {
    const layout = AMM_INFO_LAYOUT;
    return {
      status: data.readUInt8(layout.status),
      nonce: data.readUInt8(layout.nonce),
      orderNum: data.readUInt64LE(layout.orderNum),
      depth: data.readUInt64LE(layout.depth),
      coinDecimals: data.readUInt8(layout.coinDecimals),
      pcDecimals: data.readUInt8(layout.pcDecimals),
      state: data.readUInt8(layout.state),
      resetFlag: data.readUInt8(layout.resetFlag),
      minSize: data.readUInt64LE(layout.minSize),
      volMaxCutRatio: data.readUInt64LE(layout.volMaxCutRatio),
      amountWaveRatio: data.readUInt64LE(layout.amountWaveRatio),
      coinLotSize: data.readUInt64LE(layout.coinLotSize),
      pcLotSize: data.readUInt64LE(layout.pcLotSize),
      minPriceMultiplier: data.readUInt64LE(layout.minPriceMultiplier),
      maxPriceMultiplier: data.readUInt64LE(layout.maxPriceMultiplier),
      systemDecimalsValue: data.readUInt64LE(layout.systemDecimalsValue),
      poolCoinTokenAccount: new PublicKey(data.slice(layout.poolCoinTokenAccount, layout.poolCoinTokenAccount + 32)),
      poolPcTokenAccount: new PublicKey(data.slice(layout.poolPcTokenAccount, layout.poolPcTokenAccount + 32)),
      coinMintAddress: new PublicKey(data.slice(layout.coinMintAddress, layout.coinMintAddress + 32)),
      pcMintAddress: new PublicKey(data.slice(layout.pcMintAddress, layout.pcMintAddress + 32)),
      lpMintAddress: new PublicKey(data.slice(layout.lpMintAddress, layout.lpMintAddress + 32)),
      ammOpenOrders: new PublicKey(data.slice(layout.ammOpenOrders, layout.ammOpenOrders + 32)),
      serumMarket: new PublicKey(data.slice(layout.serumMarket, layout.serumMarket + 32)),
      serumProgramId: new PublicKey(data.slice(layout.serumProgramId, layout.serumProgramId + 32)),
      ammTargetOrders: new PublicKey(data.slice(layout.ammTargetOrders, layout.ammTargetOrders + 32)),
      poolWithdrawQueue: new PublicKey(data.slice(layout.poolWithdrawQueue, layout.poolWithdrawQueue + 32)),
      poolTempLpTokenAccount: new PublicKey(data.slice(layout.poolTempLpTokenAccount, layout.poolTempLpTokenAccount + 32)),
      ammOwner: new PublicKey(data.slice(layout.ammOwner, layout.ammOwner + 32)),
      pnlOwner: new PublicKey(data.slice(layout.pnlOwner, layout.pnlOwner + 32))
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
      // 获取 RAY 代币价格
      const rayPrice = await this.priceOracle.getPrice({
        chain: this.chain.name,
        baseToken: 'RAY',
        quoteToken: 'USD'
      });

      // 获取每日奖励
      const dailyRewards = await this.getDailyRewards(address);
      const yearlyRewardValue = dailyRewards * rayPrice.price * 365;

      return tvl > 0 ? (yearlyRewardValue / tvl) * 100 : 0;
    } catch (error) {
      logger.error('Raydium', `Failed to calculate pool APY: ${error.message}`);
      return 0;
    }
  }

  private async getDailyRewards(address: string): Promise<number> {
    // TODO: 实现从 Farm 程序获取每日奖励
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
      logger.error('Raydium', `Failed to calculate impermanent loss: ${error.message}`);
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
        'Serum DEX dependency'
      ],
      securityScore: 85
    };
  }

  public async getYieldStrategies(address: string): Promise<any[]> {
    // TODO: 实现收益策略获取逻辑
    return [];
  }

  public async getGovernanceInfo(address: string): Promise<any> {
    // TODO: 实现治理信息获取逻辑
    return {
      token: 'RAY',
      votingSystem: 'Staking Governance'
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