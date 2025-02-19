import axios from 'axios';
import { PriceData, PriceSource, TokenPair, PriceSourceType, ChainType } from '../types';

export class DexScreenerSource implements PriceSource {
  name = 'dexscreener';
  private baseUrl = 'https://api.dexscreener.com/latest';
  private supportedChains: Set<ChainType>;

  constructor() {
    this.supportedChains = new Set([
      ChainType.ETH,
      ChainType.SOLANA,
      ChainType.BASE
    ]);
  }

  async getPriceData(pair: TokenPair): Promise<PriceData> {
    if (!this.isSupported(pair)) {
      throw new Error(`Pair ${pair.baseToken}/${pair.quoteToken} on ${pair.chain} not supported by DexScreener`);
    }

    try {
      const response = await axios.get(`${this.baseUrl}/dex/pairs/${this.formatPairAddress(pair)}`);
      const { pair: pairData } = response.data;

      if (!pairData) {
        throw new Error(`No data found for pair ${pair.baseToken}/${pair.quoteToken}`);
      }

      return {
        pair,
        price: parseFloat(pairData.priceUsd),
        timestamp: Date.now(),
        source: PriceSourceType.DEXSCREENER,
        confidence: 0.9,
        volume24h: parseFloat(pairData.volume.h24),
        liquidityUSD: parseFloat(pairData.liquidity.usd),
        metadata: {
          updateInterval: 30000 // 30s update interval
        }
      };
    } catch (error) {
      throw new Error(`Failed to fetch price from DexScreener: ${error.message}`);
    }
  }

  isSupported(pair: TokenPair): boolean {
    return this.supportedChains.has(pair.chain);
  }

  getConfidence(): number {
    return 0.9;
  }

  private formatPairAddress(pair: TokenPair): string {
    // DexScreener specific pair address formatting
    switch (pair.chain) {
      case ChainType.ETH:
        return `ethereum/${pair.baseToken}`;
      case ChainType.SOLANA:
        return `solana/${pair.baseToken}`;
      case ChainType.BASE:
        return `base/${pair.baseToken}`;
      default:
        throw new Error(`Unsupported chain: ${pair.chain}`);
    }
  }
} 