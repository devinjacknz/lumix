import { KnowledgeResult } from '../types/base';
import { BaseError } from '../types/errors';

/**
 * 基础知识管理器
 */
export abstract class BaseKnowledgeManager {
  protected wrapResult<T>(fn: () => Promise<T>): Promise<KnowledgeResult<T>> {
    return fn()
      .then((data) => ({
        success: true,
        data,
      }))
      .catch((error: Error) => ({
        success: false,
        error: error instanceof BaseError ? error : new BaseError(error.message),
      }));
  }
}

/**
 * 基础RAG知识管理器
 */
export abstract class BaseRAGKnowledgeManager extends BaseKnowledgeManager {
  protected abstract validateConfig(): void;
  protected abstract initialize(): Promise<void>;
}
