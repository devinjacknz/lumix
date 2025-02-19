import { LumixError } from './base';

export interface ErrorHandlerOptions {
  maxRetries?: number;
  retryDelay?: number;
  shouldRetry?: (error: Error) => boolean;
  onError?: (error: Error) => void;
}

export class ErrorHandler {
  private maxRetries: number;
  private retryDelay: number;
  private shouldRetry: (error: Error) => boolean;
  private onError: (error: Error) => void;

  constructor(options: ErrorHandlerOptions = {}) {
    this.maxRetries = options.maxRetries ?? 3;
    this.retryDelay = options.retryDelay ?? 1000;
    this.shouldRetry = options.shouldRetry ?? this.defaultShouldRetry;
    this.onError = options.onError ?? this.defaultErrorHandler;
  }

  private defaultShouldRetry(error: Error): boolean {
    if (error instanceof LumixError) {
      // Don't retry validation or authentication errors
      return !['VALIDATION_ERROR', 'AUTH_ERROR'].includes(error.code);
    }
    return true;
  }

  private defaultErrorHandler(error: Error): void {
    console.error('[Lumix Error]', {
      name: error.name,
      message: error.message,
      stack: error.stack,
      ...(error instanceof LumixError && { code: error.code, details: error.details })
    });
  }

  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async withRetry<T>(operation: () => Promise<T>): Promise<T> {
    let lastError: Error;
    let attempts = 0;

    while (attempts <= this.maxRetries) {
      try {
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        if (!this.shouldRetry(lastError) || attempts === this.maxRetries) {
          this.onError(lastError);
          throw lastError;
        }

        attempts++;
        await this.delay(this.retryDelay * attempts);
      }
    }

    throw lastError!;
  }

  async handleError(error: unknown): Promise<void> {
    const normalizedError = error instanceof Error ? error : new Error(String(error));
    this.onError(normalizedError);
  }
}

// Create a default error handler instance
export const defaultErrorHandler = new ErrorHandler();

// Utility decorator for retry functionality
export function withRetry(options: ErrorHandlerOptions = {}) {
  const handler = new ErrorHandler(options);
  
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = function (...args: any[]) {
      return handler.withRetry(() => originalMethod.apply(this, args));
    };

    return descriptor;
  };
}
