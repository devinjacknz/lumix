import { logger } from '../monitoring';
import { databaseManager } from '../database';
import { chainAdapterFactory } from '../chain';
import { ChainType } from '../config/types';
import {
  TimeResolution,
  DataSourceType,
  BacktestConfig
} from './types';

// 市场数据接口
export interface MarketData {
  timestamp: Date;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
  trades: number;
  vwap?: string;
  gasPrice?: string;
}

// 数据源配置
export interface DataSourceConfig {
  type: DataSourceType;
  resolution: TimeResolution;
  startTime: Date;
  endTime: Date;
  chains: ChainType[];
  tokens: string[];
  cacheData: boolean;
}

export class DataManager {
  private config: DataSourceConfig;
  private dataCache: Map<string, MarketData[]> = new Map();
  private lastUpdate: Map<string, Date> = new Map();

  constructor(config: DataSourceConfig) {
    this.validateConfig(config);
    this.config = config;
  }

  // 加载数据
  public async loadData(): Promise<void> {
    try {
      for (const chain of this.config.chains) {
        for (const token of this.config.tokens) {
          const key = this.getDataKey(chain, token);
          
          // 检查缓存
          if (this.config.cacheData && this.dataCache.has(key)) {
            const lastUpdate = this.lastUpdate.get(key);
            if (this.isDataValid(lastUpdate)) {
              logger.debug('DataManager', `Using cached data for ${key}`);
              continue;
            }
          }

          // 加载数据
          const data = await this.loadMarketData(chain, token);
          this.dataCache.set(key, data);
          this.lastUpdate.set(key, new Date());

          logger.info('DataManager', `Loaded data for ${key}`, {
            records: data.length,
            startTime: data[0]?.timestamp,
            endTime: data[data.length - 1]?.timestamp
          });
        }
      }
    } catch (error) {
      logger.error('DataManager', 'Failed to load data', { error });
      throw error;
    }
  }

  // 获取市场数据
  public getMarketData(
    chain: ChainType,
    token: string,
    timestamp: Date
  ): MarketData | null {
    const key = this.getDataKey(chain, token);
    const data = this.dataCache.get(key);
    if (!data) return null;

    // 查找最接近的数据点
    const index = this.findClosestDataPoint(data, timestamp);
    return index >= 0 ? data[index] : null;
  }

  // 获取时间范围内的数据
  public getDataRange(
    chain: ChainType,
    token: string,
    startTime: Date,
    endTime: Date
  ): MarketData[] {
    const key = this.getDataKey(chain, token);
    const data = this.dataCache.get(key);
    if (!data) return [];

    return data.filter(d => 
      d.timestamp >= startTime && d.timestamp <= endTime
    );
  }

  // 获取所有可用的数据点
  public getAllData(
    chain: ChainType,
    token: string
  ): MarketData[] {
    const key = this.getDataKey(chain, token);
    return this.dataCache.get(key) || [];
  }

  // 清除缓存
  public clearCache(): void {
    this.dataCache.clear();
    this.lastUpdate.clear();
    logger.info('DataManager', 'Cache cleared');
  }

  // 验证数据源配置
  private validateConfig(config: DataSourceConfig): void {
    if (!config.chains || config.chains.length === 0) {
      throw new Error('No chains specified');
    }

    if (!config.tokens || config.tokens.length === 0) {
      throw new Error('No tokens specified');
    }

    if (config.startTime >= config.endTime) {
      throw new Error('Invalid time range');
    }

    // 验证时间分辨率
    const validResolutions = Object.values(TimeResolution);
    if (!validResolutions.includes(config.resolution)) {
      throw new Error(`Invalid resolution: ${config.resolution}`);
    }

    // 验证数据源类型
    const validSourceTypes = Object.values(DataSourceType);
    if (!validSourceTypes.includes(config.type)) {
      throw new Error(`Invalid data source type: ${config.type}`);
    }
  }

  // 加载市场数据
  private async loadMarketData(
    chain: ChainType,
    token: string
  ): Promise<MarketData[]> {
    switch (this.config.type) {
      case DataSourceType.HISTORICAL:
        return this.loadHistoricalData(chain, token);
      case DataSourceType.REAL_TIME:
        return this.loadRealTimeData(chain, token);
      case DataSourceType.SIMULATED:
        return this.generateSimulatedData(chain, token);
      default:
        throw new Error(`Unsupported data source type: ${this.config.type}`);
    }
  }

  // 加载历史数据
  private async loadHistoricalData(
    chain: ChainType,
    token: string
  ): Promise<MarketData[]> {
    try {
      // 从数据库加载数据
      const db = databaseManager.getAdapter();
      const query = `
        SELECT *
        FROM market_data
        WHERE chain = ? AND token = ?
          AND timestamp BETWEEN ? AND ?
        ORDER BY timestamp ASC
      `;

      const results = await db.query(query, [
        chain,
        token,
        this.config.startTime.toISOString(),
        this.config.endTime.toISOString()
      ]);

      // 转换数据格式
      return results.map(this.formatMarketData);
    } catch (error) {
      logger.error('DataManager', 'Failed to load historical data', {
        chain,
        token,
        error
      });
      throw error;
    }
  }

