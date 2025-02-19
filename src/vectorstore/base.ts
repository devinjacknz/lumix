import { VectorStore } from '@langchain/core/vectorstores';
import { Document } from '@langchain/core/documents';
import { Embeddings } from '@langchain/core/embeddings';
import { Callbacks } from '@langchain/core/callbacks';
import { SearchParams, SearchResult } from './types';

export abstract class BaseVectorStore extends VectorStore {
  protected embeddings: Embeddings;
  protected dbConfig: Record<string, any>;

  constructor(embeddings: Embeddings, dbConfig: Record<string, any>) {
    super(embeddings, dbConfig);
    this.embeddings = embeddings;
    this.dbConfig = dbConfig;
  }

  _vectorstoreType(): string {
    return 'base';
  }

  async addDocuments(documents: Document[]): Promise<void> {
    const texts = documents.map(doc => doc.pageContent);
    const vectors = await this.embeddings.embedDocuments(texts);
    await this.addVectors(vectors, documents);
  }

  async similaritySearch(
    query: string,
    k = 4,
    filter?: Record<string, any>
  ): Promise<Document[]> {
    const queryEmbedding = await this.embeddings.embedQuery(query);
    const results = await this.similaritySearchVectorWithScore(queryEmbedding, k, filter);
    return results.map(([doc]) => doc);
  }

  protected abstract addVectors(
    vectors: number[][],
    documents: Document[]
  ): Promise<void>;

  protected abstract similaritySearchVectorWithScore(
    query: number[],
    k: number,
    filter?: Record<string, any>
  ): Promise<[Document, number][]>;
}
// ... existing code ...