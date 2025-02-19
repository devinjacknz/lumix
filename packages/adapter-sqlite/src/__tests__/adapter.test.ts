import { SQLiteCacheAdapter, SQLiteCacheConfig } from '../adapter';

import { unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('SQLiteCacheAdapter', () => {
  let adapter: SQLiteCacheAdapter;
  let dbPath: string;

  beforeEach(async () => {
    // Create a unique temp file for each test
    dbPath = join(tmpdir(), `test-cache-${Date.now()}.db`);
    const config: SQLiteCacheConfig = {
      name: 'test-cache',
      version: '1.0.0',
      dbPath,
      tableName: 'test_cache'
    };
    adapter = new SQLiteCacheAdapter(config);
    await adapter.init();
  });

  afterEach(async () => {
    await adapter.close();
    try {
      unlinkSync(dbPath);
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('initialization', () => {
    it('should initialize successfully', async () => {
      const result = await adapter.init();
      expect(result.success).toBe(true);
    });

    it('should not reinitialize if already initialized', async () => {
      const result1 = await adapter.init();
      const result2 = await adapter.init();
      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
    });
  });

  describe('basic operations', () => {
    it('should set and get a value', async () => {
      const key = 'test-key';
      const value = { data: 'test-value' };

      const setResult = await adapter.set(key, value);
      expect(setResult.success).toBe(true);

      const getResult = await adapter.get<typeof value>(key);
      expect(getResult.success).toBe(true);
      expect(getResult.data).toEqual(value);
    });

    it('should return null for non-existent key', async () => {
      const result = await adapter.get('non-existent');
      expect(result.success).toBe(true);
      expect(result.data).toBeNull();
    });

    it('should delete a value', async () => {
      const key = 'test-key';
      const value = 'test-value';

      await adapter.set(key, value);
      const deleteResult = await adapter.delete(key);
      expect(deleteResult.success).toBe(true);
      expect(deleteResult.data).toBe(true);

      const getResult = await adapter.get(key);
      expect(getResult.data).toBeNull();
    });

    it('should clear all values', async () => {
      await adapter.set('key1', 'value1');
      await adapter.set('key2', 'value2');

      const clearResult = await adapter.clear();
      expect(clearResult.success).toBe(true);

      const getResult1 = await adapter.get('key1');
      const getResult2 = await adapter.get('key2');
      expect(getResult1.data).toBeNull();
      expect(getResult2.data).toBeNull();
    });
  });

  describe('expiration', () => {
    it('should handle TTL correctly', async () => {
      const key = 'ttl-test';
      const value = 'test-value';
      const ttl = 100; // 100ms

      await adapter.set(key, value, ttl);
      
      // Value should exist immediately
      const result1 = await adapter.get(key);
      expect(result1.data).toBe(value);

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, ttl + 50));

      // Value should be expired
      const result2 = await adapter.get(key);
      expect(result2.data).toBeNull();
    });

    it('should update TTL with expire command', async () => {
      const key = 'expire-test';
      await adapter.set(key, 'test-value');

      const expireResult = await adapter.expire(key, 1000);
      expect(expireResult.success).toBe(true);
      expect(expireResult.data).toBe(true);

      const ttlResult = await adapter.ttl(key);
      expect(ttlResult.success).toBe(true);
      expect(ttlResult.data).toBeGreaterThan(0);
      expect(ttlResult.data).toBeLessThanOrEqual(1000);
    });
  });

  describe('batch operations', () => {
    it('should handle mget correctly', async () => {
      await adapter.set('key1', 'value1');
      await adapter.set('key2', 'value2');

      const result = await adapter.mget(['key1', 'key2', 'key3']);
      expect(result.success).toBe(true);
      expect(result.data).toEqual(['value1', 'value2', null]);
    });

    it('should handle mset correctly', async () => {
      const items = [
        { key: 'mkey1', value: 'value1' },
        { key: 'mkey2', value: 'value2' }
      ];

      const setResult = await adapter.mset(items);
      expect(setResult.success).toBe(true);

      const getResult = await adapter.mget(['mkey1', 'mkey2']);
      expect(getResult.data).toEqual(['value1', 'value2']);
    });

    it('should handle mdelete correctly', async () => {
      await adapter.set('key1', 'value1');
      await adapter.set('key2', 'value2');

      const deleteResult = await adapter.mdelete(['key1', 'key2', 'key3']);
      expect(deleteResult.success).toBe(true);
      
      // All keys should be marked as deleted in the result, even if they didn't exist
      expect(deleteResult.data).toEqual([true, true, true]);
      
      // Verify the keys are actually deleted
      const getResults = await Promise.all([
        adapter.get('key1'),
        adapter.get('key2'),
        adapter.get('key3')
      ]);
      expect(getResults.every(r => r.data === null)).toBe(true);
    });
  });

  describe('metadata operations', () => {
    it('should get cache stats', async () => {
      await adapter.set('key1', 'value1');
      await adapter.set('key2', 'value2', 1); // Expired immediately

      await new Promise(resolve => setTimeout(resolve, 10));

      const statsResult = await adapter.stats();
      expect(statsResult.success).toBe(true);
      expect(statsResult.data?.totalKeys).toBeGreaterThan(0);
      expect(statsResult.data?.expiredKeys).toBeGreaterThan(0);
    });

    it('should list keys with pattern', async () => {
      await adapter.set('test1', 'value1');
      await adapter.set('test2', 'value2');
      await adapter.set('other', 'value3');

      const result = await adapter.keys('test*');
      expect(result.success).toBe(true);
      expect(result.data?.sort()).toEqual(['test1', 'test2'].sort());
    });

    it('should check key existence', async () => {
      await adapter.set('exists', 'value');

      const result1 = await adapter.has('exists');
      expect(result1.success).toBe(true);
      expect(result1.data).toBe(true);

      const result2 = await adapter.has('not-exists');
      expect(result2.success).toBe(true);
      expect(result2.data).toBe(false);
    });
  });

  describe('error handling', () => {
    it('should handle database errors gracefully', async () => {
      // Force close the database to simulate errors
      await adapter.close();

      const result = await adapter.get('any-key');
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should handle invalid JSON data', async () => {
      // Directly insert invalid JSON using raw SQL
      await new Promise<void>((resolve, reject) => {
        (adapter as any).db.run(
          `INSERT INTO ${(adapter as any).tableName} (key, value) VALUES (?, ?)`,
          ['invalid-json', 'not-json'],
          (err: Error | null) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      const result = await adapter.get('invalid-json');
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});
