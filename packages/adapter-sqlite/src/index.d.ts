import { Message, DialogueContext } from '@lumix/types';
import { BaseSQLiteAdapter, SQLiteConfig, SQLiteError } from './base';
export interface DialogHistoryManager {
    saveMessage(message: Message): Promise<void>;
    getContext(): Promise<DialogueContext>;
    clearContext(): Promise<void>;
}
export declare class SQLiteDialogHistoryManager extends BaseSQLiteAdapter implements DialogHistoryManager {
    constructor(config: SQLiteConfig);
    initialize(): Promise<void>;
    saveMessage(message: Message): Promise<void>;
    getContext(): Promise<DialogueContext>;
    clearContext(): Promise<void>;
}
export { BaseSQLiteAdapter, SQLiteConfig, SQLiteError };
