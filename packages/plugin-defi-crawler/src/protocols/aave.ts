import { Chain } from '@thirdweb-dev/chains';
import { ethers } from 'ethers';
import { ProtocolAdapter } from './index';
import { DeFiProtocol, CrawlerConfig, LiquidityPool, RiskMetrics } from '../types';
import { PriceOraclePlugin } from '@lumix/plugin-price-oracle';
import { logger } from '@lumix/core';

// Aave 借贷池合约 ABI
const LENDING_POOL_ABI = [
  'function getReserveData(address asset) external view returns (tuple(uint256 configuration, uint128 liquidityIndex, uint128 variableBorrowIndex, uint128 currentLiquidityRate, uint128 currentVariableBorrowRate, uint128 currentStableBorrowRate, uint40 lastUpdateTimestamp, address aTokenAddress, address stableDebtTokenAddress, address variableDebtTokenAddress, address interestRateStrategyAddress, uint8 id))',
  'function getReservesList() external view returns (address[])',
  'function getUserAccountData(address user) external view returns (uint256 totalCollateralETH, uint256 totalDebtETH, uint256 availableBorrowsETH, uint256 currentLiquidationThreshold, uint256 ltv, uint256 healthFactor)',
  'function paused() external view returns (bool)'
];

// Aave 协议数据提供者 ABI
const PROTOCOL_DATA_PROVIDER_ABI = [
  'function getAllReservesTokens() external view returns (tuple(string symbol, address tokenAddress)[])',
  'function getReserveConfigurationData(address asset) external view returns (uint256 decimals, uint256 ltv, uint256 liquidationThreshold, uint256 liquidationBonus, uint256 reserveFactor, bool usageAsCollateralEnabled, bool borrowingEnabled, bool stableBorrowRateEnabled, bool isActive, bool isFrozen)',
  'function getReserveData(address asset) external view returns (uint256 availableLiquidity, uint256 totalStableDebt, uint256 totalVariableDebt, uint256 liquidityRate, uint256 variableBorrowRate, uint256 stableBorrowRate, uint256 averageStableBorrowRate, uint256 liquidityIndex, uint256 variableBorrowIndex, uint40 lastUpdateTimestamp)'
];

// ERC20 代币 ABI
const ERC20_ABI = [
  'function name() external view returns (string)',
  'function symbol() external view returns (string)',
  'function decimals() external view returns (uint8)',
  'function totalSupply() external view returns (uint256)',
  'function balanceOf(address) external view returns (uint256)'
];

export class AaveAdapter implements ProtocolAdapter {
  public readonly name = 'aave';
  public readonly chain: Chain;
  private provider: ethers.providers.JsonRpcProvider;
  private lendingPoolAddress: string;
  private dataProviderAddress: string;
  private priceOracle: PriceOraclePlugin;
  private cache: Map<string, any>;
  private cacheTimeout: number;

  constructor(config: CrawlerConfig) {
    this.chain = config.chains[0];
    this.provider = new ethers.providers.JsonRpcProvider(config.rpcUrl);
    this.lendingPoolAddress = '0x7d2768dE32b0b80b7a3454c06BdAc94A69DDc7A9'; // Aave V2 借贷池地址
    this.dataProviderAddress = '0x057835Ad21a177dbdd3090bB1CAE03EaCF78Fc6d'; // Aave V2 数据提供者地址
    this.priceOracle = new PriceOraclePlugin();
    this.cache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5分钟缓存
  }

  public async isSupported(address: string): Promise<boolean> {
    try {
      // 检查是否是 Aave 相关合约
      return (
        address.toLowerCase() === this.lendingPoolAddress.toLowerCase() ||
        address.toLowerCase() === this.dataProviderAddress.toLowerCase()
      );
    } catch (error) {
      return false;
    }
  }

