import { z } from 'zod';
import {
  KnowledgeResult,
  KnowledgeItem,
  KnowledgeRetrievalResult,
  KnowledgeManagerConfig,
  RAGConfig,
  RAGGenerationOptions,
  RAGGenerationResult,
  KnowledgeManager,
  RAGKnowledgeManager,
  KnowledgeRetrievalOptions,
  IKnowledgeManager
} from '../knowledge';
import { BaseResult, BaseManager } from '../base';

describe('Knowledge Types', () => {
  describe('KnowledgeResult', () => {
    const resultSchema = z.object({
      success: z.boolean(),
      error: z.string().optional(),
      data: z.any().optional()
    });

    test('validates empty result', () => {
      const result: KnowledgeResult = { success: true };
      expect(resultSchema.parse(result)).toEqual(result);
    });

    test('validates result with error', () => {
      const result: KnowledgeResult = {
        success: false,
        error: 'Operation failed'
      };
      expect(resultSchema.parse(result)).toEqual(result);
    });

    test('validates result with data', () => {
      const result: KnowledgeResult<string> = {
        success: true,
        data: 'test data'
      };
      expect(resultSchema.parse(result)).toEqual(result);
    });

    test('validates result with complex data', () => {
      const result: KnowledgeResult<{ nested: { value: number } }> = {
        success: true,
        data: { nested: { value: 42 } }
      };
      expect(resultSchema.parse(result)).toEqual(result);
    });
  });

  describe('KnowledgeItem', () => {
    const itemSchema = z.object({
      id: z.string(),
      content: z.string(),
      metadata: z.record(z.any()).optional(),
      embedding: z.array(z.number()).optional(),
      timestamp: z.date().optional()
    });

    test('validates minimal item', () => {
      const item: KnowledgeItem = {
        id: '123',
        content: 'Test content'
      };
      expect(itemSchema.parse(item)).toEqual(item);
    });

    test('validates item with all fields', () => {
      const item: KnowledgeItem = {
        id: '123',
        content: 'Test content',
        metadata: { source: 'test', tags: ['tag1', 'tag2'] },
        embedding: [0.1, 0.2, 0.3],
        timestamp: new Date()
      };
      expect(itemSchema.parse(item)).toEqual(item);
    });

    test('validates item with complex metadata', () => {
      const item: KnowledgeItem = {
        id: '123',
        content: 'Test content',
        metadata: {
          source: 'test',
          tags: ['tag1', 'tag2'],
          nested: {
            value: 42,
            array: [1, 2, 3],
            object: { key: 'value' }
          }
        }
      };
      expect(itemSchema.parse(item)).toEqual(item);
    });

    test('validates item with large embedding', () => {
      const item: KnowledgeItem = {
        id: '123',
        content: 'Test content',
        embedding: Array(1024).fill(0.1)
      };
      expect(itemSchema.parse(item)).toEqual(item);
    });
  });

  describe('KnowledgeRetrievalResult', () => {
    const retrievalSchema = z.object({
      item: z.object({
        id: z.string(),
        content: z.string(),
        metadata: z.record(z.any()).optional(),
        embedding: z.array(z.number()).optional(),
        timestamp: z.date().optional()
      }),
      score: z.number(),
      distance: z.number().optional()
    });

    test('validates minimal retrieval result', () => {
      const result: KnowledgeRetrievalResult = {
        item: {
          id: '123',
          content: 'Test content'
        },
        score: 0.95
      };
      expect(retrievalSchema.parse(result)).toEqual(result);
    });

    test('validates retrieval result with distance', () => {
      const result: KnowledgeRetrievalResult = {
        item: {
          id: '123',
          content: 'Test content'
        },
        score: 0.95,
        distance: 0.05
      };
      expect(retrievalSchema.parse(result)).toEqual(result);
    });

    test('validates retrieval result with complete item', () => {
      const result: KnowledgeRetrievalResult = {
        item: {
          id: '123',
          content: 'Test content',
          metadata: { source: 'test' },
          embedding: [0.1, 0.2, 0.3],
          timestamp: new Date()
        },
        score: 0.95,
        distance: 0.05
      };
      expect(retrievalSchema.parse(result)).toEqual(result);
    });
  });

  describe('KnowledgeManagerConfig', () => {
    const configSchema = z.object({
      namespace: z.string().optional(),
      maxItems: z.number().optional(),
      embedModel: z.string().optional(),
      similarityThreshold: z.number().optional()
    });

    test('validates empty config', () => {
      const config: KnowledgeManagerConfig = {};
      expect(configSchema.parse(config)).toEqual(config);
    });

    test('validates complete config', () => {
      const config: KnowledgeManagerConfig = {
        namespace: 'test',
        maxItems: 1000,
        embedModel: 'test-model',
        similarityThreshold: 0.8
      };
      expect(configSchema.parse(config)).toEqual(config);
    });

    test('validates config with only namespace', () => {
      const config: KnowledgeManagerConfig = {
        namespace: 'test'
      };
      expect(configSchema.parse(config)).toEqual(config);
    });
  });

  describe('RAGConfig', () => {
    const ragConfigSchema = z.object({
      llm: z.any().optional(),
      temperature: z.number().optional(),
      maxTokens: z.number().optional(),
      topK: z.number().optional(),
      minRelevanceScore: z.number().optional(),
      promptTemplate: z.string().optional(),
      stopSequences: z.array(z.string()).optional()
    });

    test('validates empty RAG config', () => {
      const config: RAGConfig = {};
      expect(ragConfigSchema.parse(config)).toEqual(config);
    });

    test('validates complete RAG config', () => {
      const config: RAGConfig = {
        llm: { type: 'test-llm' },
        temperature: 0.7,
        maxTokens: 2048,
        topK: 3,
        minRelevanceScore: 0.7,
        promptTemplate: 'Test template',
        stopSequences: ['END']
      };
      expect(ragConfigSchema.parse(config)).toEqual(config);
    });

    test('validates RAG config with only LLM', () => {
      const config: RAGConfig = {
        llm: { type: 'test-llm' }
      };
      expect(ragConfigSchema.parse(config)).toEqual(config);
    });
  });

  describe('RAGGenerationOptions', () => {
    const optionsSchema = z.object({
      temperature: z.number().optional(),
      maxTokens: z.number().optional(),
      topK: z.number().optional(),
      minRelevanceScore: z.number().optional(),
      promptTemplate: z.string().optional(),
      metadata: z.record(z.any()).optional(),
      stop: z.array(z.string()).optional()
    });

    test('validates empty generation options', () => {
      const options: RAGGenerationOptions = {};
      expect(optionsSchema.parse(options)).toEqual(options);
    });

    test('validates complete generation options', () => {
      const options: RAGGenerationOptions = {
        temperature: 0.7,
        maxTokens: 2048,
        topK: 3,
        minRelevanceScore: 0.7,
        promptTemplate: 'Test template',
        metadata: { source: 'test' },
        stop: ['END']
      };
      expect(optionsSchema.parse(options)).toEqual(options);
    });

    test('validates options with only metadata', () => {
      const options: RAGGenerationOptions = {
        metadata: { source: 'test' }
      };
      expect(optionsSchema.parse(options)).toEqual(options);
    });
  });

  describe('RAGGenerationResult', () => {
    const resultSchema = z.object({
      text: z.string(),
      answer: z.string(),
      sources: z.array(z.object({
        item: z.object({
          id: z.string(),
          content: z.string(),
          metadata: z.record(z.any()).optional(),
          embedding: z.array(z.number()).optional(),
          timestamp: z.date().optional()
        }),
        score: z.number(),
        distance: z.number().optional()
      })),
      usage: z.object({
        promptTokens: z.number(),
        completionTokens: z.number(),
        totalTokens: z.number()
      }),
      metadata: z.record(z.any()).optional()
    });

    test('validates minimal generation result', () => {
      const result: RAGGenerationResult = {
        text: 'Generated text',
        answer: 'Final answer',
        sources: [],
        usage: {
          promptTokens: 10,
          completionTokens: 20,
          totalTokens: 30
        }
      };
      expect(resultSchema.parse(result)).toEqual(result);
    });

    test('validates complete generation result', () => {
      const result: RAGGenerationResult = {
        text: 'Generated text',
        answer: 'Final answer',
        sources: [{
          item: {
            id: '123',
            content: 'Source content',
            metadata: { source: 'test' }
          },
          score: 0.95,
          distance: 0.05
        }],
        usage: {
          promptTokens: 10,
          completionTokens: 20,
          totalTokens: 30
        },
        metadata: {
          model: 'test-model',
          timestamp: new Date()
        }
      };
      expect(resultSchema.parse(result)).toEqual(result);
    });

    test('validates result with multiple sources', () => {
      const result: RAGGenerationResult = {
        text: 'Generated text',
        answer: 'Final answer',
        sources: [
          {
            item: { id: '1', content: 'Source 1' },
            score: 0.95
          },
          {
            item: { id: '2', content: 'Source 2' },
            score: 0.85
          }
        ],
        usage: {
          promptTokens: 10,
          completionTokens: 20,
          totalTokens: 30
        }
      };
      expect(resultSchema.parse(result)).toEqual(result);
    });
  });

  describe('KnowledgeRetrievalOptions', () => {
    const optionsSchema = z.object({
      limit: z.number().optional(),
      minScore: z.number().optional(),
      filter: z.record(z.any()).optional(),
      includeMetadata: z.boolean().optional()
    });

    test('validates empty retrieval options', () => {
      const options: KnowledgeRetrievalOptions = {};
      expect(optionsSchema.parse(options)).toEqual(options);
    });

    test('validates complete retrieval options', () => {
      const options: KnowledgeRetrievalOptions = {
        limit: 10,
        minScore: 0.7,
        filter: { source: 'test' },
        includeMetadata: true
      };
      expect(optionsSchema.parse(options)).toEqual(options);
    });

    test('validates options with only filter', () => {
      const options: KnowledgeRetrievalOptions = {
        filter: { 
          source: 'test',
          tags: ['tag1', 'tag2'],
          nested: { value: 42 }
        }
      };
      expect(optionsSchema.parse(options)).toEqual(options);
    });
  });

  describe('Abstract Classes', () => {
    class TestKnowledgeManager extends KnowledgeManager {
      async initialize(): Promise<void> {}
      async destroy(): Promise<void> {}
      async addItem(item: KnowledgeItem): Promise<KnowledgeResult<KnowledgeItem>> {
        return { success: true, data: item };
      }
      async retrieve(query: string, options?: KnowledgeRetrievalOptions): Promise<KnowledgeResult<KnowledgeRetrievalResult[]>> {
        return { success: true, data: [] };
      }
      async removeItem(id: string): Promise<KnowledgeResult<void>> {
        return { success: true };
      }
      async clear(): Promise<KnowledgeResult<void>> {
        return { success: true };
      }
      async stats(): Promise<KnowledgeResult<{ totalItems: number; lastUpdated: Date; memoryUsage: number; }>> {
        return { success: true, data: { totalItems: 0, lastUpdated: new Date(), memoryUsage: 0 } };
      }
    }

    class TestRAGKnowledgeManager extends RAGKnowledgeManager {
      async initialize(): Promise<void> {}
      async destroy(): Promise<void> {}
      async addItem(item: KnowledgeItem): Promise<KnowledgeResult<KnowledgeItem>> {
        return { success: true, data: item };
      }
      async retrieve(query: string, options?: KnowledgeRetrievalOptions): Promise<KnowledgeResult<KnowledgeRetrievalResult[]>> {
        return { success: true, data: [] };
      }
      async removeItem(id: string): Promise<KnowledgeResult<void>> {
        return { success: true };
      }
      async clear(): Promise<KnowledgeResult<void>> {
        return { success: true };
      }
      async stats(): Promise<KnowledgeResult<{ totalItems: number; lastUpdated: Date; memoryUsage: number; }>> {
        return { success: true, data: { totalItems: 0, lastUpdated: new Date(), memoryUsage: 0 } };
      }
      async generate(query: string, options?: RAGGenerationOptions): Promise<KnowledgeResult<RAGGenerationResult>> {
        return { success: true, data: {
          text: '',
          answer: '',
          sources: [],
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
        }};
      }
      async generateStream(query: string, options?: RAGGenerationOptions & { onToken?: (token: string) => void; onSources?: (sources: KnowledgeRetrievalResult[]) => void; }): Promise<KnowledgeResult<void>> {
        return { success: true };
      }
      async preprocess(items: KnowledgeItem[], options?: { chunkSize?: number; chunkOverlap?: number; embedModel?: string; }): Promise<KnowledgeResult<KnowledgeItem[]>> {
        return { success: true, data: items };
      }
      async evaluate(queries: string[], options?: { groundTruth?: string[]; metrics?: Array<'relevance' | 'faithfulness' | 'coherence'>; }): Promise<KnowledgeResult<{ scores: Record<string, number>; details: Array<{ query: string; answer: string; groundTruth?: string; sources: KnowledgeRetrievalResult[]; metrics: Record<string, number>; }>; }>> {
        return { success: true, data: { scores: {}, details: [] } };
      }
      async updateRAGConfig(config: Partial<RAGConfig>): Promise<KnowledgeResult<void>> {
        return { success: true };
      }
      async ragStats(): Promise<KnowledgeResult<{ totalQueries: number; averageLatency: number; tokenUsage: { prompt: number; completion: number; total: number; }; sourceDistribution: Record<string, number>; }>> {
        return { success: true, data: { totalQueries: 0, averageLatency: 0, tokenUsage: { prompt: 0, completion: 0, total: 0 }, sourceDistribution: {} } };
      }
    }

    test('KnowledgeManager can be instantiated with config', () => {
      const manager = new TestKnowledgeManager({
        namespace: 'test',
        maxItems: 1000
      });
      expect(manager).toBeInstanceOf(KnowledgeManager);
      expect(manager).toBeInstanceOf(TestKnowledgeManager);
    });

    test('RAGKnowledgeManager can be instantiated with config', () => {
      const manager = new TestRAGKnowledgeManager({
        namespace: 'test',
        maxItems: 1000,
        rag: {
          temperature: 0.7,
          maxTokens: 2048
        }
      });
      expect(manager).toBeInstanceOf(RAGKnowledgeManager);
      expect(manager).toBeInstanceOf(TestRAGKnowledgeManager);
      expect(manager).toBeInstanceOf(KnowledgeManager);
    });

    test('KnowledgeManager implements BaseManager', () => {
      const manager = new TestKnowledgeManager({});
      expect(manager.initialize).toBeDefined();
      expect(manager.destroy).toBeDefined();
    });

    test('RAGKnowledgeManager extends KnowledgeManager functionality', () => {
      const manager = new TestRAGKnowledgeManager({
        rag: {}
      });
      expect(manager.generate).toBeDefined();
      expect(manager.generateStream).toBeDefined();
      expect(manager.preprocess).toBeDefined();
      expect(manager.evaluate).toBeDefined();
      expect(manager.updateRAGConfig).toBeDefined();
      expect(manager.ragStats).toBeDefined();
    });
  });
}); 