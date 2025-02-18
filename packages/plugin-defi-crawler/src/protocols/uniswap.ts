import { Chain } from '@thirdweb-dev/chains';
import { ethers } from 'ethers';
import { ProtocolAdapter } from './index';
import { DeFiProtocol, CrawlerConfig, LiquidityPool, RiskMetrics } from '../types';
import { PriceOraclePlugin } from '@lumix/plugin-price-oracle';
import { logger } from '@lumix/core';

// Uniswap V2 工厂合约 ABI
const FACTORY_ABI = [
  'function allPairsLength() external view returns (uint)',
  'function allPairs(uint) external view returns (address)',
  'function getPair(address tokenA, address tokenB) external view returns (address pair)',
  'function feeTo() external view returns (address)',
  'function feeToSetter() external view returns (address)'
];

// Uniswap V2 对合约 ABI
const PAIR_ABI = [
  'function token0() external view returns (address)',
  'function token1() external view returns (address)',
  'function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
  'function totalSupply() external view returns (uint)',
  'function decimals() external view returns (uint8)',
  'function symbol() external view returns (string)',
  'function name() external view returns (string)'
];

// ERC20 代币 ABI
const ERC20_ABI = [
  'function name() external view returns (string)',
  'function symbol() external view returns (string)',
  'function decimals() external view returns (uint8)',
  'function totalSupply() external view returns (uint256)',
  'function balanceOf(address) external view returns (uint256)'
];

export class UniswapAdapter implements ProtocolAdapter {
  public readonly name = 'uniswap';
  public readonly chain: Chain;
  private provider: ethers.providers.JsonRpcProvider;
  private factoryAddress: string;
  private priceOracle: PriceOraclePlugin;
  private cache: Map<string, any>;
  private cacheTimeout: number;

  constructor(config: CrawlerConfig) {
    this.chain = config.chains[0]; // 使用配置的第一个链
    this.provider = new ethers.providers.JsonRpcProvider(config.rpcUrl);
    this.factoryAddress = '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f'; // Uniswap V2 工厂合约地址
    this.priceOracle = new PriceOraclePlugin();
    this.cache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5分钟缓存
  }

  public async isSupported(address: string): Promise<boolean> {
    try {
      const factory = new ethers.Contract(this.factoryAddress, FACTORY_ABI, this.provider);
      const code = await this.provider.getCode(address);
      
      // 检查是否是 Uniswap 工厂合约或对合约
      return (
        address.toLowerCase() === this.factoryAddress.toLowerCase() ||
        await factory.getPair(address, ethers.constants.AddressZero) !== ethers.constants.AddressZero
      );
    } catch (error) {
      return false;
    }
  }

  public async getProtocolInfo(address: string): Promise<DeFiProtocol> {
    try {
      const factory = new ethers.Contract(this.factoryAddress, FACTORY_ABI, this.provider);
      
      // 获取基本信息
      const [pairsLength, feeTo, feeToSetter] = await Promise.all([
        factory.allPairsLength(),
        factory.feeTo(),
        factory.feeToSetter()
      ]);

      // 获取总 TVL
      const tvl = await this.calculateTotalTVL();

      // 获取风险指标
      const risks = await this.analyzeRisks();

      // 获取流动性池信息
      const pools = await this.getLiquidityPools(address);

      return {
        chain: this.chain.name,
        name: 'Uniswap V2',
        contractAddress: this.factoryAddress,
        tvl,
        risks,
        liquidityPools: pools,
        governance: {
          feeTo,
          feeToSetter
        },
        createdAt: 0, // TODO: 获取创建时间
        updatedAt: Date.now()
      };
    } catch (error) {
      logger.error('Uniswap', `Failed to get protocol info: ${error.message}`);
      throw error;
    }
  }

  public async getLiquidityPools(address: string): Promise<LiquidityPool[]> {
    try {
      const factory = new ethers.Contract(this.factoryAddress, FACTORY_ABI, this.provider);
      const pairsLength = await factory.allPairsLength();
      const pools: LiquidityPool[] = [];

      // 批量获取池信息
      const batchSize = 100;
      for (let i = 0; i < pairsLength.toNumber(); i += batchSize) {
        const batch = await Promise.all(
          Array.from({ length: Math.min(batchSize, pairsLength.toNumber() - i) }, (_, j) =>
            this.getPoolInfo(factory, i + j)
          )
        );
        pools.push(...batch.filter(Boolean));
      }

      return pools;
    } catch (error) {
      logger.error('Uniswap', `Failed to get liquidity pools: ${error.message}`);
      throw error;
    }
  }

