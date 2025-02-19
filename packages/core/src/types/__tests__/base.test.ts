import { describe, expect, test } from '@jest/globals';
import {
  ModelConfig,
  KnowledgeItem,
  KnowledgeRetrievalResult,
  KnowledgeManagerConfig,
  KnowledgeResult,
  KnowledgeRetrievalOptions,
  KnowledgeManager,
  // Schemas
  ModelConfigSchema,
  KnowledgeItemSchema,
  KnowledgeRetrievalResultSchema,
  KnowledgeManagerConfigSchema,
  KnowledgeResultSchema,
  KnowledgeRetrievalOptionsSchema,
} from '../base';

describe('Base Types', () => {
  describe('ModelConfig', () => {
    test('validates valid model config', () => {
      const config: ModelConfig = {
        model: 'gpt-4',
        temperature: 0.7,
        maxTokens: 100,
        topP: 0.9,
        frequencyPenalty: 0.5,
        presencePenalty: 0.5,
        stop: ['\n', 'stop'],
      };
      
      const result = ModelConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    test('validates minimal model config', () => {
      const config: ModelConfig = {
        model: 'gpt-4',
      };
      
      const result = ModelConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    test('fails on invalid model config', () => {
      const config = {
        temperature: 0.7,
      };
      
      const result = ModelConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });
  });

  describe('KnowledgeItem', () => {
    test('validates valid knowledge item', () => {
      const item: KnowledgeItem = {
        id: '123',
        content: 'test content',
        metadata: { key: 'value' },
        embedding: [0.1, 0.2, 0.3],
        timestamp: new Date(),
      };
      
      const result = KnowledgeItemSchema.safeParse(item);
      expect(result.success).toBe(true);
    });

    test('validates minimal knowledge item', () => {
      const item: KnowledgeItem = {
        id: '123',
        content: 'test content',
      };
      
      const result = KnowledgeItemSchema.safeParse(item);
      expect(result.success).toBe(true);
    });

    test('fails on invalid knowledge item', () => {
      const item = {
        content: 'test content',
      };
      
      const result = KnowledgeItemSchema.safeParse(item);
      expect(result.success).toBe(false);
    });
  });

  describe('KnowledgeRetrievalResult', () => {
    test('validates valid retrieval result', () => {
      const result: KnowledgeRetrievalResult = {
        item: {
          id: '123',
          content: 'test content',
        },
        score: 0.95,
        distance: 0.05,
      };
      
      const validationResult = KnowledgeRetrievalResultSchema.safeParse(result);
      expect(validationResult.success).toBe(true);
    });

    test('validates minimal retrieval result', () => {
      const result: KnowledgeRetrievalResult = {
        item: {
          id: '123',
          content: 'test content',
        },
        score: 0.95,
      };
      
      const validationResult = KnowledgeRetrievalResultSchema.safeParse(result);
      expect(validationResult.success).toBe(true);
    });

    test('fails on invalid retrieval result', () => {
      const result = {
        score: 0.95,
      };
      
      const validationResult = KnowledgeRetrievalResultSchema.safeParse(result);
      expect(validationResult.success).toBe(false);
    });
  });

  describe('KnowledgeManagerConfig', () => {
    test('validates valid manager config', () => {
      const config: KnowledgeManagerConfig & { name: string; version: string; storageType: 'memory' } = {
        name: 'test',
        version: '1.0.0',
        namespace: 'test',
        maxItems: 1000,
        embedModel: 'test-model',
        similarityThreshold: 0.8,
        storageType: 'memory',
      };
      
      const result = KnowledgeManagerConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    test('validates minimal manager config', () => {
      const config = {
        name: 'test',
        version: '1.0.0',
        storageType: 'memory' as const,
      };
      
      const result = KnowledgeManagerConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    test('fails on invalid manager config', () => {
      const config = {
        namespace: 'test',
      };
      
      const result = KnowledgeManagerConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });
  });

  describe('KnowledgeResult', () => {
    test('validates valid knowledge result', () => {
      const result: KnowledgeResult<string> = {
        success: true,
        data: 'test data',
        metadata: {
          timestamp: new Date(),
          duration: 100,
        },
      };
      
      const validationResult = KnowledgeResultSchema.safeParse(result);
      expect(validationResult.success).toBe(true);
    });

    test('validates error knowledge result', () => {
      const result: KnowledgeResult<string> = {
        success: false,
        error: new Error('test error'),
      };
      
      const validationResult = KnowledgeResultSchema.safeParse(result);
      expect(validationResult.success).toBe(true);
    });

    test('fails on invalid knowledge result', () => {
      const result = {
        data: 'test data',
      };
      
      const validationResult = KnowledgeResultSchema.safeParse(result);
      expect(validationResult.success).toBe(false);
    });
  });

  describe('KnowledgeRetrievalOptions', () => {
    test('validates valid retrieval options', () => {
      const options: KnowledgeRetrievalOptions = {
        limit: 10,
        minScore: 0.8,
        filter: { key: 'value' },
        includeMetadata: true,
      };
      
      const result = KnowledgeRetrievalOptionsSchema.safeParse(options);
      expect(result.success).toBe(true);
    });

    test('validates empty retrieval options', () => {
      const options: KnowledgeRetrievalOptions = {};
      
      const result = KnowledgeRetrievalOptionsSchema.safeParse(options);
      expect(result.success).toBe(true);
    });

    test('validates partial retrieval options', () => {
      const options: KnowledgeRetrievalOptions = {
        limit: 10,
      };
      
      const result = KnowledgeRetrievalOptionsSchema.safeParse(options);
      expect(result.success).toBe(true);
    });
  });

  describe('KnowledgeManager', () => {
    class TestKnowledgeManager extends KnowledgeManager {
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
        return {
          success: true,
          data: {
            totalItems: 0,
            lastUpdated: new Date(),
            memoryUsage: 0,
          },
        };
      }
    }

    test('can be extended and instantiated', () => {
      const manager = new TestKnowledgeManager({
        namespace: 'test',
        maxItems: 1000,
      });
      
      expect(manager).toBeInstanceOf(KnowledgeManager);
    });

    test('initializes with default config values', () => {
      const manager = new TestKnowledgeManager({});
      
      expect(manager).toBeInstanceOf(KnowledgeManager);
    });

    test('abstract methods are implemented', async () => {
      const manager = new TestKnowledgeManager({});
      
      const addResult = await manager.addItem({
        id: '123',
        content: 'test',
      });
      expect(addResult.success).toBe(true);

      const retrieveResult = await manager.retrieve('test');
      expect(retrieveResult.success).toBe(true);

      const removeResult = await manager.removeItem('123');
      expect(removeResult.success).toBe(true);

      const clearResult = await manager.clear();
      expect(clearResult.success).toBe(true);

      const statsResult = await manager.stats();
      expect(statsResult.success).toBe(true);
    });
  });
}); 