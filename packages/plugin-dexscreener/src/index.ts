import axios from 'axios';
import WebSocket from 'ws';
import { Decimal } from 'decimal.js';
import {
  DexScreenerConfig,
  PairInfo,
  TokenInfo,
  PriceUpdate,
  MarketStats,
  DexScreenerResponse,
  WebSocketMessage
} from './types';

export class DexScreenerPlugin {
  private config: DexScreenerConfig;
  private ws: WebSocket | null = null;
  private subscriptions: Map<string, (update: PriceUpdate) => void>;

  constructor(config: DexScreenerConfig) {
    this.config = config;
    this.subscriptions = new Map();
  }

  /**
   * Initialize WebSocket connection
   */
  async initialize(): Promise<void> {
    if (this.ws) {
      return;
    }

    this.ws = new WebSocket(this.config.wsEndpoint);

    this.ws.on('open', () => {
      console.log('DexScreener WebSocket connected');
    });

    this.ws.on('message', (data: WebSocket.RawData) => {
      try {
        const message: WebSocketMessage = JSON.parse(data.toString());
        if (message.type === 'price' && message.data) {
          const callback = this.subscriptions.get(message.pair);
          if (callback) {
            callback({
              pair: message.pair,
              price: new Decimal(message.data.price),
              timestamp: new Date().toISOString()
            });
          }
        }
      } catch (error) {
        console.error('Error processing WebSocket message:', error);
      }
    });

    this.ws.on('error', (error) => {
      console.error('DexScreener WebSocket error:', error);
    });

    this.ws.on('close', () => {
      console.log('DexScreener WebSocket closed');
      this.ws = null;
      // Attempt to reconnect after delay
      setTimeout(() => this.initialize(), 5000);
    });
  }

  /**
   * Get pair information
   */
  async getPairInfo(pairAddress: string): Promise<PairInfo> {
    const response = await axios.get<DexScreenerResponse<PairInfo>>(
      `${this.config.apiEndpoint}/pairs/${pairAddress}`
    );

    const pair = response.data.data;
    return {
      ...pair,
      price: new Decimal(pair.price),
      volume24h: new Decimal(pair.volume24h),
      liquidity: new Decimal(pair.liquidity)
    };
  }

  /**
   * Get token information
   */
  async getTokenInfo(tokenAddress: string): Promise<TokenInfo> {
    const response = await axios.get<DexScreenerResponse<TokenInfo>>(
      `${this.config.apiEndpoint}/tokens/${tokenAddress}`
    );

    const token = response.data.data;
    return {
      ...token,
      price: new Decimal(token.price),
      volume24h: new Decimal(token.volume24h),
      marketCap: new Decimal(token.marketCap)
    };
  }

  /**
   * Get market statistics
   */
  async getMarketStats(): Promise<MarketStats> {
    const response = await axios.get<DexScreenerResponse<MarketStats>>(
      `${this.config.apiEndpoint}/stats`
    );

    const stats = response.data.data;
    return {
      ...stats,
      totalVolume24h: new Decimal(stats.totalVolume24h),
      totalLiquidity: new Decimal(stats.totalLiquidity)
    };
  }

  /**
   * Subscribe to price updates for a pair
   */
  subscribeToPriceUpdates(pairAddress: string, callback: (update: PriceUpdate) => void): () => void {
    if (!this.ws) {
      throw new Error('WebSocket not initialized');
    }

    // Subscribe to pair updates
    this.ws.send(JSON.stringify({
      type: 'subscribe',
      pair: pairAddress
    }));

    this.subscriptions.set(pairAddress, callback);

    // Return unsubscribe function
    return () => {
      if (this.ws) {
        this.ws.send(JSON.stringify({
          type: 'unsubscribe',
          pair: pairAddress
        }));
      }
      this.subscriptions.delete(pairAddress);
    };
  }

  /**
   * Search for pairs
   */
  async searchPairs(query: string): Promise<PairInfo[]> {
    const response = await axios.get<DexScreenerResponse<PairInfo[]>>(
      `${this.config.apiEndpoint}/search`,
      {
        params: { query }
      }
    );

    return response.data.data.map(pair => ({
      ...pair,
      price: new Decimal(pair.price),
      volume24h: new Decimal(pair.volume24h),
      liquidity: new Decimal(pair.liquidity)
    }));
  }

  /**
   * Clean up resources
   */
  async dispose(): Promise<void> {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.subscriptions.clear();
  }
}

export * from './types';
