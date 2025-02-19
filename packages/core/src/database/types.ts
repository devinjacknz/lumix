import { ChainType, TokenConfig } from '../config/types';
import { LogEntry } from '../monitoring/types';
import { WalletInfo } from '../security/types';

export interface DatabaseConfig {
  type: 'sqlite' | 'postgres';
  path?: string;  // SQLite专用
  host?: string;  // Postgres专用
  port?: number;  // Postgres专用
  username?: string;
  password?: string;
  database: string;
}

export interface TokenRecord extends TokenConfig {
  chainType: ChainType;
  lastUpdated: Date;
  isActive: boolean;
}

export interface TransactionRecord {
  id: string;
  chainType: ChainType;
  hash: string;
  from: string;
  to: string;
  value: string;
  timestamp: Date;
  status: 'pending' | 'confirmed' | 'failed';
  gasUsed?: string;
  gasPrice?: string;
  error?: string;
}

export interface DatabaseAdapter {
  // 连接管理
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;

  // Token管理
  saveToken(token: TokenRecord): Promise<void>;
  getToken(chainType: ChainType, symbol: string): Promise<TokenRecord | null>;
  listTokens(chainType: ChainType): Promise<TokenRecord[]>;
  updateToken(chainType: ChainType, symbol: string, updates: Partial<TokenRecord>): Promise<void>;
  deleteToken(chainType: ChainType, symbol: string): Promise<void>;

  // 交易记录
  saveTransaction(tx: TransactionRecord): Promise<void>;
  getTransaction(id: string): Promise<TransactionRecord | null>;
  listTransactions(options: {
    chainType?: ChainType;
    address?: string;
    status?: TransactionRecord['status'];
    startTime?: Date;
    endTime?: Date;
    limit?: number;
    offset?: number;
  }): Promise<TransactionRecord[]>;

  // 日志存储
  saveLogs(logs: LogEntry[]): Promise<void>;
  queryLogs(options: {
    level?: string;
    module?: string;
    startTime?: Date;
    endTime?: Date;
    limit?: number;
    offset?: number;
  }): Promise<LogEntry[]>;

  // 钱包信息
  saveWalletInfo(info: WalletInfo): Promise<void>;
  getWalletInfo(chain: ChainType): Promise<WalletInfo | null>;
  listWallets(): Promise<WalletInfo[]>;

  // 通用查询
  query<T>(sql: string, params?: any[]): Promise<T[]>;
  execute(sql: string, params?: any[]): Promise<void>;
} 