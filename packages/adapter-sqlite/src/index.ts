import { z } from 'zod';
import { Message, DialogueContext } from '@lumix/types';
import { BaseSQLiteAdapter, SQLiteConfig, SQLiteError } from './base';

export interface DialogHistoryManager {
  saveMessage(message: Message): Promise<void>;
  getContext(): Promise<DialogueContext>;
  clearContext(): Promise<void>;
}

export class SQLiteDialogHistoryManager extends BaseSQLiteAdapter implements DialogHistoryManager {
  constructor(config: SQLiteConfig) {
    super(config);
  }

  async initialize(): Promise<void> {
    try {
      await this.connect();
      await this.query(`
        CREATE TABLE IF NOT EXISTS messages (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          role TEXT NOT NULL,
          content TEXT NOT NULL,
          metadata TEXT,
          timestamp INTEGER NOT NULL
        )
      `);
    } catch (error) {
      throw new SQLiteError('Failed to initialize dialog history', 'INIT_ERROR', error as Error);
    }
  }

  async saveMessage(message: Message): Promise<void> {
    try {
      const metadata = message.metadata ? JSON.stringify(message.metadata) : null;
      await this.execute(
        'INSERT INTO messages (role, content, metadata, timestamp) VALUES (?, ?, ?, ?)',
        [message.role, message.content, metadata, Date.now()]
      );
    } catch (error) {
      throw new SQLiteError('Failed to save message', 'SAVE_ERROR', error as Error);
    }
  }

  async getContext(): Promise<DialogueContext> {
    try {
      const rows = await this.query<any[]>('SELECT * FROM messages ORDER BY timestamp ASC');
      const messages = rows.map(row => {
        let metadata: any = undefined;
        if (row.metadata) {
          try {
            metadata = JSON.parse(row.metadata);
          } catch (error) {
            console.warn(`Invalid metadata JSON for message ${row.id}`);
            metadata = undefined;
          }
        }
        return {
          role: row.role,
          content: row.content,
          metadata
        };
      });
      return { messages };
    } catch (error) {
      throw new SQLiteError('Failed to get context', 'GET_CONTEXT_ERROR', error as Error);
    }
  }

  async clearContext(): Promise<void> {
    try {
      await this.execute('DELETE FROM messages');
    } catch (error) {
      throw new SQLiteError('Failed to clear context', 'CLEAR_ERROR', error as Error);
    }
  }
}

export { BaseSQLiteAdapter, SQLiteConfig, SQLiteError };
