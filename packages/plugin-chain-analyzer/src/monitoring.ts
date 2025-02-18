import { AnalyzerError, ErrorCode } from './errors';

export interface ErrorMetrics {
  totalErrors: number;
  errorsByCode: Record<ErrorCode, number>;
  errorsByType: Record<string, number>;
  averageResponseTime: number;
  lastError?: {
    timestamp: number;
    error: AnalyzerError;
  };
}

export class ErrorMonitor {
  private metrics: ErrorMetrics = {
    totalErrors: 0,
    errorsByCode: Object.values(ErrorCode).reduce((acc, code) => {
      acc[code] = 0;
      return acc;
    }, {} as Record<ErrorCode, number>),
    errorsByType: {},
    averageResponseTime: 0
  };

  private responseTimeSamples: number[] = [];

  trackError(error: AnalyzerError, responseTime?: number): void {
    this.metrics.totalErrors++;
    this.metrics.errorsByCode[error.code]++;
    this.metrics.errorsByType[error.name] = (this.metrics.errorsByType[error.name] || 0) + 1;
    
    this.metrics.lastError = {
      timestamp: Date.now(),
      error
    };

    if (responseTime) {
      this.responseTimeSamples.push(responseTime);
      this.updateAverageResponseTime();
    }

    // 记录错误日志
    this.logError(error);
  }

  private updateAverageResponseTime(): void {
    // 只保留最近100个样本
    if (this.responseTimeSamples.length > 100) {
      this.responseTimeSamples = this.responseTimeSamples.slice(-100);
    }

    this.metrics.averageResponseTime = 
      this.responseTimeSamples.reduce((a, b) => a + b, 0) / this.responseTimeSamples.length;
  }

  private logError(error: AnalyzerError): void {
    const logEntry = {
      timestamp: new Date().toISOString(),
      errorType: error.name,
      errorCode: error.code,
      message: error.message,
      details: error.details,
      stack: error.stack
    };

    // 在生产环境中，这里可以将日志发送到日志服务
    console.error('Error logged:', JSON.stringify(logEntry, null, 2));
  }

  getMetrics(): ErrorMetrics {
    return { ...this.metrics };
  }

  getErrorRate(timeWindowMs: number = 3600000): number {
    const now = Date.now();
    const recentErrors = this.responseTimeSamples.filter(
      time => now - time <= timeWindowMs
    ).length;

    return recentErrors / (timeWindowMs / 1000); // 每秒错误率
  }

  reset(): void {
    this.metrics = {
      totalErrors: 0,
      errorsByCode: Object.values(ErrorCode).reduce((acc, code) => {
        acc[code] = 0;
        return acc;
      }, {} as Record<ErrorCode, number>),
      errorsByType: {},
      averageResponseTime: 0
    };
    this.responseTimeSamples = [];
  }
}

// 创建单例实例
export const errorMonitor = new ErrorMonitor(); 