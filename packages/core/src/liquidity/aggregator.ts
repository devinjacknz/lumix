import { BigNumber } from 'ethers';
import { ChainAdapter, ChainProtocol } from '../chain/abstract';
import { ChainRegistry } from '../chain/registry';

export interface LiquiditySource {
  id: string;
  name: string;
  protocol: string;
  chain: ChainProtocol;
  type: 'dex' | 'lending' | 'yield';
  tokens: string[];
  tvl?: BigNumber;
  apr?: number;
}

export interface PriceQuote {
  source: string;
  inputToken: string;
  outputToken: string;
  inputAmount: BigNumber;
  outputAmount: BigNumber;
  priceImpact: number;
  route: string[];
}

export interface LiquidityPool {
  address: string;
  protocol: string;
  tokens: string[];
  reserves: BigNumber[];
  fees: number;
  lastUpdated: number;
}

export class LiquidityAggregator {
  private sources: Map<string, LiquiditySource> = new Map();
  private pools: Map<string, LiquidityPool> = new Map();
  private registry: ChainRegistry;

  constructor(private adapters: Map<ChainProtocol, ChainAdapter>) {
    this.registry = ChainRegistry.getInstance();
    this.initializeSources();
  }

  private async initializeSources() {
    // 初始化主要DEX源
    this.addSource({
      id: 'uniswap-v3',
      name: 'Uniswap V3',
      protocol: 'uniswap',
      chain: ChainProtocol.EVM,
      type: 'dex',
      tokens: ['ETH', 'USDC', 'USDT', 'DAI'],
    });

    this.addSource({
      id: 'orca',
      name: 'Orca',
      protocol: 'orca',
      chain: ChainProtocol.SOLANA,
      type: 'dex',
      tokens: ['SOL', 'USDC', 'USDT'],
    });
  }

  addSource(source: LiquiditySource) {
    this.sources.set(source.id, source);
  }

  async getQuotes(
    inputToken: string,
    outputToken: string,
    amount: BigNumber,
    options: {
      maxSlippage?: number;
      maxHops?: number;
    } = {}
  ): Promise<PriceQuote[]> {
    const quotes: PriceQuote[] = [];
    const { maxSlippage = 0.01, maxHops = 3 } = options;

    // 获取所有支持的流动性来源
    const relevantSources = Array.from(this.sources.values()).filter(
      source =>
        source.tokens.includes(inputToken) && source.tokens.includes(outputToken)
    );

    for (const source of relevantSources) {
      try {
        const quote = await this.getQuoteFromSource(
          source,
          inputToken,
          outputToken,
          amount,
          maxSlippage,
          maxHops
        );
        if (quote) {
          quotes.push(quote);
        }
      } catch (error) {
        console.error(`Failed to get quote from ${source.name}:`, error);
      }
    }

    // 按输出金额排序
    return quotes.sort((a, b) => {
      return b.outputAmount.sub(a.outputAmount).toNumber();
    });
  }

  private async getQuoteFromSource(
    source: LiquiditySource,
    inputToken: string,
    outputToken: string,
    amount: BigNumber,
    maxSlippage: number,
    maxHops: number
  ): Promise<PriceQuote | null> {
    const adapter = this.adapters.get(source.chain);
    if (!adapter) return null;

    // 获取池子信息
    const pool = await this.getOrUpdatePool(source, inputToken, outputToken);
    if (!pool) return null;

    // 计算输出金额和价格影响
    const { outputAmount, priceImpact } = this.calculateSwap(
      pool,
      inputToken,
      outputToken,
      amount
    );

    // 检查滑点是否在允许范围内
    if (priceImpact > maxSlippage) return null;

    return {
      source: source.id,
      inputToken,
      outputToken,
      inputAmount: amount,
      outputAmount,
      priceImpact,
      route: [inputToken, outputToken],
    };
  }

  private async getOrUpdatePool(
    source: LiquiditySource,
    token0: string,
    token1: string
  ): Promise<LiquidityPool | null> {
    const poolKey = `${source.id}-${token0}-${token1}`;
    const pool = this.pools.get(poolKey);

    // 如果池子信息不存在或已过期，则更新
    if (!pool || Date.now() - pool.lastUpdated > 60000) {
      const updatedPool = await this.fetchPoolData(source, token0, token1);
      if (updatedPool) {
        this.pools.set(poolKey, updatedPool);
        return updatedPool;
      }
      return null;
    }

    return pool;
  }

  private async fetchPoolData(
    source: LiquiditySource,
    token0: string,
    token1: string
  ): Promise<LiquidityPool | null> {
    // 实际实现需要调用具体DEX的合约
    // 示例实现
    return {
      address: '0x...',
      protocol: source.protocol,
      tokens: [token0, token1],
      reserves: [BigNumber.from(0), BigNumber.from(0)],
      fees: 0.003, // 0.3%
      lastUpdated: Date.now(),
    };
  }

  private calculateSwap(
    pool: LiquidityPool,
    inputToken: string,
    outputToken: string,
    amount: BigNumber
  ): { outputAmount: BigNumber; priceImpact: number } {
    // 实际实现需要根据具体DEX的公式计算
    // 示例实现 - 使用恒定乘积公式
    const inputIndex = pool.tokens.indexOf(inputToken);
    const outputIndex = pool.tokens.indexOf(outputToken);
    
    const inputReserve = pool.reserves[inputIndex];
    const outputReserve = pool.reserves[outputIndex];
    
    const inputAmountWithFee = amount.mul(1000 - Math.floor(pool.fees * 1000)).div(1000);
    const numerator = inputAmountWithFee.mul(outputReserve);
    const denominator = inputReserve.add(inputAmountWithFee);
    const outputAmount = numerator.div(denominator);

    // 计算价格影响
    const priceImpact =
      1 - outputAmount.mul(inputReserve).div(amount.mul(outputReserve)).toNumber();

    return {
      outputAmount,
      priceImpact,
    };
  }

  // 获取所有支持的流动性来源
  getSources(): LiquiditySource[] {
    return Array.from(this.sources.values());
  }

  // 获取特定链上的流动性来源
  getSourcesByChain(chain: ChainProtocol): LiquiditySource[] {
    return Array.from(this.sources.values()).filter(
      source => source.chain === chain
    );
  }
} 