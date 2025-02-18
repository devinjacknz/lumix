export enum ErrorCode {
  // 程序分析错误
  PROGRAM_NOT_FOUND = 'PROGRAM_NOT_FOUND',
  INVALID_PROGRAM = 'INVALID_PROGRAM',
  ANALYSIS_FAILED = 'ANALYSIS_FAILED',
  
  // 网络错误
  NETWORK_ERROR = 'NETWORK_ERROR',
  RPC_ERROR = 'RPC_ERROR',
  TIMEOUT = 'TIMEOUT',
  
  // 缓存错误
  CACHE_ERROR = 'CACHE_ERROR',
  
  // 指标错误
  METRICS_ERROR = 'METRICS_ERROR',
  
  // 配置错误
  CONFIG_ERROR = 'CONFIG_ERROR',
  INVALID_ADAPTER = 'INVALID_ADAPTER',
  
  // 通用错误
  UNKNOWN_ERROR = 'UNKNOWN_ERROR'
}

export class AnalyzerError extends Error {
  constructor(
    message: string,
    public code: ErrorCode,
    public details?: any,
    public originalError?: Error
  ) {
    super(message);
    this.name = 'AnalyzerError';
    
    // 保留原始错误堆栈
    if (originalError && originalError.stack) {
      this.stack = `${this.stack}\nCaused by: ${originalError.stack}`;
    }
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      details: this.details,
      stack: this.stack
    };
  }
}

export class NetworkError extends AnalyzerError {
  constructor(message: string, details?: any, originalError?: Error) {
    super(message, ErrorCode.NETWORK_ERROR, details, originalError);
    this.name = 'NetworkError';
  }
}

export class ProgramError extends AnalyzerError {
  constructor(message: string, details?: any, originalError?: Error) {
    super(message, ErrorCode.INVALID_PROGRAM, details, originalError);
    this.name = 'ProgramError';
  }
}

export class MetricsError extends AnalyzerError {
  constructor(message: string, details?: any, originalError?: Error) {
    super(message, ErrorCode.METRICS_ERROR, details, originalError);
    this.name = 'MetricsError';
  }
}

export function isAnalyzerError(error: unknown): error is AnalyzerError {
  return error instanceof AnalyzerError;
}

export function handleError(error: unknown): never {
  if (error instanceof AnalyzerError) {
    throw error;
  }

  if (error instanceof Error) {
    // 尝试从错误消息中推断错误类型
    if (error.message.includes('not found') || error.message.includes('404')) {
      throw new AnalyzerError(error.message, ErrorCode.PROGRAM_NOT_FOUND, undefined, error);
    }
    if (error.message.includes('timeout') || error.message.includes('ETIMEDOUT')) {
      throw new AnalyzerError(error.message, ErrorCode.TIMEOUT, undefined, error);
    }
    if (error.message.includes('network') || error.message.includes('connection')) {
      throw new NetworkError(error.message, undefined, error);
    }
    
    // 默认为未知错误
    throw new AnalyzerError(error.message, ErrorCode.UNKNOWN_ERROR, undefined, error);
  }

  // 处理非 Error 类型的错误
  throw new AnalyzerError(
    'An unknown error occurred',
    ErrorCode.UNKNOWN_ERROR,
    { originalError: error }
  );
} 