import { Database, OPEN_READWRITE, OPEN_CREATE } from 'sqlite3';
import { join } from 'path';
import { tmpdir } from 'os';

export async function createTestDatabase(): Promise<{ path: string }> {
  const dbPath = join(tmpdir(), `test-db-${Date.now()}.db`);
  console.log('[setup] Creating test database at:', dbPath);
  
  return new Promise<{ path: string }>((resolve, reject) => {
    try {
      const db = new Database(dbPath, OPEN_READWRITE | OPEN_CREATE, async (err) => {
        if (err) {
          console.error('[setup] Failed to create test database:', err);
          reject(err);
          return;
        }

        try {
          // Create test tables
          await new Promise<void>((res, rej) => {
            db.serialize(() => {
              db.run('BEGIN TRANSACTION');

              // Messages table for dialog history
              db.run(`
                CREATE TABLE IF NOT EXISTS messages (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  role TEXT NOT NULL,
                  content TEXT NOT NULL,
                  metadata TEXT,
                  timestamp INTEGER NOT NULL
                )
              `);

              // Test table for basic operations
              db.run(`
                CREATE TABLE IF NOT EXISTS test (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  name TEXT,
                  value INTEGER
                )
              `);

              db.run('COMMIT', (err) => {
                if (err) {
                  console.error('[setup] Failed to commit transaction:', err);
                  db.run('ROLLBACK', () => {
                    db.close(() => rej(err));
                  });
                } else {
                  console.log('[setup] Successfully created test tables');
                  db.close((err) => {
                    if (err) {
                      console.error('[setup] Failed to close database:', err);
                      rej(err);
                    } else {
                      res();
                    }
                  });
                }
              });
            });
          });
          
          console.log('[setup] Test database setup complete');
          resolve({ path: dbPath });
        } catch (error) {
          console.error('[setup] Error during database setup:', error);
          reject(error);
        }
      });
    } catch (error) {
      console.error('[setup] Failed to create Database instance:', error);
      reject(error);
    }
  });
}
