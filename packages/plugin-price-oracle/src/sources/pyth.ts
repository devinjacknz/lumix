import axios from 'axios';
import { PriceData, PriceSource, TokenPair, PriceSourceType, ChainType } from '../types';

export class PythSource implements PriceSource {
  name = 'pyth';
  private baseUrl = 'https://hermes-beta.pyth.network/api/latest_price_feeds';
  private priceFeeds: Map<string, string>;

  constructor() {
    this.priceFeeds = new Map();
    this.initializePriceFeeds();
  }

  private initializePriceFeeds() {
    // Pyth price feed IDs for common pairs
    this.addPriceFeed(ChainType.SOLANA, 'BTC', 'USD', 'e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43');
    this.addPriceFeed(ChainType.SOLANA, 'ETH', 'USD', 'ff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace');
    this.addPriceFeed(ChainType.SOLANA, 'SOL', 'USD', 'ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56e');
    // Add more pairs as needed
  }

  private addPriceFeed(chain: ChainType, baseToken: string, quoteToken: string, feedId: string) {
    const key = this.getPairKey({ chain, baseToken, quoteToken });
    this.priceFeeds.set(key, feedId);
  }

  private getPairKey(pair: TokenPair): string {
    return `${pair.chain}:${pair.baseToken}/${pair.quoteToken}`;
  }

  async getPriceData(pair: TokenPair): Promise<PriceData> {
    if (!this.isSupported(pair)) {
      throw new Error(`Pair ${pair.baseToken}/${pair.quoteToken} not supported by Pyth`);
    }

    const feedId = this.priceFeeds.get(this.getPairKey(pair));
    if (!feedId) {
      throw new Error(`No price feed found for ${pair.baseToken}/${pair.quoteToken}`);
    }

    try {
      const response = await axios.get(`${this.baseUrl}/${feedId}`);
      const priceData = response.data;

      return {
        pair,
        price: parseFloat(priceData.price),
        timestamp: priceData.timestamp,
        source: PriceSourceType.PYTH,
        confidence: 0.95,
        metadata: {
          blockNumber: priceData.slot,
          updateInterval: 400 // 400ms update interval for Pyth
        }
      };
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to fetch price from Pyth: ${error.message}`);
      }
      throw new Error('Failed to fetch price from Pyth: Unknown error');
    }
  }

  isSupported(pair: TokenPair): boolean {
    return this.priceFeeds.has(this.getPairKey(pair));
  }

  getConfidence(): number {
    return 0.95; // Pyth generally has high confidence due to its validator network
  }
} 