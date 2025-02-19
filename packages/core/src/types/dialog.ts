/**
 * 对话搜索选项
 */
export interface DialogSearchOptions {
  query: string;
  limit?: number;
  offset?: number;
  sessionId?: string;
  startTime?: number;
  endTime?: number;
}

/**
 * 对话搜索结果
 */
export interface DialogSearchResult {
  content: string;
  timestamp: number;
  session_id: string;
}

/**
 * 对话历史管理器接口
 */
export interface DialogHistoryManager {
  searchDialogs(options: DialogSearchOptions): Promise<DialogSearchResult[]>;
  optimizeMemory(): Promise<void>;
  close(): Promise<void>;
}
