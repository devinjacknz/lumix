import { Database } from 'sqlite3';
import { DatabaseAdapter, DatabaseConfig, TokenRecord, TransactionRecord } from './types';
import { ChainType } from '../config/types';
import { LogEntry } from '../monitoring/types';
import { WalletInfo } from '../security/types';
import { logger } from '../monitoring';

export class SQLiteAdapter implements DatabaseAdapter {
  private db: Database | null = null;
  private readonly config: DatabaseConfig;

  constructor(config: DatabaseConfig) {
    if (config.type !== 'sqlite') {
      throw new Error('Invalid database type for SQLiteAdapter');
    }
    this.config = config;
  }

  public async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db = new Database(this.config.path || ':memory:', async (err) => {
        if (err) {
          reject(err);
          return;
        }
        
        try {
          await this.initializeTables();
          resolve();
        } catch (error) {
          reject(error);
        }
      });
    });
  }

  public async disconnect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        resolve();
        return;
      }
      this.db.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  public isConnected(): boolean {
    return this.db !== null;
  }

  private async initializeTables(): Promise<void> {
    const schemas = [
      `CREATE TABLE IF NOT EXISTS tokens (
        chain_type TEXT NOT NULL,
        symbol TEXT NOT NULL,
        address TEXT NOT NULL,
        decimals INTEGER NOT NULL,
        last_updated DATETIME NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT 1,
        PRIMARY KEY (chain_type, symbol)
      )`,
      
      `CREATE TABLE IF NOT EXISTS transactions (
        id TEXT PRIMARY KEY,
        chain_type TEXT NOT NULL,
        hash TEXT NOT NULL,
        from_address TEXT NOT NULL,
        to_address TEXT NOT NULL,
        value TEXT NOT NULL,
        timestamp DATETIME NOT NULL,
        status TEXT NOT NULL,
        gas_used TEXT,
        gas_price TEXT,
        error TEXT
      )`,
      
      `CREATE TABLE IF NOT EXISTS logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp DATETIME NOT NULL,
        level TEXT NOT NULL,
        module TEXT NOT NULL,
        message TEXT NOT NULL,
        metadata TEXT
      )`,
      
      `CREATE TABLE IF NOT EXISTS wallets (
        chain_type TEXT PRIMARY KEY,
        address TEXT NOT NULL,
        encrypted_private_key TEXT NOT NULL,
        last_used DATETIME NOT NULL
      )`
    ];

    for (const schema of schemas) {
      await this.execute(schema);
    }
  }

  // Token管理
  public async saveToken(token: TokenRecord): Promise<void> {
    const sql = `
      INSERT OR REPLACE INTO tokens 
      (chain_type, symbol, address, decimals, last_updated, is_active)
      VALUES (?, ?, ?, ?, ?, ?)
    `;
    
    await this.execute(sql, [
      token.chainType,
      token.symbol,
      token.address,
      token.decimals,
      token.lastUpdated.toISOString(),
      token.isActive ? 1 : 0
    ]);
  }

  public async getToken(chainType: ChainType, symbol: string): Promise<TokenRecord | null> {
    const sql = `
      SELECT * FROM tokens 
      WHERE chain_type = ? AND symbol = ?
    `;
    
    const results = await this.query<TokenRecord>(sql, [chainType, symbol]);
    return results.length > 0 ? this.mapTokenRecord(results[0]) : null;
  }

  public async listTokens(chainType: ChainType): Promise<TokenRecord[]> {
    const sql = `
      SELECT * FROM tokens 
      WHERE chain_type = ? AND is_active = 1
    `;
    
    const results = await this.query<TokenRecord>(sql, [chainType]);
    return results.map(this.mapTokenRecord);
  }

  // 交易记录
  public async saveTransaction(tx: TransactionRecord): Promise<void> {
    const sql = `
      INSERT OR REPLACE INTO transactions 
      (id, chain_type, hash, from_address, to_address, value, timestamp, status, gas_used, gas_price, error)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    await this.execute(sql, [
      tx.id,
      tx.chainType,
      tx.hash,
      tx.from,
      tx.to,
      tx.value,
      tx.timestamp.toISOString(),
      tx.status,
      tx.gasUsed,
      tx.gasPrice,
      tx.error
    ]);
  }

  public async getTransaction(id: string): Promise<TransactionRecord | null> {
    const sql = `SELECT * FROM transactions WHERE id = ?`;
    const results = await this.query<TransactionRecord>(sql, [id]);
    return results.length > 0 ? this.mapTransactionRecord(results[0]) : null;
  }

  // 日志存储
  public async saveLogs(logs: LogEntry[]): Promise<void> {
    const sql = `
      INSERT INTO logs (timestamp, level, module, message, metadata)
      VALUES (?, ?, ?, ?, ?)
    `;
    
    for (const log of logs) {
      await this.execute(sql, [
        log.timestamp.toISOString(),
        log.level,
        log.module,
        log.message,
        log.metadata ? JSON.stringify(log.metadata) : null
      ]);
    }
  }

  public async queryLogs(options: {
    level?: string;
    module?: string;
    startTime?: Date;
    endTime?: Date;
    limit?: number;
    offset?: number;
  }): Promise<LogEntry[]> {
    let sql = `SELECT * FROM logs WHERE 1=1`;
    const params: any[] = [];

    if (options.level) {
      sql += ` AND level = ?`;
      params.push(options.level);
    }
    if (options.module) {
      sql += ` AND module = ?`;
      params.push(options.module);
    }
    if (options.startTime) {
      sql += ` AND timestamp >= ?`;
      params.push(options.startTime.toISOString());
    }
    if (options.endTime) {
      sql += ` AND timestamp <= ?`;
      params.push(options.endTime.toISOString());
    }

    sql += ` ORDER BY timestamp DESC`;
    
    if (options.limit) {
      sql += ` LIMIT ?`;
      params.push(options.limit);
    }
    if (options.offset) {
      sql += ` OFFSET ?`;
      params.push(options.offset);
    }

    const results = await this.query<LogEntry>(sql, params);
    return results.map(this.mapLogEntry);
  }

  // 钱包信息
  public async saveWalletInfo(info: WalletInfo): Promise<void> {
    const sql = `
      INSERT OR REPLACE INTO wallets 
      (chain_type, address, encrypted_private_key, last_used)
      VALUES (?, ?, ?, ?)
    `;
    
    await this.execute(sql, [
      info.chain,
      info.address,
      JSON.stringify(info.encryptedPrivateKey),
      info.lastUsed.toISOString()
    ]);
  }

  public async getWalletInfo(chain: ChainType): Promise<WalletInfo | null> {
    const sql = `SELECT * FROM wallets WHERE chain_type = ?`;
    const results = await this.query<WalletInfo>(sql, [chain]);
    return results.length > 0 ? this.mapWalletInfo(results[0]) : null;
  }

  public async listWallets(): Promise<WalletInfo[]> {
    const sql = `SELECT * FROM wallets`;
    const results = await this.query<WalletInfo>(sql);
    return results.map(this.mapWalletInfo);
  }

  // 通用查询
  public async query<T>(sql: string, params: any[] = []): Promise<T[]> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not connected'));
        return;
      }
      this.db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows as T[]);
      });
    });
  }

  public async execute(sql: string, params: any[] = []): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not connected'));
        return;
      }
      this.db.run(sql, params, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  // 数据映射方法
  private mapTokenRecord(row: any): TokenRecord {
    return {
      chainType: row.chain_type,
      symbol: row.symbol,
      address: row.address,
      decimals: row.decimals,
      lastUpdated: new Date(row.last_updated),
      isActive: Boolean(row.is_active)
    };
  }

  private mapTransactionRecord(row: any): TransactionRecord {
    return {
      id: row.id,
      chainType: row.chain_type,
      hash: row.hash,
      from: row.from_address,
      to: row.to_address,
      value: row.value,
      timestamp: new Date(row.timestamp),
      status: row.status,
      gasUsed: row.gas_used,
      gasPrice: row.gas_price,
      error: row.error
    };
  }

  private mapLogEntry(row: any): LogEntry {
    return {
      timestamp: new Date(row.timestamp),
      level: row.level,
      module: row.module,
      message: row.message,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined
    };
  }

  private mapWalletInfo(row: any): WalletInfo {
    return {
      chain: row.chain_type,
      address: row.address,
      encryptedPrivateKey: JSON.parse(row.encrypted_private_key),
      lastUsed: new Date(row.last_used)
    };
  }
} 