/**
 * 基础错误类
 */
export class BaseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BaseError';
  }
}

/**
 * 知识管理基础错误
 */
export class KnowledgeError extends BaseError {
  constructor(message: string) {
    super(message);
    this.name = 'KnowledgeError';
  }
}

/**
 * 验证错误
 */
export class ValidationError extends KnowledgeError {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * 配置错误
 */
export class ConfigurationError extends KnowledgeError {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigurationError';
  }
}

/**
 * 存储错误
 */
export class StorageError extends KnowledgeError {
  constructor(message: string) {
    super(message);
    this.name = 'StorageError';
  }
}

/**
 * 检索错误
 */
export class RetrievalError extends KnowledgeError {
  constructor(message: string) {
    super(message);
    this.name = 'RetrievalError';
  }
}

/**
 * 模型错误
 */
export class ModelError extends KnowledgeError {
  constructor(message: string) {
    super(message);
    this.name = 'ModelError';
  }
}

/**
 * 资源限制错误
 */
export class ResourceLimitError extends KnowledgeError {
  constructor(message: string) {
    super(message);
    this.name = 'ResourceLimitError';
  }
}

/**
 * 权限错误
 */
export class PermissionError extends KnowledgeError {
  constructor(message: string) {
    super(message);
    this.name = 'PermissionError';
  }
}

/**
 * 网络错误
 */
export class NetworkError extends KnowledgeError {
  constructor(message: string) {
    super(message);
    this.name = 'NetworkError';
  }
}

/**
 * 超时错误
 */
export class TimeoutError extends KnowledgeError {
  constructor(message: string) {
    super(message);
    this.name = 'TimeoutError';
  }
}

/**
 * 并发错误
 */
export class ConcurrencyError extends KnowledgeError {
  constructor(message: string) {
    super(message);
    this.name = 'ConcurrencyError';
  }
}

/**
 * 未找到错误
 */
export class NotFoundError extends KnowledgeError {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

/**
 * 重复错误
 */
export class DuplicateError extends KnowledgeError {
  constructor(message: string) {
    super(message);
    this.name = 'DuplicateError';
  }
}

/**
 * RAG错误
 */
export class RAGError extends KnowledgeError {
  constructor(message: string) {
    super(message);
    this.name = 'RAGError';
  }
}
