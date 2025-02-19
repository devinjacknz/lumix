import { Chain } from '@thirdweb-dev/chains';
import { ethers } from 'ethers';
import { ProtocolAdapter } from './index';
import { DeFiProtocol, CrawlerConfig, LiquidityPool, RiskMetrics } from '../types';
import { PriceOraclePlugin } from '@lumix/plugin-price-oracle';
import { logger } from '@lumix/core';

// Curve 注册表 ABI
const REGISTRY_ABI = [
  'function pool_count() external view returns (uint256)',
  'function pool_list(uint256) external view returns (address)',
  'function get_pool_name(address) external view returns (string)',
  'function get_coins(address) external view returns (address[8])',
  'function get_underlying_coins(address) external view returns (address[8])',
  'function get_pool_asset_type(address) external view returns (uint256)'
];

// Curve 池 ABI
const POOL_ABI = [
  'function get_virtual_price() external view returns (uint256)',
  'function balances(uint256) external view returns (uint256)',
  'function A() external view returns (uint256)',
  'function fee() external view returns (uint256)',
  'function admin_fee() external view returns (uint256)'
];

// Curve Gauge 控制器 ABI
const GAUGE_CONTROLLER_ABI = [
  'function gauge_types(address) external view returns (int128)',
  'function get_gauge_weight(address) external view returns (uint256)',
  'function get_type_weight(int128) external view returns (uint256)'
];

// 添加 Curve 事件 ABI
const POOL_EVENTS_ABI = [
  'event TokenExchange(address indexed buyer, int128 sold_id, uint256 tokens_sold, int128 bought_id, uint256 tokens_bought)',
  'event TokenExchangeUnderlying(address indexed buyer, int128 sold_id, uint256 tokens_sold, int128 bought_id, uint256 tokens_bought)'
];

// 添加 Gauge ABI
const GAUGE_ABI = [
  'function working_supply() external view returns (uint256)',
  'function inflation_rate() external view returns (uint256)',
  'function reward_tokens(uint256) external view returns (address)',
  'function reward_data(address) external view returns (tuple(address token, address distributor, uint256 period_finish, uint256 rate, uint256 last_update, uint256 integral))',
  'function claimable_tokens(address) external view returns (uint256)',
  'function claimable_reward(address, address) external view returns (uint256)'
];

export class CurveAdapter implements ProtocolAdapter {
  public readonly name = 'curve';
  public readonly chain: Chain;
  private provider: ethers.providers.JsonRpcProvider;
  private registryAddress: string;
  private gaugeControllerAddress: string;
  private priceOracle: PriceOraclePlugin;
  private cache: Map<string, any>;
  private cacheTimeout: number;

  constructor(config: CrawlerConfig) {
    this.chain = config.chains[0];
    this.provider = new ethers.providers.JsonRpcProvider(config.rpcUrl);
    this.registryAddress = '0x90E00ACe148ca3b23Ac1bC8C240C2a7Dd9c2d7f5'; // Curve 注册表地址
    this.gaugeControllerAddress = '0x2F50D538606Fa9EDD2B11E2446BEb18C9D5846bB'; // Gauge 控制器地址
    this.priceOracle = new PriceOraclePlugin();
    this.cache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5分钟缓存
  }

  public async isSupported(address: string): Promise<boolean> {
    try {
      const registry = new ethers.Contract(this.registryAddress, REGISTRY_ABI, this.provider);
      const assetType = await registry.get_pool_asset_type(address);
      return assetType.gt(0);
    } catch (error) {
      return false;
    }
  }

