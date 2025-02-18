import { DatabaseAdapter } from '../database/types';
import { logger } from '../monitoring';
import { ChainType } from '../config/types';
import { MarketData } from './data-manager';

export class MarketDataAdapter {
  private db: DatabaseAdapter;

  constructor(db: DatabaseAdapter) {
    this.db = db;
  }

  // 初始化数据库表
  public async initialize(): Promise<void> {
    try {
      await this.createTables();
      logger.info('MarketDataAdapter', 'Database tables initialized');
    } catch (error) {
      logger.error('MarketDataAdapter', 'Failed to initialize database tables', { error });
      throw error;
    }
  }

  // 保存市场数据
  public async saveMarketData(
    chain: ChainType,
    token: string,
    data: MarketData[]
  ): Promise<void> {
    try {
      // 批量插入数据
      const values = data.map(d => [
        chain,
        token,
        d.timestamp.toISOString(),
        d.open,
        d.high,
        d.low,
        d.close,
        d.volume,
        d.trades,
        d.vwap || null,
        d.gasPrice || null
      ]);

      const sql = `
        INSERT INTO market_data (
          chain,
          token,
          timestamp,
          open,
          high,
          low,
          close,
          volume,
          trades,
          vwap,
          gas_price
        ) VALUES ?
        ON DUPLICATE KEY UPDATE
          open = VALUES(open),
          high = VALUES(high),
          low = VALUES(low),
          close = VALUES(close),
          volume = VALUES(volume),
          trades = VALUES(trades),
          vwap = VALUES(vwap),
          gas_price = VALUES(gas_price)
      `;

      await this.db.execute(sql, [values]);

      logger.info('MarketDataAdapter', `Saved market data for ${chain}:${token}`, {
        records: data.length
      });
    } catch (error) {
      logger.error('MarketDataAdapter', 'Failed to save market data', {
        chain,
        token,
        error
      });
      throw error;
    }
  }

  // 获取市场数据
  public async getMarketData(
    chain: ChainType,
    token: string,
    startTime: Date,
    endTime: Date
  ): Promise<MarketData[]> {
    try {
      const sql = `
        SELECT *
        FROM market_data
        WHERE chain = ? AND token = ?
          AND timestamp BETWEEN ? AND ?
        ORDER BY timestamp ASC
      `;

      const results = await this.db.query(sql, [
        chain,
        token,
        startTime.toISOString(),
        endTime.toISOString()
      ]);

      return results.map(this.formatMarketData);
    } catch (error) {
      logger.error('MarketDataAdapter', 'Failed to get market data', {
        chain,
        token,
        error
      });
      throw error;
    }
  }

  // 删除市场数据
  public async deleteMarketData(
    chain: ChainType,
    token: string,
    startTime?: Date,
    endTime?: Date
  ): Promise<void> {
    try {
      let sql = 'DELETE FROM market_data WHERE chain = ? AND token = ?';
      const params: any[] = [chain, token];

      if (startTime && endTime) {
        sql += ' AND timestamp BETWEEN ? AND ?';
        params.push(startTime.toISOString(), endTime.toISOString());
      }

      await this.db.execute(sql, params);

      logger.info('MarketDataAdapter', `Deleted market data for ${chain}:${token}`, {
        startTime,
        endTime
      });
    } catch (error) {
      logger.error('MarketDataAdapter', 'Failed to delete market data', {
        chain,
        token,
        error
      });
      throw error;
    }
  }

  // 获取可用的代币列表
  public async getAvailableTokens(chain: ChainType): Promise<string[]> {
    try {
      const sql = `
        SELECT DISTINCT token
        FROM market_data
        WHERE chain = ?
        ORDER BY token ASC
      `;

      const results = await this.db.query(sql, [chain]);
      return results.map((r: any) => r.token);
    } catch (error) {
      logger.error('MarketDataAdapter', 'Failed to get available tokens', {
        chain,
        error
      });
      throw error;
    }
  }

  // 获取数据时间范围
  public async getDataTimeRange(
    chain: ChainType,
    token: string
  ): Promise<{
    startTime: Date;
    endTime: Date;
    count: number;
  }> {
    try {
      const sql = `
        SELECT
          MIN(timestamp) as start_time,
          MAX(timestamp) as end_time,
          COUNT(*) as count
        FROM market_data
        WHERE chain = ? AND token = ?
      `;

      const results = await this.db.query(sql, [chain, token]);
      const result = results[0];

      return {
        startTime: new Date(result.start_time),
        endTime: new Date(result.end_time),
        count: result.count
      };
    } catch (error) {
      logger.error('MarketDataAdapter', 'Failed to get data time range', {
        chain,
        token,
        error
      });
      throw error;
    }
  }

  // 获取数据统计信息
  public async getDataStats(
    chain: ChainType,
    token: string
  ): Promise<{
    totalRecords: number;
    firstTimestamp: Date;
    lastTimestamp: Date;
    avgVolume: string;
    maxVolume: string;
    minPrice: string;
    maxPrice: string;
  }> {
    try {
      const sql = `
        SELECT
          COUNT(*) as total_records,
          MIN(timestamp) as first_timestamp,
          MAX(timestamp) as last_timestamp,
          AVG(CAST(volume AS DECIMAL(65,20))) as avg_volume,
          MAX(CAST(volume AS DECIMAL(65,20))) as max_volume,
          MIN(CAST(low AS DECIMAL(65,20))) as min_price,
          MAX(CAST(high AS DECIMAL(65,20))) as max_price
        FROM market_data
        WHERE chain = ? AND token = ?
      `;

      const results = await this.db.query(sql, [chain, token]);
      const result = results[0];

      return {
        totalRecords: result.total_records,
        firstTimestamp: new Date(result.first_timestamp),
        lastTimestamp: new Date(result.last_timestamp),
        avgVolume: result.avg_volume.toString(),
        maxVolume: result.max_volume.toString(),
        minPrice: result.min_price.toString(),
        maxPrice: result.max_price.toString()
      };
    } catch (error) {
      logger.error('MarketDataAdapter', 'Failed to get data stats', {
        chain,
        token,
        error
      });
      throw error;
    }
  }

  // 创建数据库表
  private async createTables(): Promise<void> {
    const sql = `
      CREATE TABLE IF NOT EXISTS market_data (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        chain VARCHAR(20) NOT NULL,
        token VARCHAR(100) NOT NULL,
        timestamp DATETIME NOT NULL,
        open VARCHAR(65) NOT NULL,
        high VARCHAR(65) NOT NULL,
        low VARCHAR(65) NOT NULL,
        close VARCHAR(65) NOT NULL,
        volume VARCHAR(65) NOT NULL,
        trades INT NOT NULL,
        vwap VARCHAR(65),
        gas_price VARCHAR(65),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_chain_token (chain, token),
        INDEX idx_timestamp (timestamp),
        UNIQUE INDEX idx_unique_data (chain, token, timestamp)
      )
    `;

    await this.db.execute(sql);
  }

  // 格式化市场数据
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
} 