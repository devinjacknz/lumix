import { unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { Database } from 'sqlite3';
import { BaseSQLiteAdapter, SQLiteConfig, SQLiteError } from '../base';
import { createTestDatabase } from './setup-db';

interface TestRow {
  id: number;
  name: string;
}

describe('BaseSQLiteAdapter', () => {
  let adapter: BaseSQLiteAdapter;
  let dbPath: string;

  beforeEach(async () => {
    const result = await createTestDatabase();
    dbPath = result.path;
    
    const config: SQLiteConfig = {
      type: 'sqlite',
      path: dbPath,
      verbose: false
    };
    adapter = new BaseSQLiteAdapter(config);
    await adapter.connect();
  });

  afterEach(async () => {
    try {
      await adapter.disconnect();
    } catch (error) {
      console.error('Failed to disconnect:', error);
    }
    try {
      unlinkSync(dbPath);
    } catch (error) {
      console.error('Failed to cleanup:', error);
    }
  });

  describe('connection management', () => {
    it('should connect successfully', async () => {
      await expect(adapter.connect()).resolves.toBeUndefined();
    });

    it('should disconnect successfully', async () => {
      await expect(adapter.disconnect()).resolves.toBeUndefined();
    });

    it('should handle multiple disconnects gracefully', async () => {
      await adapter.disconnect();
      await expect(adapter.disconnect()).resolves.toBeUndefined();
    });
  });

  describe('basic operations', () => {
    beforeEach(async () => {
      await adapter.execute(
        'CREATE TABLE IF NOT EXISTS test (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT)'
      );
    });

    it('should execute queries', async () => {
      const changes = await adapter.execute(
        'INSERT INTO test (name) VALUES (?)',
        ['test']
      );
      expect(changes).toBe(1);
    });

    it('should query all rows', async () => {
      await adapter.execute('INSERT INTO test (name) VALUES (?)', ['test1']);
      await adapter.execute('INSERT INTO test (name) VALUES (?)', ['test2']);

      const rows = await adapter.query<TestRow[]>('SELECT * FROM test ORDER BY id');
      expect(rows).toHaveLength(2);
      expect(rows[0].name).toBe('test1');
      expect(rows[1].name).toBe('test2');
    });

    it('should query one row', async () => {
      await adapter.execute('INSERT INTO test (name) VALUES (?)', ['test']);
      const row = await adapter.queryOne<TestRow>('SELECT * FROM test WHERE name = ?', ['test']);
      expect(row).toBeDefined();
      if (row) {
        expect(row.name).toBe('test');
      }
    });

    it('should return null for non-existent row', async () => {
      const row = await adapter.queryOne('SELECT * FROM test WHERE name = ?', ['nonexistent']);
      expect(row).toBeNull();
    });
  });

  describe('transactions', () => {
    beforeEach(async () => {
      await adapter.execute(
        'CREATE TABLE IF NOT EXISTS test (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT)'
      );
    });

    it('should handle successful transaction', async () => {
      await adapter.beginTransaction();
      await adapter.execute('INSERT INTO test (name) VALUES (?)', ['test1']);
      await adapter.execute('INSERT INTO test (name) VALUES (?)', ['test2']);
      await adapter.commit();

      const rows = await adapter.query<TestRow[]>('SELECT * FROM test');
      expect(rows).toHaveLength(2);
    });

    it('should handle transaction rollback', async () => {
      await adapter.beginTransaction();
      await adapter.execute('INSERT INTO test (name) VALUES (?)', ['test1']);
      await adapter.rollback();

      const rows = await adapter.query<TestRow[]>('SELECT * FROM test');
      expect(rows).toHaveLength(0);
    });

    it('should handle batch operations', async () => {
      const operations = [
        { sql: 'INSERT INTO test (name) VALUES (?)', params: ['test1'] },
        { sql: 'INSERT INTO test (name) VALUES (?)', params: ['test2'] }
      ];

      await adapter.batch(operations);

      const rows = await adapter.query('SELECT * FROM test');
      expect(rows).toHaveLength(2);
    });

    it('should rollback batch on error', async () => {
      const operations = [
        { sql: 'INSERT INTO test (name) VALUES (?)', params: ['test1'] },
        { sql: 'INSERT INTO invalid_table (name) VALUES (?)', params: ['test2'] }
      ];

      await expect(adapter.batch(operations)).rejects.toThrow();

      const rows = await adapter.query('SELECT * FROM test');
      expect(rows).toHaveLength(0);
    });
  });

  describe('schema operations', () => {
    beforeEach(async () => {
      await adapter.execute(
        'CREATE TABLE IF NOT EXISTS test (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, value INTEGER)'
      );
    });

    it('should create and drop indexes', async () => {
      await adapter.createIndex('test', ['name'], true);
      const indexes = await adapter.getIndexInfo('test');
      expect(indexes.length).toBeGreaterThan(0);

      await adapter.dropIndex('idx_test_name');
      const indexesAfterDrop = await adapter.getIndexInfo('test');
      expect(indexesAfterDrop.length).toBe(0);
    });

    it('should get table information', async () => {
      const tableInfo = await adapter.getTableInfo('test');
      expect(tableInfo).toHaveLength(3); // id, name, value columns
      expect(tableInfo.map(col => col.name)).toEqual(['id', 'name', 'value']);
    });
  });

  describe('optimization', () => {
    it('should apply optimizations', async () => {
      await expect(adapter.optimize()).resolves.toBeUndefined();
    });
  });

  describe('error handling', () => {
    it('should handle query errors', async () => {
      await expect(
        adapter.query<any[]>('SELECT * FROM nonexistent_table')
      ).rejects.toThrow(SQLiteError);
    });

    it('should handle execution errors', async () => {
      await expect(
        adapter.execute('INSERT INTO nonexistent_table VALUES (?)', [1])
      ).rejects.toThrow(SQLiteError);
    });

    it('should handle disconnected state', async () => {
      await adapter.disconnect();
      await expect(
        adapter.query<any[]>('SELECT 1')
      ).rejects.toThrow('Database not connected');
    });
  });
});
