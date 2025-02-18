import { PriceSourceTool, PriceSourceToolConfig } from "../tools/price-source";
import { PriceData, TokenPair, PriceSourceType, ChainType } from "../types";
import { logger } from "@lumix/core";

interface BinanceSymbol {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  status: string;
  volume: string;
  lastPrice: string;
  bidPrice: string;
  askPrice: string;
  weightedAvgPrice: string;
  priceChangePercent: string;
}

interface BinanceCache {
  symbols: Map<string, BinanceSymbol>;
  lastUpdate: number;
  exchangeInfo: {
    timezone: string;
    serverTime: number;
    rateLimits: any[];
    symbols: any[];
  } | null;
}

export class BinancePriceSource extends PriceSourceTool {
  private cache: BinanceCache;
  private updateInterval: number;
  private baseUrl: string;

  constructor(config: Partial<PriceSourceToolConfig> = {}) {
    super({
      type: PriceSourceType.BINANCE,
      chains: [ChainType.ETH, ChainType.BSC],
      priority: 1,
      weight: 0.3,
      rateLimit: {
        maxRequests: 1200,
        interval: 60000 // 1分钟
      },
      ...config
    });

    this.cache = {
      symbols: new Map(),
      lastUpdate: 0,
      exchangeInfo: null
    };
    this.updateInterval = 60000; // 1分钟更新一次价格信息
    this.baseUrl = "https://api.binance.com/api/v3";
  }

  protected async _call(input: string): Promise<string> {
    try {
      const params = JSON.parse(input);
      
      switch (params.action) {
        case "get-price":
          return await this.getPrice(params.pair);
        case "check-support":
          return JSON.stringify(this.isSupported(params.pair));
        case "get-confidence":
          return JSON.stringify(this.getConfidence());
        case "update-symbols":
          await this.updateSymbols();
          return "Symbols updated successfully";
        default:
          throw new Error(`Unknown action: ${params.action}`);
      }
    } catch (error) {
      if (error instanceof Error) {
        logger.error("Binance Price Source", error.message);
      }
      throw error;
    }
  }

  private async getPrice(pair: TokenPair): Promise<string> {
    // 检查并更新价格信息
    if (Date.now() - this.cache.lastUpdate > this.updateInterval) {
      await this.updateSymbols();
    }

    // 找到对应的交易对
    const symbol = await this.findMatchingSymbol(pair);
    if (!symbol) {
      throw new Error(`No matching symbol found for pair ${pair.baseToken}/${pair.quoteToken}`);
    }

    // 计算置信度
    const confidence = this.calculateConfidence(symbol);

    const priceData: PriceData = {
      pair,
      price: Number(symbol.weightedAvgPrice),
      timestamp: Date.now(),
      source: PriceSourceType.BINANCE,
      confidence,
      metadata: {
        symbol: symbol.symbol,
        volume24h: symbol.volume,
        priceChangePercent: symbol.priceChangePercent,
        bidPrice: symbol.bidPrice,
        askPrice: symbol.askPrice
      }
    };

    return JSON.stringify(priceData);
  }

  private async updateSymbols(): Promise<void> {
    try {
      // 获取交易所信息
      if (!this.cache.exchangeInfo) {
        const exchangeInfo = await this.fetchExchangeInfo();
        this.cache.exchangeInfo = exchangeInfo;
      }

      // 获取24小时价格统计
      const ticker24h = await this.fetch24hTicker();
      
      // 更新缓存
      this.cache.symbols.clear();
      ticker24h.forEach(symbol => {
        this.cache.symbols.set(symbol.symbol, symbol);
      });
      
      this.cache.lastUpdate = Date.now();
    } catch (error) {
      if (error instanceof Error) {
        logger.error("Binance Price Source", `Failed to update symbols: ${error.message}`);
      }
      throw error;
    }
  }

  private async fetchExchangeInfo(): Promise<any> {
    try {
      const response = await fetch(`${this.baseUrl}/exchangeInfo`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      if (error instanceof Error) {
        logger.error("Binance Price Source", `Failed to fetch exchange info: ${error.message}`);
      }
      throw error;
    }
  }

  private async fetch24hTicker(): Promise<BinanceSymbol[]> {
    try {
      const response = await fetch(`${this.baseUrl}/ticker/24hr`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      if (error instanceof Error) {
        logger.error("Binance Price Source", `Failed to fetch 24h ticker: ${error.message}`);
      }
      throw error;
    }
  }

  private async findMatchingSymbol(pair: TokenPair): Promise<BinanceSymbol | null> {
    const baseSymbol = this.normalizeToken(pair.baseToken);
    const quoteSymbol = this.normalizeToken(pair.quoteToken);
    
    // 尝试直接匹配
    const directSymbol = this.cache.symbols.get(`${baseSymbol}${quoteSymbol}`);
    if (directSymbol && directSymbol.status === "TRADING") {
      return directSymbol;
    }

    // 尝试反向匹配
    const reverseSymbol = this.cache.symbols.get(`${quoteSymbol}${baseSymbol}`);
    if (reverseSymbol && reverseSymbol.status === "TRADING") {
      // 调整价格为倒数
      return {
        ...reverseSymbol,
        lastPrice: (1 / Number(reverseSymbol.lastPrice)).toString(),
        weightedAvgPrice: (1 / Number(reverseSymbol.weightedAvgPrice)).toString(),
        bidPrice: (1 / Number(reverseSymbol.askPrice)).toString(),
        askPrice: (1 / Number(reverseSymbol.bidPrice)).toString()
      };
    }

    return null;
  }

  private normalizeToken(token: string): string {
    // 移除常见前缀
    token = token.toUpperCase()
      .replace("0X", "")
      .replace("WRAPPED", "W")
      .replace("TOKEN", "");

    // 特殊代币映射
    const tokenMap: Record<string, string> = {
      "WETH": "ETH",
      "WBTC": "BTC",
      "WBNB": "BNB",
      "USDT": "USDT",
      "USDC": "USDC",
      "DAI": "DAI"
    };

    return tokenMap[token] || token;
  }

  private calculateConfidence(symbol: BinanceSymbol): number {
    // 基于交易量和价格变化计算置信度
    const volume = Number(symbol.volume);
    const priceChange = Math.abs(Number(symbol.priceChangePercent));
    
    // 交易量分数：假设大于 1000 的交易量为满分
    const volumeScore = Math.min(volume / 1000, 1);
    
    // 价格稳定性分数：价格变化越小，分数越高
    const stabilityScore = Math.max(1 - priceChange / 100, 0);
    
    // 价差分数：价差越小，分数越高
    const spread = Math.abs(Number(symbol.askPrice) - Number(symbol.bidPrice)) / Number(symbol.lastPrice);
    const spreadScore = Math.max(1 - spread * 10, 0);

    // 可以添加更多因素来调整置信度
    const baseConfidence = this.getConfidence();
    return Math.min(
      baseConfidence * (0.4 * volumeScore + 0.3 * stabilityScore + 0.3 * spreadScore),
      1
    );
  }
} 