  public async getProtocolInfo(address: string): Promise<DeFiProtocol> {
    try {
      const registry = new ethers.Contract(this.registryAddress, REGISTRY_ABI, this.provider);
      const gaugeController = new ethers.Contract(this.gaugeControllerAddress, GAUGE_CONTROLLER_ABI, this.provider);

      // 获取池数量
      const poolCount = await registry.pool_count();
      
      // 获取所有池信息
      const pools = await this.getAllPools(registry, poolCount);
      
      // 计算总 TVL
      const tvl = await this.calculateTotalTVL(pools);

      // 分析风险
      const risks = await this.analyzeRisks();

      return {
        chain: this.chain.name,
        name: 'Curve',
        contractAddress: this.registryAddress,
        tvl,
        risks,
        liquidityPools: pools,
        governance: {
          token: 'CRV',
          votingSystem: 'Gauge Weight Voting',
          proposalCount: 0, // TODO: 获取提案数量
          totalVotingPower: 0 // TODO: 获取总投票权
        },
        createdAt: 0, // TODO: 获取创建时间
        updatedAt: Date.now()
      };
    } catch (error) {
      logger.error('Curve', `Failed to get protocol info: ${error.message}`);
      throw error;
    }
  }

  private async getAllPools(registry: ethers.Contract, poolCount: ethers.BigNumber): Promise<LiquidityPool[]> {
    const pools: LiquidityPool[] = [];

    for (let i = 0; i < poolCount.toNumber(); i++) {
      try {
        const poolAddress = await registry.pool_list(i);
        const pool = await this.getPoolInfo(registry, poolAddress);
        if (pool) {
          pools.push(pool);
        }
      } catch (error) {
        logger.error('Curve', `Failed to get pool at index ${i}: ${error.message}`);
      }
    }

    return pools;
  }

