import { Database } from 'sqlite3';
import { Document } from '@langchain/core/documents';
import { BaseVectorStore, VectorStoreConfig, SearchParams, SearchResult } from './base';

/**
 * SQLite 向量存储配置
 */
export interface SQLiteVectorStoreConfig extends VectorStoreConfig {
  dbPath?: string;
  tableName?: string;
  createIndexes?: boolean;
}

/**
 * 基于 SQLite 的向量存储
 */
export class SQLiteVectorStore extends BaseVectorStore {
  private db: Database;
  private tableName: string;

  constructor(config: SQLiteVectorStoreConfig) {
    super(config);
    this.tableName = config.tableName || 'vectors';
    this.db = new Database(config.dbPath || ':memory:');
    
    if (config.createIndexes !== false) {
      this.initializeDatabase();
    }
  }

  /**
   * 初始化数据库
   */
  private async initializeDatabase(): Promise<void> {
    await this.executeQuery(`
      CREATE TABLE IF NOT EXISTS ${this.tableName} (
        id TEXT PRIMARY KEY,
        vector BLOB NOT NULL,
        document TEXT NOT NULL,
        metadata TEXT,
        namespace TEXT NOT NULL
      )
    `);

    await this.executeQuery(`
      CREATE INDEX IF NOT EXISTS idx_${this.tableName}_namespace 
      ON ${this.tableName}(namespace)
    `);
  }

  /**
   * 添加向量
   */
  protected async addVectors(
    vectors: number[][],
    documents: Document[],
    namespace: string
  ): Promise<void> {
    const values = vectors.map((vector, i) => {
      const document = documents[i];
      return {
        id: document.metadata.id || crypto.randomUUID(),
        vector: Buffer.from(new Float64Array(vector).buffer),
        document: JSON.stringify({
          pageContent: document.pageContent,
          metadata: document.metadata
        }),
        metadata: JSON.stringify(document.metadata),
        namespace
      };
    });

    // 批量插入
    const placeholders = values.map(() => '(?, ?, ?, ?, ?)').join(',');
    const sql = `
      INSERT OR REPLACE INTO ${this.tableName}
      (id, vector, document, metadata, namespace)
      VALUES ${placeholders}
    `;

    const params = values.flatMap(v => [
      v.id,
      v.vector,
      v.document,
      v.metadata,
      v.namespace
    ]);

    await this.executeQuery(sql, params);
  }

  /**
   * 向量相似度搜索
   */
  protected async similaritySearchVectorWithScore(
    query: number[],
    k: number,
    params?: SearchParams
  ): Promise<SearchResult[]> {
    const namespace = params?.namespace || this.config.namespace;
    const minSimilarity = params?.minSimilarity || 0;

    // 获取所有向量
    const sql = `
      SELECT id, vector, document, metadata
      FROM ${this.tableName}
      WHERE namespace = ?
    `;

    const rows = await this.executeQuery(sql, [namespace]);

    // 计算相似度并排序
    const results = rows.map(row => {
      const vector = new Float64Array(row.vector.buffer);
      const similarity = this.calculateSimilarity(query, Array.from(vector));
      const document = JSON.parse(row.document);
      
      return {
        document: new Document({
          pageContent: document.pageContent,
          metadata: document.metadata
        }),
        score: similarity,
        metadata: JSON.parse(row.metadata)
      };
    });

    // 过滤和排序
    return results
      .filter(r => r.score >= minSimilarity)
      .sort((a, b) => b.score - a.score)
      .slice(0, k);
  }

  /**
   * 删除向量
   */
  protected async deleteVectors(params: {
    ids?: string[];
    filter?: Record<string, any>;
    namespace?: string;
  }): Promise<void> {
    const conditions: string[] = [];
    const values: any[] = [];

    if (params.namespace) {
      conditions.push('namespace = ?');
      values.push(params.namespace);
    }

    if (params.ids?.length) {
      conditions.push(`id IN (${params.ids.map(() => '?').join(',')})`);
      values.push(...params.ids);
    }

    if (params.filter) {
      const metadata = JSON.stringify(params.filter);
      conditions.push('metadata @> ?');
      values.push(metadata);
    }

    const whereClause = conditions.length
      ? `WHERE ${conditions.join(' AND ')}`
      : '';

    const sql = `DELETE FROM ${this.tableName} ${whereClause}`;
    await this.executeQuery(sql, values);
  }

  /**
   * 执行查询
   */
  private executeQuery(sql: string, params: any[] = []): Promise<any[]> {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (error, rows) => {
        if (error) reject(error);
        else resolve(rows || []);
      });
    });
  }

  /**
   * 关闭数据库连接
   */
  async close(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.close(error => {
        if (error) reject(error);
        else resolve();
      });
    });
  }
} 