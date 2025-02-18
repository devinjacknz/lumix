import { Tool } from "langchain/tools";
import { LiquidityAnalyzer } from '../liquidity';
import { logger } from '@lumix/core';

export class LiquidityAnalyzerTool extends Tool {
  name = 'liquidity-analyzer';
  description = 'Analyzes liquidity pools and market depth to provide trading insights';
  
  constructor(private analyzer: LiquidityAnalyzer) {
    super();
  }

  /** @override */
  protected async _call(input: string): Promise<string> {
    try {
      const params = this.parseInput(input);
      
      switch (params.action) {
        case 'analyze-pool':
          const poolAnalysis = await this.analyzer.analyzePool(
            params.poolAddress,
            params.options
          );
          return this.formatPoolAnalysis(poolAnalysis);

        case 'get-market-depth':
          const marketDepth = await this.analyzer.getMarketDepth(
            params.token0,
            params.token1,
            params.options
          );
          return this.formatMarketDepth(marketDepth);

        case 'estimate-price-impact':
          const priceImpact = await this.analyzer.estimatePriceImpact(
            params.tokenIn,
            params.tokenOut,
            params.amountIn,
            params.options
          );
          return this.formatPriceImpact(priceImpact);

        case 'find-best-route':
          const route = await this.analyzer.findBestRoute(
            params.tokenIn,
            params.tokenOut,
            params.amount,
            params.options
          );
          return this.formatRoute(route);

        default:
          throw new Error(`Unknown action: ${params.action}`);
      }
    } catch (error) {
      if (error instanceof Error) {
        logger.error('Liquidity Analyzer Tool', `Analysis failed: ${error.message}`);
      }
      throw error;
    }
  }

  private parseInput(input: string): any {
    try {
      return JSON.parse(input);
    } catch (error) {
      throw new Error('Invalid input format. Expected JSON string.');
    }
  }

  private formatPoolAnalysis(analysis: any): string {
    return JSON.stringify({
      pool: analysis.pool,
      timestamp: analysis.timestamp,
      metrics: {
        tvl: analysis.metrics.tvl,
        volume24h: analysis.metrics.volume24h,
        fee: analysis.metrics.fee,
        apy: analysis.metrics.apy,
        utilization: analysis.metrics.utilization
      },
      tokens: analysis.tokens.map((token: any) => ({
        address: token.address,
        symbol: token.symbol,
        reserve: token.reserve,
        weight: token.weight
      })),
      health: {
        score: analysis.health.score,
        warnings: analysis.health.warnings
      }
    }, null, 2);
  }

  private formatMarketDepth(depth: any): string {
    return JSON.stringify({
      token0: depth.token0,
      token1: depth.token1,
      timestamp: depth.timestamp,
      bids: depth.bids.map((bid: any) => ({
        price: bid.price,
        quantity: bid.quantity,
        total: bid.total
      })),
      asks: depth.asks.map((ask: any) => ({
        price: ask.price,
        quantity: ask.quantity,
        total: ask.total
      })),
      summary: {
        midPrice: depth.summary.midPrice,
        spread: depth.summary.spread,
        depth: depth.summary.depth
      }
    }, null, 2);
  }

  private formatPriceImpact(impact: any): string {
    return JSON.stringify({
      tokenIn: impact.tokenIn,
      tokenOut: impact.tokenOut,
      amountIn: impact.amountIn,
      amountOut: impact.amountOut,
      priceImpact: impact.priceImpact,
      effectivePrice: impact.effectivePrice,
      warning: impact.warning
    }, null, 2);
  }

  private formatRoute(route: any): string {
    return JSON.stringify({
      tokenIn: route.tokenIn,
      tokenOut: route.tokenOut,
      amount: route.amount,
      path: route.path.map((hop: any) => ({
        pool: hop.pool,
        tokenIn: hop.tokenIn,
        tokenOut: hop.tokenOut,
        fee: hop.fee
      })),
      expectedOut: route.expectedOut,
      priceImpact: route.priceImpact,
      executionPrice: route.executionPrice
    }, null, 2);
  }
} 