"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SQLiteError = exports.BaseSQLiteAdapter = exports.SQLiteDialogHistoryManager = void 0;
const base_1 = require("./base");
Object.defineProperty(exports, "BaseSQLiteAdapter", { enumerable: true, get: function () { return base_1.BaseSQLiteAdapter; } });
Object.defineProperty(exports, "SQLiteError", { enumerable: true, get: function () { return base_1.SQLiteError; } });
class SQLiteDialogHistoryManager extends base_1.BaseSQLiteAdapter {
    constructor(config) {
        super(config);
    }
    async initialize() {
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
    async saveMessage(message) {
        const metadata = message.metadata ? JSON.stringify(message.metadata) : null;
        await this.query('INSERT INTO messages (role, content, metadata, timestamp) VALUES (?, ?, ?, ?)', [message.role, message.content, metadata, Date.now()]);
    }
    async getContext() {
        const rows = await this.query('SELECT * FROM messages ORDER BY timestamp ASC');
        const messages = rows.map(row => ({
            role: row.role,
            content: row.content,
            metadata: row.metadata ? JSON.parse(row.metadata) : undefined
        }));
        return { messages };
    }
    async clearContext() {
        await this.query('DELETE FROM messages');
    }
}
exports.SQLiteDialogHistoryManager = SQLiteDialogHistoryManager;
//# sourceMappingURL=index.js.map