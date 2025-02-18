import { Connection, PublicKey } from '@solana/web3.js';
import { PythConnection, getPythProgramKeyForCluster, Price, Product as PythProduct, PythPriceCallback } from '@pythnetwork/client';
import { Decimal } from 'decimal.js';
import axios from 'axios';
import {
  PythConfig,
  PriceData,
  PriceHistory,
  PythFeed,
  PythResponse,
  PythSubscription
} from './types';

export class PythDataPlugin {
  private connection: Connection;
  private pythConnection: PythConnection;
  private config: PythConfig;

  constructor(config: PythConfig) {
    this.connection = new Connection(config.rpcUrl);
    this.config = config;

    const pythProgramKey = getPythProgramKeyForCluster('mainnet-beta');
    this.pythConnection = new PythConnection(this.connection, pythProgramKey);
  }

  /**
   * Initialize the plugin and start price feed subscription
   */
  async initialize(): Promise<void> {
    await this.pythConnection.start();
  }

  /**
   * Get current price for a symbol
   */
  async getCurrentPrice(symbol: string): Promise<PriceData> {
    const priceAccount = await this.getPriceAccount(symbol);
    
    return new Promise((resolve, reject) => {
      let resolved = false;
      
      const callback: PythPriceCallback = (price: Price, product: PythProduct) => {
        if (!resolved) {
          resolved = true;
          resolve({
            symbol,
            price: new Decimal(price.price || 0),
            confidence: new Decimal(price.confidence || 0),
            timestamp: new Date(price.publishSlot * 1000).toISOString()
          });
        }
      };

      this.pythConnection.onPriceChange(callback);
    });
  }

  /**
   * Get price history for a symbol
   */
  async getPriceHistory(params: { symbol: string; limit?: number }): Promise<PriceHistory> {
    const { symbol, limit = 100 } = params;
    const priceAccount = await this.getPriceAccount(symbol);

    // Get historical price data from Pyth API
    const response = await axios.get(
      `${this.config.apiEndpoint}/price/${priceAccount.toString()}/history`,
      { params: { limit } }
    );

    return {
      symbol,
      prices: response.data.map((item: any) => ({
        price: new Decimal(item.price),
        confidence: new Decimal(item.confidence),
        timestamp: new Date(item.timestamp * 1000).toISOString()
      }))
    };
  }

  /**
   * Subscribe to price updates for a symbol
   */
  subscribeToPriceUpdates(symbol: string, callback: (data: PriceData) => void): PythSubscription {
    const priceAccount = this.getPriceAccount(symbol);
    
    const pythCallback: PythPriceCallback = (price: Price, product: PythProduct) => {
      callback({
        symbol,
        price: new Decimal(price.price || 0),
        confidence: new Decimal(price.confidence || 0),
        timestamp: new Date(price.publishSlot * 1000).toISOString()
      });
    };

    this.pythConnection.onPriceChange(pythCallback);

    return {
      unsubscribe: () => {
        // Note: PythConnection doesn't provide a way to unsubscribe individual callbacks
        // We would need to track callbacks and implement our own unsubscribe mechanism
        // For now, this is a no-op
      }
    };
  }

  /**
   * Get all available feeds
   */
  async getAvailableFeeds(): Promise<PythFeed[]> {
    const response = await axios.get(`${this.config.apiEndpoint}/feeds`);

    return response.data.map((feed: any) => ({
      symbol: feed.symbol,
      priceAccount: new PublicKey(feed.price_account),
      price: new Decimal(feed.price),
      confidence: new Decimal(feed.confidence)
    }));
  }

  /**
   * Get price account for a symbol
   */
  private async getPriceAccount(symbol: string): Promise<PublicKey> {
    const feeds = await this.getAvailableFeeds();
    const feed = feeds.find(f => f.symbol === symbol);

    if (!feed) {
      throw new Error(`Price feed not found for symbol: ${symbol}`);
    }

    return feed.priceAccount;
  }

  /**
   * Clean up resources
   */
  async dispose(): Promise<void> {
    await this.pythConnection.stop();
  }
}

export * from './types';
