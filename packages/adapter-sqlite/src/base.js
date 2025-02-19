"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BaseSQLiteAdapter = exports.SQLiteError = void 0;
const sqlite3_1 = require("sqlite3");
const util_1 = require("util");
class SQLiteError extends Error {
    constructor(message, code, cause) {
        super(message);
        this.code = code;
        this.cause = cause;
        this.name = 'SQLiteError';
    }
}
exports.SQLiteError = SQLiteError;
/**
 * 基础SQLite适配器
 * 提供底层数据库操作
 */
class BaseSQLiteAdapter {
    constructor(config) {
        this.db = null;
        this.preparedStatements = new Map();
        this.config = config;
    }
    async connect() {
        return new Promise((resolve, reject) => {
            this.db = new sqlite3_1.Database(this.config.path, (err) => {
                if (err) {
                    reject(err);
                }
                else {
                    if (this.config.verbose) {
                        this.db.on('trace', (sql) => console.log('SQL:', sql));
                    }
                    resolve();
                }
            });
        });
    }
    async disconnect() {
        return new Promise((resolve, reject) => {
            if (!this.db) {
                resolve();
                return;
            }
            for (const stmt of this.preparedStatements.values()) {
                (0, util_1.promisify)(stmt.finalize.bind(stmt))();
            }
            this.preparedStatements.clear();
            this.db.close((err) => {
                if (err) {
                    reject(err);
                }
                else {
                    this.db = null;
                    resolve();
                }
            });
        });
    }
    /**
     * 执行SQL查询并返回所有结果
     */
    async query(sql, params = []) {
        if (!this.db) {
            throw new Error('Database not connected');
        }
        return new Promise((resolve, reject) => {
            this.db.all(sql, params, (err, rows) => {
                if (err) {
                    reject(new SQLiteError('Query failed', 'QUERY_ERROR', err));
                }
                else {
                    resolve(rows);
                }
            });
        });
    }
    /**
     * 执行SQL查询并返回单个结果
     */
    async queryOne(sql, params = []) {
        try {
            const stmt = await this.prepare(sql);
            return await (0, util_1.promisify)(stmt.get.bind(stmt))(params);
        }
        catch (error) {
            throw new SQLiteError('Query failed', 'QUERY_ERROR', error);
        }
    }
    /**
     * 执行SQL更新
     */
    async execute(sql, params = []) {
        try {
            const stmt = await this.prepare(sql);
            const result = await (0, util_1.promisify)(stmt.run.bind(stmt))(params);
            return result.changes;
        }
        catch (error) {
            throw new SQLiteError('Execute failed', 'EXECUTE_ERROR', error);
        }
    }
    /**
     * 执行批量操作
     */
    async batch(operations) {
        await this.beginTransaction();
        try {
            for (const op of operations) {
                await this.execute(op.sql, op.params);
            }
            await this.commit();
        }
        catch (error) {
            await this.rollback();
            throw error;
        }
    }
    /**
     * 开始事务
     */
    async beginTransaction() {
        await this.execute('BEGIN TRANSACTION');
    }
    /**
     * 提交事务
     */
    async commit() {
        await this.execute('COMMIT');
    }
    /**
     * 回滚事务
     */
    async rollback() {
        await this.execute('ROLLBACK');
    }
    /**
     * 获取预处理语句
     */
    async prepare(sql) {
        let stmt = this.preparedStatements.get(sql);
        if (!stmt) {
            stmt = await (0, util_1.promisify)(this.db.prepare.bind(this.db))(sql);
            this.preparedStatements.set(sql, stmt);
        }
        return stmt;
    }
    /**
     * 优化数据库
     */
    async optimize() {
        // Enable WAL mode for better concurrency
        await this.execute('PRAGMA journal_mode = WAL');
        // Other optimizations
        await this.execute('PRAGMA synchronous = NORMAL');
        await this.execute('PRAGMA temp_store = MEMORY');
        await this.execute('PRAGMA cache_size = -2000'); // Use 2MB cache
        // Vacuum database
        await this.execute('VACUUM');
    }
    /**
     * 创建索引
     */
    async createIndex(table, columns, unique = false) {
        const indexName = `idx_${table}_${columns.join('_')}`;
        const uniqueStr = unique ? 'UNIQUE' : '';
        await this.execute(`CREATE ${uniqueStr} INDEX IF NOT EXISTS ${indexName} ON ${table}(${columns.join(',')})`);
    }
    /**
     * 删除索引
     */
    async dropIndex(indexName) {
        await this.execute(`DROP INDEX IF EXISTS ${indexName}`);
    }
    /**
     * 获取表信息
     */
    async getTableInfo(table) {
        return await this.query('PRAGMA table_info(?)', [table]);
    }
    /**
     * 获取索引信息
     */
    async getIndexInfo(table) {
        return await this.query('PRAGMA index_list(?)', [table]);
    }
}
exports.BaseSQLiteAdapter = BaseSQLiteAdapter;
//# sourceMappingURL=base.js.map