  private async getPoolInfo(registry: ethers.Contract, address: string): Promise<LiquidityPool | null> {
    try {
      const pool = new ethers.Contract(address, POOL_ABI, this.provider);
      
      // 获取池名称和代币
      const [name, coins] = await Promise.all([
        registry.get_pool_name(address),
        registry.get_coins(address)
      ]);

      // 过滤掉零地址
      const validCoins = coins.filter(c => c !== ethers.constants.AddressZero);
      
      // 获取代币信息
      const tokenInfos = await Promise.all(
        validCoins.map(coin => this.getTokenInfo(coin))
      );

      // 获取池余额
      const balances = await Promise.all(
        validCoins.map((_, i) => pool.balances(i))
      );

      // 获取虚拟价格和费率
      const [virtualPrice, fee, adminFee] = await Promise.all([
        pool.get_virtual_price(),
        pool.fee(),
        pool.admin_fee()
      ]);

      // 计算 TVL
      const tvl = await this.getPoolTVL(address, balances, tokenInfos);
      
      // 获取交易量
      const volume24h = await this.getPoolVolume(address);

      // 计算 APY
      const apy = await this.calculatePoolAPY(address, tvl);

      return {
        pair: name,
        volume24h,
        feeRate: Number(fee) / 1e10,
        tvl,
        apy,
        analysis: {
          price: Number(virtualPrice) / 1e18,
          depth: tvl,
          impermanentLoss: 0 // 稳定币池的无常损失接近于0
        }
      };
    } catch (error) {
      logger.error('Curve', `Failed to get pool info for ${address}: ${error.message}`);
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

    const token = new ethers.Contract(address, [
      'function name() view returns (string)',
      'function symbol() view returns (string)',
      'function decimals() view returns (uint8)'
    ], this.provider);

    const [name, symbol, decimals] = await Promise.all([
      token.name(),
      token.symbol(),
      token.decimals()
    ]);

    const info = { address, name, symbol, decimals };
    this.setCache(cacheKey, info);
    return info;
  }

  private async getPoolTVL(
    address: string,
    balances: ethers.BigNumber[],
    tokens: Array<{
      address: string;
      decimals: number;
    }>
  ): Promise<number> {
    try {
      let tvl = 0;

      for (let i = 0; i < balances.length; i++) {
        const price = await this.priceOracle.getPrice({
          chain: this.chain.name,
          baseToken: tokens[i].address,
          quoteToken: 'USD'
        });

        const balance = Number(ethers.utils.formatUnits(balances[i], tokens[i].decimals));
        tvl += balance * price.price;
      }

      return tvl;
    } catch (error) {
      logger.error('Curve', `Failed to calculate pool TVL: ${error.message}`);
      return 0;
    }
  }

  private async getPoolVolume(address: string): Promise<number> {
    try {
      const cacheKey = `volume:${address}`;
      const cached = this.getFromCache(cacheKey);
      if (cached) return cached;

      const pool = new ethers.Contract(address, POOL_EVENTS_ABI, this.provider);
      const currentBlock = await this.provider.getBlockNumber();
      const oneDayAgo = currentBlock - 6500; // 约24小时的区块数

      // 获取交易事件
      const [exchanges, underlyingExchanges] = await Promise.all([
        pool.queryFilter(pool.filters.TokenExchange(), oneDayAgo, currentBlock),
        pool.queryFilter(pool.filters.TokenExchangeUnderlying(), oneDayAgo, currentBlock)
      ]);

      // 计算交易量
      let volume = 0;
      const processExchange = async (event: any) => {
        const tokensSold = event.args.tokens_sold;
        const soldId = event.args.sold_id;
        const coins = await this.getPoolCoins(address);
        const tokenInfo = await this.getTokenInfo(coins[soldId]);
        const price = await this.priceOracle.getPrice({
          chain: this.chain.name,
          baseToken: coins[soldId],
          quoteToken: 'USD'
        });
        
        const amount = Number(ethers.utils.formatUnits(tokensSold, tokenInfo.decimals));
        volume += amount * price.price;
      };

      // 处理所有交易事件
      await Promise.all([
        ...exchanges.map(processExchange),
        ...underlyingExchanges.map(processExchange)
      ]);

      this.setCache(cacheKey, volume);
      return volume;
    } catch (error) {
      logger.error('Curve', `Failed to get pool volume: ${error.message}`);
      return 0;
    }
  }

  private async getPoolCoins(poolAddress: string): Promise<string[]> {
    const registry = new ethers.Contract(this.registryAddress, REGISTRY_ABI, this.provider);
    const coins = await registry.get_coins(poolAddress);
    return coins.filter(c => c !== ethers.constants.AddressZero);
  }

  private async calculatePoolAPY(address: string, tvl: number): Promise<number> {
    try {
      const gaugeController = new ethers.Contract(
        this.gaugeControllerAddress,
        GAUGE_CONTROLLER_ABI,
        this.provider
      );

      // 获取 gauge 权重
      const gaugeType = await gaugeController.gauge_types(address);
      const gaugeWeight = await gaugeController.get_gauge_weight(address);
      const typeWeight = await gaugeController.get_type_weight(gaugeType);

      // 计算 CRV 奖励 APY
      const crvPrice = await this.priceOracle.getPrice({
        chain: this.chain.name,
        baseToken: '0xD533a949740bb3306d119CC777fa900bA034cd52', // CRV token
        quoteToken: 'USD'
      });

      const totalWeight = gaugeWeight.mul(typeWeight);
      const crvPerYear = totalWeight.mul(365 * 86400).div(ethers.constants.WeiPerEther);
      const crvValuePerYear = crvPerYear.mul(crvPrice.price);

      return tvl > 0 ? (Number(crvValuePerYear) / tvl) * 100 : 0;
    } catch (error) {
      logger.error('Curve', `Failed to calculate pool APY: ${error.message}`);
      return 0;
    }
  }

  private async calculateTotalTVL(pools: LiquidityPool[]): Promise<number> {
    return pools.reduce((sum, pool) => sum + pool.tvl, 0);
  }

  private async analyzeRisks(): Promise<RiskMetrics> {
    return {
      auditStatus: 'verified',
      insurance: true,
      centralizationRisks: [
        'Admin key control',
        'Oracle dependency'
      ],
      securityScore: 92
    };
  }

  public async getLiquidityPools(address: string): Promise<LiquidityPool[]> {
    const registry = new ethers.Contract(this.registryAddress, REGISTRY_ABI, this.provider);
    const poolCount = await registry.pool_count();
    return this.getAllPools(registry, poolCount);
  }

  public async getYieldStrategies(address: string): Promise<any[]> {
    try {
      const registry = new ethers.Contract(this.registryAddress, REGISTRY_ABI, this.provider);
      const gaugeController = new ethers.Contract(
        this.gaugeControllerAddress,
        GAUGE_CONTROLLER_ABI,
        this.provider
      );

      // 获取 gauge 地址
      const gaugeAddress = await this.getGaugeAddress(address);
      if (!gaugeAddress) {
        return [];
      }

      const gauge = new ethers.Contract(gaugeAddress, GAUGE_ABI, this.provider);
      
      // 获取基础信息
      const [
        workingSupply,
        inflationRate,
        coins,
        crvPrice
      ] = await Promise.all([
        gauge.working_supply(),
        gauge.inflation_rate(),
        this.getPoolCoins(address),
        this.priceOracle.getPrice({
          chain: this.chain.name,
          baseToken: '0xD533a949740bb3306d119CC777fa900bA034cd52', // CRV token
          quoteToken: 'USD'
        })
      ]);

      // 获取额外奖励代币
      const rewardTokens = [];
      let i = 0;
      while (true) {
        try {
          const token = await gauge.reward_tokens(i);
          if (token === ethers.constants.AddressZero) break;
          rewardTokens.push(token);
          i++;
        } catch {
          break;
        }
      }

      // 获取奖励信息
      const rewardData = await Promise.all(
        rewardTokens.map(async (token) => {
          const data = await gauge.reward_data(token);
          const tokenInfo = await this.getTokenInfo(token);
          const price = await this.priceOracle.getPrice({
            chain: this.chain.name,
            baseToken: token,
            quoteToken: 'USD'
          });

          return {
            token: tokenInfo.symbol,
            rate: ethers.utils.formatUnits(data.rate, tokenInfo.decimals),
            periodFinish: data.period_finish.toNumber(),
            priceUSD: price.price
          };
        })
      );

      // 计算基础 CRV 奖励 APY
      const crvAPY = this.calculateCRVRewardAPY(
        inflationRate,
        workingSupply,
        crvPrice.price
      );

      // 计算额外奖励 APY
      const rewardAPYs = rewardData.map(reward => ({
        token: reward.token,
        apy: this.calculateRewardAPY(
          reward.rate,
          reward.priceUSD,
          workingSupply
        )
      }));

      // 获取池中代币信息
      const poolTokens = await Promise.all(
        coins.map(async (coin) => {
          const info = await this.getTokenInfo(coin);
          return info.symbol;
        })
      );

      return [{
        type: 'liquidity',
        tokens: poolTokens,
        baseAPY: crvAPY,
        rewardAPYs,
        totalAPY: crvAPY + rewardAPYs.reduce((sum, r) => sum + r.apy, 0),
        gauge: gaugeAddress,
        workingSupply: ethers.utils.formatEther(workingSupply),
        rewards: rewardData
      }];
    } catch (error) {
      logger.error('Curve', `Failed to get yield strategies: ${error.message}`);
      return [];
    }
  }

  private async getGaugeAddress(poolAddress: string): Promise<string | null> {
    // TODO: 实现从 Curve 工厂获取 gauge 地址的逻辑
    return null;
  }

  private calculateCRVRewardAPY(
    inflationRate: ethers.BigNumber,
    workingSupply: ethers.BigNumber,
    crvPriceUSD: number
  ): number {
    if (workingSupply.isZero()) return 0;

    const yearlyReward = inflationRate.mul(365 * 86400);
    const rewardValue = Number(ethers.utils.formatEther(yearlyReward)) * crvPriceUSD;
    const totalSupplyValue = Number(ethers.utils.formatEther(workingSupply));

    return (rewardValue / totalSupplyValue) * 100;
  }

  private calculateRewardAPY(
    rewardRate: string,
    rewardPriceUSD: number,
    workingSupply: ethers.BigNumber
  ): number {
    if (workingSupply.isZero()) return 0;

    const yearlyReward = Number(rewardRate) * 365 * 86400;
    const rewardValue = yearlyReward * rewardPriceUSD;
    const totalSupplyValue = Number(ethers.utils.formatEther(workingSupply));

    return (rewardValue / totalSupplyValue) * 100;
  }

  public async getGovernanceInfo(address: string): Promise<any> {
    // TODO: 实现治理信息获取逻辑
    return {
      token: 'CRV',
      votingSystem: 'Gauge Weight Voting'
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