  private async getPoolInfo(factory: ethers.Contract, index: number): Promise<LiquidityPool | null> {
    try {
      const pairAddress = await factory.allPairs(index);
      const cacheKey = `pool:${pairAddress}`;
      
      // 检查缓存
      const cached = this.getFromCache(cacheKey);
      if (cached) return cached;

      const pair = new ethers.Contract(pairAddress, PAIR_ABI, this.provider);
      
      // 获取池信息
      const [token0, token1, reserves, totalSupply] = await Promise.all([
        pair.token0(),
        pair.token1(),
        pair.getReserves(),
        pair.totalSupply()
      ]);

      // 获取代币信息
      const [token0Info, token1Info] = await Promise.all([
        this.getTokenInfo(token0),
        this.getTokenInfo(token1)
      ]);

      // 计算池子指标
      const volume24h = await this.getPoolVolume(pairAddress);
      const tvl = await this.getPoolTVL(pairAddress, reserves, token0Info, token1Info);
      
      const pool: LiquidityPool = {
        pair: `${token0Info.symbol}/${token1Info.symbol}`,
        volume24h,
        feeRate: 0.003, // Uniswap V2 固定费率 0.3%
        tvl,
        apy: this.calculateAPY(volume24h, tvl),
        analysis: await this.analyzeLiquidity(reserves, tvl)
      };

      // 缓存结果
      this.setCache(cacheKey, pool);
      
      return pool;
    } catch (error) {
      logger.error('Uniswap', `Failed to get pool info for index ${index}: ${error.message}`);
      return null;
    }
  }

  private async getTokenInfo(address: string): Promise<{
    address: string;
    name: string;
    symbol: string;
    decimals: number;
  }> {
    const cacheKey = `token:${address}`;
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    const token = new ethers.Contract(address, ERC20_ABI, this.provider);
    const [name, symbol, decimals] = await Promise.all([
      token.name(),
      token.symbol(),
      token.decimals()
    ]);

    const info = { address, name, symbol, decimals };
    this.setCache(cacheKey, info);
    return info;
  }

  private async getPoolVolume(address: string): Promise<number> {
    // TODO: 实现 24 小时交易量获取
    return 0;
  }

  private async getPoolTVL(
    address: string,
    reserves: any,
    token0: any,
    token1: any
  ): Promise<number> {
    try {
      // 获取代币价格
      const [price0, price1] = await Promise.all([
        this.priceOracle.getPrice({
          chain: this.chain.name,
          baseToken: token0.address,
          quoteToken: 'USD'
        }),
        this.priceOracle.getPrice({
          chain: this.chain.name,
          baseToken: token1.address,
          quoteToken: 'USD'
        })
      ]);

      // 计算 TVL
      const reserve0USD = (reserves[0] / Math.pow(10, token0.decimals)) * price0.price;
      const reserve1USD = (reserves[1] / Math.pow(10, token1.decimals)) * price1.price;
      
      return reserve0USD + reserve1USD;
    } catch (error) {
      logger.error('Uniswap', `Failed to calculate pool TVL: ${error.message}`);
      return 0;
    }
  }

  private calculateAPY(volume24h: number, tvl: number): number {
    if (tvl === 0) return 0;
    const dailyFees = volume24h * 0.003; // 0.3% 手续费
    return (dailyFees * 365) / tvl * 100;
  }

  private async analyzeLiquidity(reserves: any, tvl: number): Promise<any> {
    return {
      price: reserves[1] / reserves[0],
      depth: tvl,
      impermanentLoss: 0 // TODO: 计算无常损失
    };
  }

  private async calculateTotalTVL(): Promise<number> {
    const cacheKey = 'total_tvl';
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    try {
      const pools = await this.getLiquidityPools(this.factoryAddress);
      const tvl = pools.reduce((sum, pool) => sum + pool.tvl, 0);
      this.setCache(cacheKey, tvl);
      return tvl;
    } catch (error) {
      logger.error('Uniswap', `Failed to calculate total TVL: ${error.message}`);
      return 0;
    }
  }

  private async analyzeRisks(): Promise<RiskMetrics> {
    return {
      auditStatus: 'verified',
      insurance: true,
      centralizationRisks: [
        'Upgradeable contracts',
        'Admin key control'
      ],
      securityScore: 90
    };
  }

  public async getYieldStrategies(address: string): Promise<any[]> {
    // Uniswap V2 没有收益策略
    return [];
  }

  public async getGovernanceInfo(address: string): Promise<any> {
    const factory = new ethers.Contract(this.factoryAddress, FACTORY_ABI, this.provider);
    const [feeTo, feeToSetter] = await Promise.all([
      factory.feeTo(),
      factory.feeToSetter()
    ]);

    return {
      feeTo,
      feeToSetter
    };
  }

  public async getAnalytics(address: string): Promise<any> {
    // TODO: 实现更多分析指标
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