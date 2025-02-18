import { DatabaseAdapter } from '@lumix/core';
import {
  DeFiProtocol,
  ContractAnalysis,
  TokenMetrics,
  LiquidityAnalysis,
  MarketMetrics,
  CrawlerResult,
  DeFiEvent,
  AnalysisReport
} from '../types';

export interface StorageConfig {
  tableName: string;
  batchSize: number;
  retentionPeriod: number;
  compressionEnabled: boolean;
  indexFields: string[];
}

export class DeFiStorage {
  private db: DatabaseAdapter;
  private config: StorageConfig;

  constructor(db: DatabaseAdapter, config: StorageConfig) {
    this.db = db;
    this.config = config;
  }

  public async initialize(): Promise<void> {
    await this.createTables();
    await this.createIndexes();
  }

  private async createTables(): Promise<void> {
    // 创建协议数据表
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS defi_protocols (
        id TEXT PRIMARY KEY,
        chain TEXT NOT NULL,
        name TEXT NOT NULL,
        contract_address TEXT NOT NULL,
        tvl NUMERIC,
        apy NUMERIC,
        risks JSON,
        liquidity_pools JSON,
        governance JSON,
        created_at INTEGER,
        updated_at INTEGER,
        metadata JSON
      )
    `);

    // 创建合约分析表
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS contract_analysis (
        address TEXT PRIMARY KEY,
        bytecode_analysis JSON,
        security_analysis JSON,
        risk_assessment JSON,
        ai_analysis JSON,
        timestamp INTEGER,
        metadata JSON
      )
    `);

