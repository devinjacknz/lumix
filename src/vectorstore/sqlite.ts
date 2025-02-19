import { VectorStore } from '@langchain/core/vectorstores';
import { Embeddings } from '@langchain/core/embeddings';
import { Document } from '@langchain/core/documents';
import { SqliteDatabase } from '../database/sqlite';

export interface SQLiteVectorStoreConfig {
  tableName: string;
  namespace: string;
  database: SqliteDatabase;
}

export class SQLiteVectorStore extends VectorStore {
  private config: SQLiteVectorStoreConfig;
  private db: SqliteDatabase;

  constructor(embeddings: Embeddings, config: SQLiteVectorStoreConfig) {
    super(embeddings);
    this.config = {
      tableName: config.tableName || 'vectors',
      namespace: config.namespace || 'default',
      database: config.database
    };
    this.db = config.database;
    this.initializeDatabase();
  }

  private async initializeDatabase(): Promise<void> {
    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS ${this.config.tableName} (
        id TEXT PRIMARY KEY,
        namespace TEXT NOT NULL,
        vector BLOB NOT NULL,
        content TEXT,
        metadata TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_namespace ON ${this.config.tableName}(namespace);
    `);
  }

  async addVectors(vectors: number[][], documents: Document[], options?: { namespace?: string }): Promise<string[]> {
    const namespace = options?.namespace || this.config.namespace;
    const ids: string[] = [];

    for (let i = 0; i < vectors.length; i++) {
      const id = crypto.randomUUID();
      const vector = Buffer.from(new Float64Array(vectors[i]).buffer);
      const metadata = documents[i].metadata ? JSON.stringify(documents[i].metadata) : null;

      await this.db.run(
        `INSERT INTO ${this.config.tableName} (id, namespace, vector, content, metadata) VALUES (?, ?, ?, ?, ?)`,
        [id, namespace, vector, documents[i].pageContent, metadata]
      );

      ids.push(id);
    }

    return ids;
  }

  async similaritySearchVectorWithScore(query: number[], k: number, filter?: { namespace?: string }): Promise<[Document, number][]> {
    const namespace = filter?.namespace || this.config.namespace;
    const results = await this.db.all(
      `SELECT id, content, metadata, vector FROM ${this.config.tableName} WHERE namespace = ?`,
      [namespace]
    );

    const scores: [Document, number][] = results.map(row => {
      const vector = new Float64Array(row.vector.buffer);
      const similarity = this.cosineSimilarity(query, Array.from(vector));
      const metadata = row.metadata ? JSON.parse(row.metadata) : {};
      return [new Document({ pageContent: row.content, metadata }), similarity];
    });

    return scores.sort((a, b) => b[1] - a[1]).slice(0, k);
  }

  async deleteVectors(ids?: string[], filter?: { namespace?: string }): Promise<void> {
    const namespace = filter?.namespace || this.config.namespace;
    if (ids?.length) {
      await this.db.run(
        `DELETE FROM ${this.config.tableName} WHERE namespace = ? AND id IN (${ids.map(() => '?').join(',')})`,
        [namespace, ...ids]
      );
    } else {
      await this.db.run(
        `DELETE FROM ${this.config.tableName} WHERE namespace = ?`,
        [namespace]
      );
    }
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
    const magnitudeA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
    const magnitudeB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
    return dotProduct / (magnitudeA * magnitudeB);
  }
} 