  public async getProtocolInfo(address: string): Promise<DeFiProtocol> {
    try {
      const lendingPool = new ethers.Contract(this.lendingPoolAddress, LENDING_POOL_ABI, this.provider);
      const dataProvider = new ethers.Contract(this.dataProviderAddress, PROTOCOL_DATA_PROVIDER_ABI, this.provider);
      
      // 获取基本信息
      const [reservesList, isPaused] = await Promise.all([
        lendingPool.getReservesList(),
        lendingPool.paused()
      ]);

      // 获取所有代币信息
      const reserveTokens = await dataProvider.getAllReservesTokens();

      // 获取总 TVL
      const tvl = await this.calculateTotalTVL(reservesList);

      // 获取风险指标
      const risks = await this.analyzeRisks();

      // 获取市场信息
      const markets = await this.getMarkets(reservesList, dataProvider);

      return {
        chain: this.chain.name,
        name: 'Aave V2',
        contractAddress: this.lendingPoolAddress,
        tvl,
        risks,
        markets,
        status: {
          isPaused,
          reservesCount: reservesList.length,
          supportedTokens: reserveTokens.map(t => t.symbol)
        },
        createdAt: 0, // TODO: 获取创建时间
        updatedAt: Date.now()
      };
    } catch (error) {
      logger.error('Aave', `Failed to get protocol info: ${error.message}`);
      throw error;
    }
  }