  // 加载实时数据
  private async loadRealTimeData(
    chain: ChainType,
    token: string
  ): Promise<MarketData[]> {
    try {
      // 获取链适配器
      const adapter = chainAdapterFactory.getAdapter(chain);

      // 获取实时数据
      const data: MarketData[] = [];
      let currentTime = this.config.startTime;

      while (currentTime <= this.config.endTime) {
        // 获取当前时间点的数据
        const marketData = await this.fetchRealTimeData(adapter, token, currentTime);
        if (marketData) {
          data.push(marketData);
        }

        // 前进到下一个时间点
        currentTime = this.advanceTime(currentTime);
      }

      return data;
    } catch (error) {
      logger.error('DataManager', 'Failed to load real-time data', {
        chain,
        token,
        error
      });
      throw error;
    }
  }

  // 生成模拟数据
  private generateSimulatedData(
    chain: ChainType,
    token: string
  ): MarketData[] {
    try {
      const data: MarketData[] = [];
      let currentTime = this.config.startTime;
      let currentPrice = this.getInitialPrice(token);

      while (currentTime <= this.config.endTime) {
        // 生成随机价格变动
        const priceChange = this.generateRandomPriceChange(currentPrice);
        currentPrice = currentPrice * (1 + priceChange);

        // 生成成交量
        const volume = this.generateRandomVolume(currentPrice);

        // 创建市场数据
        const marketData: MarketData = {
          timestamp: currentTime,
          open: currentPrice.toString(),
          high: (currentPrice * (1 + Math.random() * 0.01)).toString(),
          low: (currentPrice * (1 - Math.random() * 0.01)).toString(),
          close: currentPrice.toString(),
          volume: volume.toString(),
          trades: Math.floor(volume / 10),
          vwap: (currentPrice * (1 + (Math.random() - 0.5) * 0.002)).toString()
        };

        data.push(marketData);

        // 前进到下一个时间点
        currentTime = this.advanceTime(currentTime);
      }

      return data;
    } catch (error) {
      logger.error('DataManager', 'Failed to generate simulated data', {
        chain,
        token,
        error
      });
      throw error;
    }
  }

  // 辅助方法
  private getDataKey(chain: ChainType, token: string): string {
    return `${chain}:${token}`;
  }

  private isDataValid(lastUpdate: Date | undefined): boolean {
    if (!lastUpdate) return false;
    const cacheAge = Date.now() - lastUpdate.getTime();
    return cacheAge < 24 * 60 * 60 * 1000; // 24小时缓存
  }

  private findClosestDataPoint(data: MarketData[], timestamp: Date): number {
    let left = 0;
    let right = data.length - 1;

    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      const midTime = data[mid].timestamp;

      if (midTime.getTime() === timestamp.getTime()) {
        return mid;
      }

      if (midTime.getTime() < timestamp.getTime()) {
        left = mid + 1;
      } else {
        right = mid - 1;
      }
    }

    // 返回最接近的数据点
    if (right < 0) return 0;
    if (left >= data.length) return data.length - 1;

    const leftDiff = Math.abs(data[right].timestamp.getTime() - timestamp.getTime());
    const rightDiff = Math.abs(data[left].timestamp.getTime() - timestamp.getTime());

    return leftDiff <= rightDiff ? right : left;
  }

  private formatMarketData(raw: any): MarketData {
    return {
      timestamp: new Date(raw.timestamp),
      open: raw.open,
      high: raw.high,
      low: raw.low,
      close: raw.close,
      volume: raw.volume,
      trades: raw.trades,
      vwap: raw.vwap,
      gasPrice: raw.gas_price
    };
  }

  private async fetchRealTimeData(
    adapter: any,
    token: string,
    timestamp: Date
  ): Promise<MarketData | null> {
    // TODO: 实现实时数据获取
    return null;
  }

  private advanceTime(currentTime: Date): Date {
    const resolutionMap: Record<TimeResolution, number> = {
      [TimeResolution.TICK]: 1000,
      [TimeResolution.MINUTE_1]: 60 * 1000,
      [TimeResolution.MINUTE_5]: 5 * 60 * 1000,
      [TimeResolution.MINUTE_15]: 15 * 60 * 1000,
      [TimeResolution.MINUTE_30]: 30 * 60 * 1000,
      [TimeResolution.HOUR_1]: 60 * 60 * 1000,
      [TimeResolution.HOUR_4]: 4 * 60 * 60 * 1000,
      [TimeResolution.HOUR_12]: 12 * 60 * 60 * 1000,
      [TimeResolution.DAY_1]: 24 * 60 * 60 * 1000,
      [TimeResolution.WEEK_1]: 7 * 24 * 60 * 60 * 1000,
      [TimeResolution.MONTH_1]: 30 * 24 * 60 * 60 * 1000
    };

    const increment = resolutionMap[this.config.resolution];
    return new Date(currentTime.getTime() + increment);
  }

  private getInitialPrice(token: string): number {
    // 模拟初始价格
    const initialPrices: Record<string, number> = {
      'WETH': 2000,
      'WBTC': 40000,
      'USDC': 1
    };
    return initialPrices[token] || 100;
  }

  private generateRandomPriceChange(currentPrice: number): number {
    // 生成-1%到1%之间的随机价格变动
    return (Math.random() - 0.5) * 0.02;
  }

  private generateRandomVolume(price: number): number {
    // 生成与价格相关的随机成交量
    const baseVolume = price * 10;
    return baseVolume * (0.5 + Math.random());
  }
} 