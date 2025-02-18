import { Database } from 'sqlite3';
import { DialogueHistory, DialogueSession, DialogueMessage, DialogueContext } from '@lumix/types';

interface MessageRow {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  metadata: string;
}

interface SessionRow {
  id: string;
  userId: string;
  context: string;
  createdAt: number;
  updatedAt: number;
}

export class HistoryManager {
  private db: Database;
  private currentSession: DialogueSession | null = null;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.initDatabase();
  }

  private async initDatabase(): Promise<void> {
    await this.createTables();
  }

  private async createTables(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.serialize(() => {
        // 会话表
        this.db.run(`
          CREATE TABLE IF NOT EXISTS sessions (
            id TEXT PRIMARY KEY,
            userId TEXT NOT NULL,
            context TEXT,
            createdAt INTEGER NOT NULL,
            updatedAt INTEGER NOT NULL
          )
        `);

        // 对话历史表
        this.db.run(`
          CREATE TABLE IF NOT EXISTS history (
            id TEXT PRIMARY KEY,
            session_id TEXT NOT NULL,
            timestamp INTEGER NOT NULL,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            metadata TEXT,
            FOREIGN KEY(session_id) REFERENCES sessions(id)
          )
        `, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    });
  }

  async startSession(userId: string, metadata: Record<string, any> = {}): Promise<DialogueSession> {
    const now = Date.now();
    const session: DialogueSession = {
      id: crypto.randomUUID(),
      userId,
      context: metadata,
      createdAt: now,
      updatedAt: now
    };

    return new Promise((resolve, reject) => {
      this.db.run(
        'INSERT INTO sessions (id, userId, context, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)',
        [session.id, session.userId, JSON.stringify(session.context), session.createdAt, session.updatedAt],
        (err) => {
          if (err) reject(err);
          else {
            this.currentSession = session;
            resolve(session);
          }
        }
      );
    });
  }

  async endSession(sessionId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run(
        'UPDATE sessions SET end_time = ? WHERE id = ?',
        [Date.now(), sessionId],
        (err) => {
          if (err) reject(err);
          else {
            if (this.currentSession?.id === sessionId) {
              this.currentSession = null;
            }
            resolve();
          }
        }
      );
    });
  }

  async addEntry(entry: DialogueMessage): Promise<void> {
    if (!this.currentSession?.id) {
      throw new Error('No active session or invalid session ID');
    }

    return new Promise((resolve, reject) => {
      this.db.run(
        'INSERT INTO history (id, session_id, timestamp, role, content, metadata) VALUES (?, ?, ?, ?, ?, ?)',
        [
          crypto.randomUUID(),
          this.currentSession?.id,
          Date.now(),
          entry.role,
          entry.content,
          JSON.stringify(entry.metadata || {})
        ],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  async getSessionHistory(sessionId: string): Promise<DialogueMessage[]> {
    return new Promise((resolve, reject) => {
      this.db.all(
        'SELECT * FROM history WHERE session_id = ? ORDER BY timestamp ASC',
        [sessionId],
        (err, rows: MessageRow[]) => {
          if (err) reject(err);
          else {
            const messages = rows.map((row) => ({
              role: row.role,
              content: row.content,
              timestamp: row.timestamp,
              metadata: JSON.parse(row.metadata)
            }));
            resolve(messages);
          }
        }
      );
    });
  }

  async searchHistory(query: string): Promise<DialogueMessage[]> {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT h.* FROM history h 
         JOIN sessions s ON h.session_id = s.id 
         WHERE h.content LIKE ? OR h.metadata LIKE ?
         ORDER BY h.timestamp DESC`,
        [`%${query}%`, `%${query}%`],
        (err, rows: MessageRow[]) => {
          if (err) reject(err);
          else {
            const messages = rows.map((row) => ({
              role: row.role,
              content: row.content,
              timestamp: row.timestamp,
              metadata: JSON.parse(row.metadata)
            }));
            resolve(messages);
          }
        }
      );
    });
  }

  async updateContext(context: Record<string, any>): Promise<void> {
    if (!this.currentSession?.id) {
      throw new Error('No active session or invalid session ID');
    }

    return new Promise((resolve, reject) => {
      this.db.run(
        'UPDATE sessions SET context = ? WHERE id = ?',
        [JSON.stringify(context), this.currentSession?.id],
        (err) => {
          if (err) reject(err);
          else {
            if (this.currentSession) {
              this.currentSession.context = context;
            }
            resolve();
          }
        }
      );
    });
  }

  getCurrentSession(): DialogueSession | null {
    return this.currentSession;
  }

  async close(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  async getMessages(): Promise<DialogueMessage[]> {
    const rows = await new Promise<MessageRow[]>((resolve, reject) => {
      this.db.all<MessageRow>('SELECT * FROM messages ORDER BY timestamp ASC', (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    const messages = rows.map((row: MessageRow) => ({
      role: row.role,
      content: row.content,
      metadata: JSON.parse(row.metadata)
    })) as DialogueMessage[];

    return messages;
  }

  async getContext(): Promise<DialogueContext> {
    const messages = await this.getMessages();
    return { messages };
  }

  async clearContext(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.db.run('DELETE FROM messages', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
}

export class DialogueHistoryManager {
  private db: any;

  constructor(dbPath: string) {
    // Initialize database
  }

  async getMessages(): Promise<DialogueMessage[]> {
    const rows = await this.db.all('SELECT * FROM messages ORDER BY timestamp ASC');
    return rows.map((row: any) => ({
      role: row.role as DialogueMessage['role'],
      content: row.content,
      timestamp: row.timestamp,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined
    }));
  }

  async getContext(): Promise<DialogueContext> {
    const messages = await this.getMessages();
    return { messages };
  }

  async clearContext(): Promise<void> {
    await this.db.run('DELETE FROM messages');
  }
}