  private async getMarkets(
    reservesList: string[],
    dataProvider: ethers.Contract
  ): Promise<any[]> {
    const markets = [];

    for (const asset of reservesList) {
      try {
        const [config, data] = await Promise.all([
          dataProvider.getReserveConfigurationData(asset),
          dataProvider.getReserveData(asset)
        ]);

        const tokenInfo = await this.getTokenInfo(asset);
        const price = await this.getAssetPrice(asset);

        markets.push({
          asset: tokenInfo.symbol,
          tokenAddress: asset,
          configuration: {
            ltv: config.ltv.toString(),
            liquidationThreshold: config.liquidationThreshold.toString(),
            liquidationBonus: config.liquidationBonus.toString(),
            reserveFactor: config.reserveFactor.toString(),
            usageAsCollateralEnabled: config.usageAsCollateralEnabled,
            borrowingEnabled: config.borrowingEnabled,
            stableBorrowRateEnabled: config.stableBorrowRateEnabled,
            isActive: config.isActive,
            isFrozen: config.isFrozen
          },
          metrics: {
            availableLiquidity: this.formatAmount(data.availableLiquidity, tokenInfo.decimals),
            totalStableDebt: this.formatAmount(data.totalStableDebt, tokenInfo.decimals),
            totalVariableDebt: this.formatAmount(data.totalVariableDebt, tokenInfo.decimals),
            liquidityRate: this.formatRate(data.liquidityRate),
            variableBorrowRate: this.formatRate(data.variableBorrowRate),
            stableBorrowRate: this.formatRate(data.stableBorrowRate),
            averageStableBorrowRate: this.formatRate(data.averageStableBorrowRate),
            liquidityIndex: data.liquidityIndex.toString(),
            variableBorrowIndex: data.variableBorrowIndex.toString(),
            lastUpdateTimestamp: data.lastUpdateTimestamp
          },
          price: price.price,
          totalValueLocked: this.calculateMarketTVL(
            data.availableLiquidity,
            data.totalStableDebt,
            data.totalVariableDebt,
            price.price,
            tokenInfo.decimals
          )
        });
      } catch (error) {
        logger.error('Aave', `Failed to get market data for asset ${asset}: ${error.message}`);
      }
    }

    return markets;
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

  private async getAssetPrice(asset: string): Promise<any> {
    try {
      return await this.priceOracle.getPrice({
        chain: this.chain.name,
        baseToken: asset,
        quoteToken: 'USD'
      });
    } catch (error) {
      logger.error('Aave', `Failed to get price for asset ${asset}: ${error.message}`);
      return { price: 0 };
    }
  }

  private formatAmount(amount: ethers.BigNumber, decimals: number): string {
    return ethers.utils.formatUnits(amount, decimals);
  }

  private formatRate(rate: ethers.BigNumber): string {
    return (Number(rate.toString()) / 1e27 * 100).toFixed(2);
  }

  private calculateMarketTVL(
    availableLiquidity: ethers.BigNumber,
    totalStableDebt: ethers.BigNumber,
    totalVariableDebt: ethers.BigNumber,
    price: number,
    decimals: number
  ): number {
    const total = availableLiquidity.add(totalStableDebt).add(totalVariableDebt);
    return Number(ethers.utils.formatUnits(total, decimals)) * price;
  }

  private async calculateTotalTVL(reservesList: string[]): Promise<number> {
    const cacheKey = 'total_tvl';
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    try {
      const dataProvider = new ethers.Contract(this.dataProviderAddress, PROTOCOL_DATA_PROVIDER_ABI, this.provider);
      let totalTVL = 0;

      for (const asset of reservesList) {
        const data = await dataProvider.getReserveData(asset);
        const tokenInfo = await this.getTokenInfo(asset);
        const price = await this.getAssetPrice(asset);

        totalTVL += this.calculateMarketTVL(
          data.availableLiquidity,
          data.totalStableDebt,
          data.totalVariableDebt,
          price.price,
          tokenInfo.decimals
        );
      }

      this.setCache(cacheKey, totalTVL);
      return totalTVL;
    } catch (error) {
      logger.error('Aave', `Failed to calculate total TVL: ${error.message}`);
      return 0;
    }
  }

  private async analyzeRisks(): Promise<RiskMetrics> {
    return {
      auditStatus: 'verified',
      insurance: true,
      centralizationRisks: [
        'Admin key control',
        'Oracle dependency',
        'Emergency mode'
      ],
      securityScore: 95
    };
  }

  public async getLiquidityPools(address: string): Promise<LiquidityPool[]> {
    // Aave 不使用流动性池模型
    return [];
  }

  public async getYieldStrategies(address: string): Promise<any[]> {
    try {
      const dataProvider = new ethers.Contract(this.dataProviderAddress, PROTOCOL_DATA_PROVIDER_ABI, this.provider);
      const reserveTokens = await dataProvider.getAllReservesTokens();
      const strategies = [];

      for (const { symbol, tokenAddress } of reserveTokens) {
        const data = await dataProvider.getReserveData(tokenAddress);
        
        strategies.push({
          asset: symbol,
          tokenAddress,
          supplyAPY: this.formatRate(data.liquidityRate),
          variableBorrowAPY: this.formatRate(data.variableBorrowRate),
          stableBorrowAPY: this.formatRate(data.stableBorrowRate)
        });
      }

      return strategies;
    } catch (error) {
      logger.error('Aave', `Failed to get yield strategies: ${error.message}`);
      return [];
    }
  }

  public async getGovernanceInfo(address: string): Promise<any> {
    // TODO: 实现治理信息获取
    return {
      // TODO: 添加治理相关信息
    };
  }

  public async getAnalytics(address: string): Promise<any> {
    try {
      const lendingPool = new ethers.Contract(this.lendingPoolAddress, LENDING_POOL_ABI, this.provider);
      const dataProvider = new ethers.Contract(this.dataProviderAddress, PROTOCOL_DATA_PROVIDER_ABI, this.provider);
      
      const reservesList = await lendingPool.getReservesList();
      let totalSupply = 0;
      let totalBorrow = 0;

      for (const asset of reservesList) {
        const data = await dataProvider.getReserveData(asset);
        const tokenInfo = await this.getTokenInfo(asset);
        const price = await this.getAssetPrice(asset);

        const supply = Number(this.formatAmount(data.availableLiquidity, tokenInfo.decimals)) * price.price;
        const borrow = Number(this.formatAmount(
          data.totalStableDebt.add(data.totalVariableDebt),
          tokenInfo.decimals
        )) * price.price;

        totalSupply += supply;
        totalBorrow += borrow;
      }

      return {
        totalSupply,
        totalBorrow,
        utilizationRate: totalSupply > 0 ? (totalBorrow / totalSupply) * 100 : 0,
        reservesCount: reservesList.length
      };
    } catch (error) {
      logger.error('Aave', `Failed to get analytics: ${error.message}`);
      return {
        totalSupply: 0,
        totalBorrow: 0,
        utilizationRate: 0,
        reservesCount: 0
      };
    }
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