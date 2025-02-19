import { z } from 'zod';
import { 
  DialogSearchOptions,
  DialogSearchResult,
  DialogHistoryManager
} from '../dialog';

describe('Dialog Types', () => {
  describe('DialogSearchOptions', () => {
    const DialogSearchOptionsSchema = z.object({
      query: z.string(),
      limit: z.number().optional(),
      offset: z.number().optional(),
      sessionId: z.string().optional(),
      startTime: z.number().optional(),
      endTime: z.number().optional()
    });

    it('validates options with only required fields', () => {
      const options: DialogSearchOptions = {
        query: 'test query'
      };
      
      const result = DialogSearchOptionsSchema.safeParse(options);
      expect(result.success).toBe(true);
    });

    it('validates options with all fields', () => {
      const options: DialogSearchOptions = {
        query: 'test query',
        limit: 10,
        offset: 0,
        sessionId: 'test-session',
        startTime: Date.now() - 1000,
        endTime: Date.now()
      };
      
      const result = DialogSearchOptionsSchema.safeParse(options);
      expect(result.success).toBe(true);
    });

    it('fails when query is missing', () => {
      const options = {
        limit: 10,
        offset: 0
      };
      
      const result = DialogSearchOptionsSchema.safeParse(options);
      expect(result.success).toBe(false);
    });

    it('fails when numeric fields are invalid', () => {
      const options = {
        query: 'test query',
        limit: 'invalid',
        offset: 'invalid'
      };
      
      const result = DialogSearchOptionsSchema.safeParse(options);
      expect(result.success).toBe(false);
    });

    it('validates time range constraints', () => {
      const now = Date.now();
      const options: DialogSearchOptions = {
        query: 'test query',
        startTime: now - 1000,
        endTime: now
      };
      
      const result = DialogSearchOptionsSchema.safeParse(options);
      expect(result.success).toBe(true);
    });
  });

  describe('DialogSearchResult', () => {
    const DialogSearchResultSchema = z.object({
      content: z.string(),
      timestamp: z.number(),
      session_id: z.string()
    });

    it('validates valid search result', () => {
      const result: DialogSearchResult = {
        content: 'test content',
        timestamp: Date.now(),
        session_id: 'test-session'
      };
      
      const validationResult = DialogSearchResultSchema.safeParse(result);
      expect(validationResult.success).toBe(true);
    });

    it('fails when required fields are missing', () => {
      const result = {
        content: 'test content',
        timestamp: Date.now()
      };
      
      const validationResult = DialogSearchResultSchema.safeParse(result);
      expect(validationResult.success).toBe(false);
    });

    it('fails when timestamp is invalid', () => {
      const result = {
        content: 'test content',
        timestamp: 'invalid',
        session_id: 'test-session'
      };
      
      const validationResult = DialogSearchResultSchema.safeParse(result);
      expect(validationResult.success).toBe(false);
    });
  });

  describe('DialogHistoryManager', () => {
    class TestDialogHistoryManager implements DialogHistoryManager {
      async searchDialogs(options: DialogSearchOptions): Promise<DialogSearchResult[]> {
        return [{
          content: 'test content',
          timestamp: Date.now(),
          session_id: 'test-session'
        }];
      }

      async optimizeMemory(): Promise<void> {
        return;
      }

      async close(): Promise<void> {
        return;
      }
    }

    it('can be implemented and instantiated', () => {
      const manager = new TestDialogHistoryManager();
      expect(manager).toBeInstanceOf(TestDialogHistoryManager);
    });

    it('searchDialogs returns correct type', async () => {
      const manager = new TestDialogHistoryManager();
      const results = await manager.searchDialogs({ query: 'test' });
      
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBe(1);
      expect(results[0]).toHaveProperty('content');
      expect(results[0]).toHaveProperty('timestamp');
      expect(results[0]).toHaveProperty('session_id');
    });

    it('optimizeMemory can be called', async () => {
      const manager = new TestDialogHistoryManager();
      await expect(manager.optimizeMemory()).resolves.toBeUndefined();
    });

    it('close can be called', async () => {
      const manager = new TestDialogHistoryManager();
      await expect(manager.close()).resolves.toBeUndefined();
    });

    it('handles search with various options', async () => {
      const manager = new TestDialogHistoryManager();
      const options: DialogSearchOptions = {
        query: 'test',
        limit: 10,
        offset: 0,
        sessionId: 'test-session',
        startTime: Date.now() - 1000,
        endTime: Date.now()
      };
      
      const results = await manager.searchDialogs(options);
      expect(Array.isArray(results)).toBe(true);
    });
  });
}); 