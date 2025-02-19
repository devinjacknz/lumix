import { HeliusClient } from '@lumix/helius';
import { PriceData, PriceSource, TokenPair, PriceSourceType, ChainType } from '../types';

export class HeliusSource implements PriceSource {
  name = 'helius';
  private client: HeliusClient;
  private supportedTokens: Set<string>;

  constructor(heliusClient: HeliusClient) {
    this.client = heliusClient;
    this.supportedTokens = new Set([
      'SOL',
      'RAY',
      'SRM',
      'FIDA',
      'MNGO',
      'ORCA',
      'SAMO'
    ]);
  }

  async getPriceData(pair: TokenPair): Promise<PriceData> {
    if (!this.isSupported(pair)) {
      throw new Error(`Pair ${pair.baseToken}/${pair.quoteToken} not supported by Helius`);
    }

    try {
      // 获取 DeFi 数据
      const defiData = await this.client.getDeFiData('token-price', {
        token: pair.baseToken,
        quote: pair.quoteToken
      });

      if (!defiData || !defiData.price) {
        throw new Error(`No price data found for ${pair.baseToken}/${pair.quoteToken}`);
      }

      return {
        pair,
        price: parseFloat(defiData.price),
        timestamp: Date.now(),
        source: PriceSourceType.HELIUS,
        confidence: 0.85,
        volume24h: defiData.volume24h ? parseFloat(defiData.volume24h) : undefined,
        liquidityUSD: defiData.liquidity ? parseFloat(defiData.liquidity) : undefined,
        metadata: {
          updateInterval: 15000, // 15s update interval
          source: 'helius-defi-api'
        }
      };
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to fetch price from Helius: ${error.message}`);
      }
      throw new Error('Failed to fetch price from Helius: Unknown error');
    }
  }

  isSupported(pair: TokenPair): boolean {
    return (
      pair.chain === ChainType.SOLANA && 
      this.supportedTokens.has(pair.baseToken) &&
      pair.quoteToken === 'USD'
    );
  }

  getConfidence(): number {
    return 0.85; // Helius 数据源可信度适中
  }
} 