    // 创建代币指标表
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS token_metrics (
        token_address TEXT,
        chain TEXT,
        price NUMERIC,
        volume_24h NUMERIC,
        market_cap NUMERIC,
        holders INTEGER,
        price_changes JSON,
        social_metrics JSON,
        timestamp INTEGER,
        PRIMARY KEY (token_address, chain, timestamp)
      )
    `);

    // 创建流动性分析表
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS liquidity_analysis (
        pool_address TEXT,
        chain TEXT,
        total_liquidity NUMERIC,
        liquidity_depth NUMERIC,
        concentration_risk NUMERIC,
        pool_distribution JSON,
        historical_liquidity JSON,
        timestamp INTEGER,
        PRIMARY KEY (pool_address, chain, timestamp)
      )
    `);

    // 创建市场指标表
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS market_metrics (
        token_address TEXT,
        chain TEXT,
        volatility NUMERIC,
        correlation NUMERIC,
        momentum NUMERIC,
        trading_volume JSON,
        market_sentiment JSON,
        timestamp INTEGER,
        PRIMARY KEY (token_address, chain, timestamp)
      )
    `);

    // 创建爬虫结果表
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS crawler_results (
        id TEXT PRIMARY KEY,
        timestamp INTEGER,
        chain TEXT,
        protocol TEXT,
        data JSON,
        metadata JSON
      )
    `);

    // 创建事件表
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS defi_events (
        id TEXT PRIMARY KEY,
        type TEXT,
        severity TEXT,
        timestamp INTEGER,
        protocol TEXT,
        chain TEXT,
        data JSON,
        metadata JSON
      )
    `);

    // 创建分析报告表
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS analysis_reports (
        id TEXT PRIMARY KEY,
        timestamp INTEGER,
        protocol TEXT,
        chain TEXT,
        metrics JSON,
        risks JSON,
        recommendations JSON,
        metadata JSON
      )
    `);
  }

  private async createIndexes(): Promise<void> {
    // 为每个表创建索引
    for (const field of this.config.indexFields) {
      await this.db.execute(`
        CREATE INDEX IF NOT EXISTS idx_${field} ON ${this.config.tableName} (${field})
      `);
    }
  }

  // 协议数据存储
  public async saveProtocol(protocol: DeFiProtocol): Promise<void> {
    await this.db.execute(
      `INSERT OR REPLACE INTO defi_protocols (
        id, chain, name, contract_address, tvl, apy, risks,
        liquidity_pools, governance, created_at, updated_at, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        `${protocol.chain}:${protocol.contractAddress}`,
        protocol.chain,
        protocol.name,
        protocol.contractAddress,
        protocol.tvl,
        protocol.apy,
        JSON.stringify(protocol.risks),
        JSON.stringify(protocol.liquidityPools),
        JSON.stringify(protocol.governance),
        protocol.createdAt,
        protocol.updatedAt,
        '{}'
      ]
    );
  }

  public async getProtocol(chain: string, address: string): Promise<DeFiProtocol | null> {
    const result = await this.db.query(
      'SELECT * FROM defi_protocols WHERE chain = ? AND contract_address = ?',
      [chain, address]
    );

    if (result.length === 0) {
      return null;
    }

    const row = result[0];
    return {
      chain: row.chain,
      name: row.name,
      contractAddress: row.contract_address,
      tvl: row.tvl,
      apy: row.apy,
      risks: JSON.parse(row.risks),
      liquidityPools: JSON.parse(row.liquidity_pools),
      governance: JSON.parse(row.governance),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  // 合约分析存储
  public async saveContractAnalysis(analysis: ContractAnalysis): Promise<void> {
    await this.db.execute(
      `INSERT OR REPLACE INTO contract_analysis (
        address, bytecode_analysis, security_analysis,
        risk_assessment, ai_analysis, timestamp, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        analysis.address,
        JSON.stringify(analysis.bytecodeAnalysis),
        JSON.stringify(analysis.securityAnalysis),
        JSON.stringify(analysis.riskAssessment),
        JSON.stringify(analysis.aiAnalysis),
        analysis.timestamp,
        '{}'
      ]
    );
  }

  public async getContractAnalysis(address: string): Promise<ContractAnalysis | null> {
    const result = await this.db.query(
      'SELECT * FROM contract_analysis WHERE address = ?',
      [address]
    );

    if (result.length === 0) {
      return null;
    }

    const row = result[0];
    return {
      address: row.address,
      bytecodeAnalysis: JSON.parse(row.bytecode_analysis),
      securityAnalysis: JSON.parse(row.security_analysis),
      riskAssessment: JSON.parse(row.risk_assessment),
      aiAnalysis: JSON.parse(row.ai_analysis),
      timestamp: row.timestamp
    };
  }

  // 代币指标存储
  public async saveTokenMetrics(metrics: TokenMetrics): Promise<void> {
    await this.db.execute(
      `INSERT INTO token_metrics (
        token_address, chain, price, volume_24h, market_cap,
        holders, price_changes, social_metrics, timestamp
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        metrics.token,
        metrics.chain,
        metrics.price,
        metrics.volume24h,
        metrics.marketCap,
        metrics.holders,
        JSON.stringify(metrics.priceChange),
        JSON.stringify(metrics.socialMetrics),
        Date.now()
      ]
    );
  }

  public async getTokenMetrics(
    token: string,
    chain: string,
    timeRange?: { start: number; end: number }
  ): Promise<TokenMetrics[]> {
    let query = 'SELECT * FROM token_metrics WHERE token_address = ? AND chain = ?';
    const params = [token, chain];

    if (timeRange) {
      query += ' AND timestamp BETWEEN ? AND ?';
      params.push(timeRange.start, timeRange.end);
    }

    query += ' ORDER BY timestamp DESC';

    const results = await this.db.query(query, params);
    return results.map(row => ({
      token: row.token_address,
      chain: row.chain,
      price: row.price,
      volume24h: row.volume_24h,
      marketCap: row.market_cap,
      holders: row.holders,
      priceChange: JSON.parse(row.price_changes),
      socialMetrics: JSON.parse(row.social_metrics)
    }));
  }

  // 流动性分析存储
  public async saveLiquidityAnalysis(analysis: LiquidityAnalysis): Promise<void> {
    await this.db.execute(
      `INSERT INTO liquidity_analysis (
        pool_address, chain, total_liquidity, liquidity_depth,
        concentration_risk, pool_distribution, historical_liquidity, timestamp
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        analysis.pool,
        analysis.chain,
        analysis.totalLiquidity,
        analysis.liquidityDepth,
        analysis.concentrationRisk,
        JSON.stringify(analysis.poolDistribution),
        JSON.stringify(analysis.historicalLiquidity),
        Date.now()
      ]
    );
  }

  // 市场指标存储
  public async saveMarketMetrics(metrics: MarketMetrics): Promise<void> {
    await this.db.execute(
      `INSERT INTO market_metrics (
        token_address, chain, volatility, correlation,
        momentum, trading_volume, market_sentiment, timestamp
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        metrics.token,
        metrics.chain,
        metrics.volatility,
        metrics.correlation,
        metrics.momentum,
        JSON.stringify(metrics.tradingVolume),
        JSON.stringify(metrics.marketSentiment),
        Date.now()
      ]
    );
  }

  // 爬虫结果存储
  public async saveCrawlerResult(result: CrawlerResult): Promise<void> {
    await this.db.execute(
      `INSERT INTO crawler_results (
        id, timestamp, chain, protocol, data, metadata
      ) VALUES (?, ?, ?, ?, ?, ?)`,
      [
        `${result.chain}:${result.protocol}:${result.timestamp}`,
        result.timestamp,
        result.chain,
        result.protocol,
        JSON.stringify(result.data),
        JSON.stringify(result.metadata)
      ]
    );
  }

  // DeFi 事件存储
  public async saveEvent(event: DeFiEvent): Promise<void> {
    await this.db.execute(
      `INSERT INTO defi_events (
        id, type, severity, timestamp, protocol,
        chain, data, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        `${event.type}:${event.protocol}:${event.timestamp}`,
        event.type,
        event.severity,
        event.timestamp,
        event.protocol,
        event.chain,
        JSON.stringify(event.data),
        JSON.stringify(event.metadata)
      ]
    );
  }

  // 分析报告存储
  public async saveAnalysisReport(report: AnalysisReport): Promise<void> {
    await this.db.execute(
      `INSERT INTO analysis_reports (
        id, timestamp, protocol, chain, metrics,
        risks, recommendations, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        `${report.protocol}:${report.chain}:${report.timestamp}`,
        report.timestamp,
        report.protocol,
        report.chain,
        JSON.stringify(report.metrics),
        JSON.stringify(report.risks),
        JSON.stringify(report.recommendations),
        JSON.stringify(report.metadata)
      ]
    );
  }

  // 数据清理
  public async cleanup(): Promise<void> {
    const cutoff = Date.now() - this.config.retentionPeriod;

    // 清理各个表的过期数据
    const tables = [
      'token_metrics',
      'liquidity_analysis',
      'market_metrics',
      'crawler_results',
      'defi_events',
      'analysis_reports'
    ];

    for (const table of tables) {
      await this.db.execute(
        `DELETE FROM ${table} WHERE timestamp < ?`,
        [cutoff]
      );
    }
  }

  // 批量操作
  public async batchInsert<T>(
    items: T[],
    table: string,
    transform: (item: T) => any[]
  ): Promise<void> {
    const batchSize = this.config.batchSize;
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      const values = batch.map(transform);
      
      const placeholders = values[0].map(() => '?').join(',');
      const sql = `INSERT INTO ${table} VALUES (${placeholders})`;
      
      await this.db.executeBatch(sql, values);
    }
  }

  // 压缩数据
  public async compressOldData(): Promise<void> {
    if (!this.config.compressionEnabled) {
      return;
    }

    // TODO: 实现数据压缩逻辑
  }
} 