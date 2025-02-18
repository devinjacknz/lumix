import { z } from 'zod';
import { DialogueMessage, DialogueContext } from '@lumix/types';
import { BaseSQLiteAdapter, SQLiteConfig, SQLiteError } from './base';

export interface DialogHistoryManager {
  saveMessage(message: DialogueMessage): Promise<void>;
  getContext(): Promise<DialogueContext>;
  clearContext(): Promise<void>;
}

export class SQLiteDialogHistoryManager extends BaseSQLiteAdapter implements DialogHistoryManager {
  constructor(config: SQLiteConfig) {
    super(config);
  }

  async initialize(): Promise<void> {
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
  }

  async saveMessage(message: DialogueMessage): Promise<void> {
    const metadata = message.metadata ? JSON.stringify(message.metadata) : null;
    await this.query(
      'INSERT INTO messages (role, content, metadata, timestamp) VALUES (?, ?, ?, ?)',
      [message.role, message.content, metadata, Date.now()]
    );
  }

  async getContext(): Promise<DialogueContext> {
    const rows = await this.query<any[]>('SELECT * FROM messages ORDER BY timestamp ASC');
    const messages = rows.map(row => ({
      role: row.role,
      content: row.content,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined
    }));
    return { messages };
  }

  async clearContext(): Promise<void> {
    await this.query('DELETE FROM messages');
  }
}

export { BaseSQLiteAdapter, SQLiteConfig, SQLiteError };
