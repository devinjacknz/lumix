import { Database } from 'sqlite3';
import { Document } from '@langchain/core/documents';
import { Embeddings } from '@langchain/core/embeddings';
import { BaseVectorStore } from './base';

export class SQLiteVectorStore extends BaseVectorStore {
  private db: Database;
  private tableName: string;

  constructor(embeddings: Embeddings, dbConfig: Record<string, any>) {
    super(embeddings, dbConfig);
    this.tableName = dbConfig.tableName || 'vectors';
    this.db = new Database(dbConfig.dbPath || ':memory:');
    
    if (dbConfig.createIndexes !== false) {
      this.initializeDatabase();
    }
  }

  _vectorstoreType(): string {
    return 'sqlite';
  }

  protected async addVectors(
    vectors: number[][],
    documents: Document[],
    options?: Record<string, any>
  ): Promise<void | string[]> {
    const namespace = options?.namespace || 'default';
    const sql = `INSERT INTO ${this.tableName} 
      (namespace, vector, content, metadata) 
      VALUES (?, ?, ?, ?)`;

    const ids: string[] = [];
    for (let i = 0; i < vectors.length; i++) {
      const vector = vectors[i];
      const doc = documents[i];
      const id = crypto.randomUUID();
      await this.executeQuery(sql, [
        namespace,
        JSON.stringify(vector),
        doc.pageContent,
        JSON.stringify(doc.metadata)
      ]);
      ids.push(id);
    }
    return ids;
  }

  protected async similaritySearchVectorWithScore(
    query: number[],
    k: number = 4,
    filter?: Record<string, any>
  ): Promise<[Document, number][]> {
    let sql = `SELECT content, metadata, vector FROM ${this.tableName}`;
    const params: any[] = [];

    if (filter) {
      sql += ' WHERE ';
      const conditions: string[] = [];
      Object.entries(filter).forEach(([key, value]) => {
        conditions.push(`json_extract(metadata, '$.${key}') = ?`);
        params.push(value);
      });
      sql += conditions.join(' AND ');
    }

    const rows = await this.executeQuery(sql, params);
    const results: [Document, number][] = [];

    for (const row of rows) {
      const vector = JSON.parse(row.vector);
      const similarity = this.calculateSimilarity(query, vector);
      const doc = new Document({
        pageContent: row.content,
        metadata: JSON.parse(row.metadata)
      });
      results.push([doc, similarity]);
    }

    results.sort((a, b) => b[1] - a[1]);
    return results.slice(0, k);
  }

  private async initializeDatabase(): Promise<void> {
    await this.executeQuery(`
      CREATE TABLE IF NOT EXISTS ${this.tableName} (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        namespace TEXT NOT NULL,
        vector TEXT NOT NULL,
        content TEXT NOT NULL,
        metadata TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await this.executeQuery(`
      CREATE INDEX IF NOT EXISTS idx_${this.tableName}_namespace 
      ON ${this.tableName}(namespace)
    `);
  }

  private executeQuery(sql: string, params: any[] = []): Promise<any[]> {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (error, rows) => {
        if (error) reject(error);
        else resolve(rows || []);
      });
    });
  }

  async deleteVectors(params: {
    ids?: string[];
    filter?: Record<string, any>;
    namespace?: string;
  }): Promise<void> {
    const conditions: string[] = [];
    const queryParams: any[] = [];

    if (params.ids?.length) {
      conditions.push('id IN (' + params.ids.map(() => '?').join(',') + ')');
      queryParams.push(...params.ids);
    }

    if (params.namespace) {
      conditions.push('namespace = ?');
      queryParams.push(params.namespace);
    }

    if (params.filter) {
      Object.entries(params.filter).forEach(([key, value]) => {
        conditions.push(`json_extract(metadata, '$.${key}') = ?`);
        queryParams.push(value);
      });
    }

    const sql = `DELETE FROM ${this.tableName}` +
      (conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '');

    await this.executeQuery(sql, queryParams);
  }

  async close(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.close(error => {
        if (error) reject(error);
        else resolve();
      });
    });
  }
}