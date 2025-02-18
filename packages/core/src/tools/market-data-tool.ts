import { BaseLumixTool } from './base-tool';
import { APIToolConfig } from './config';
import { logger } from '../monitoring';

interface MarketData {
  price: number;
  volume24h: number;
  marketCap: number;
  change24h: number;
  lastUpdate: number;
}

export class MarketDataTool extends BaseLumixTool {
  private config: APIToolConfig;

  constructor(config: APIToolConfig) {
    super({
      name: 'market_data',
      description: 'Retrieves and analyzes market data for various assets',
      enabled: true,
      priority: 1,
      ...config
    });
    this.config = config;
  }

  /** @override */
  protected async _call(input: string): Promise<string> {
    try {
      const params = JSON.parse(input);
      
      switch (params.action) {
        case 'get-price':
          const price = await this.getPrice(params.symbol);
          return JSON.stringify(price);
        
        case 'get-market-data':
          const marketData = await this.getMarketData(params.symbol);
          return JSON.stringify(marketData);
        
        case 'analyze-trend':
          const trend = await this.analyzeTrend(params.symbol, params.timeframe);
          return JSON.stringify(trend);
        
        default:
          throw new Error(`Unknown action: ${params.action}`);
      }
    } catch (error) {
      if (error instanceof Error) {
        this.logError('Market Data Tool', error);
      }
      throw error;
    }
  }

  private async getPrice(symbol: string): Promise<number> {
    const cacheKey = `price:${symbol}`;
    const cached = this.getFromCache<number>(cacheKey);
    if (cached !== null) {
      return cached;
    }

    try {
      const response = await this.withTimeout(async () => {
        const url = `${this.config.baseUrl}/v1/price/${symbol}`;
        const headers = this.config.apiKey ? {
          'Authorization': `Bearer ${this.config.apiKey}`
        } : {};

        const res = await fetch(url, { headers });
        if (!res.ok) {
          throw new Error(`HTTP error! status: ${res.status}`);
        }
        return await res.json();
      });

      const price = response.price;
      this.setInCache(cacheKey, price);
      return price;
    } catch (error) {
      if (error instanceof Error) {
        this.logError(`Failed to get price for ${symbol}`, error);
      }
      throw error;
    }
  }

  private async getMarketData(symbol: string): Promise<MarketData> {
    const cacheKey = `market:${symbol}`;
    const cached = this.getFromCache<MarketData>(cacheKey);
    if (cached !== null) {
      return cached;
    }

    try {
      const response = await this.withRetry(async () => {
        const url = `${this.config.baseUrl}/v1/market/${symbol}`;
        const headers = this.config.apiKey ? {
          'Authorization': `Bearer ${this.config.apiKey}`
        } : {};

        const res = await fetch(url, { headers });
        if (!res.ok) {
          throw new Error(`HTTP error! status: ${res.status}`);
        }
        return await res.json();
      });

      const marketData: MarketData = {
        price: response.price,
        volume24h: response.volume24h,
        marketCap: response.marketCap,
        change24h: response.change24h,
        lastUpdate: Date.now()
      };

      this.setInCache(cacheKey, marketData);
      return marketData;
    } catch (error) {
      if (error instanceof Error) {
        this.logError(`Failed to get market data for ${symbol}`, error);
      }
      throw error;
    }
  }

  private async analyzeTrend(
    symbol: string,
    timeframe: { start: number; end: number }
  ): Promise<{
    trend: 'up' | 'down' | 'sideways';
    strength: number;
    confidence: number;
  }> {
    try {
      const url = `${this.config.baseUrl}/v1/analysis/${symbol}`;
      const headers = this.config.apiKey ? {
        'Authorization': `Bearer ${this.config.apiKey}`
      } : {};

      const response = await this.withTimeout(async () => {
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            ...headers,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(timeframe)
        });

        if (!res.ok) {
          throw new Error(`HTTP error! status: ${res.status}`);
        }
        return await res.json();
      });

      return {
        trend: response.trend,
        strength: response.strength,
        confidence: response.confidence
      };
    } catch (error) {
      if (error instanceof Error) {
        this.logError(`Failed to analyze trend for ${symbol}`, error);
      }
      throw error;
    }
  }
} 