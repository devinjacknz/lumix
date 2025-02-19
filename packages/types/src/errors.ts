export interface ErrorOptions {
  cause?: Error;
  code?: string;
  details?: Record<string, any>;
}

export class BaseError extends Error {
  code: string;
  details?: Record<string, any>;

  constructor(message: string, options?: ErrorOptions) {
    super(message);
    this.name = 'BaseError';
    this.code = options?.code || 'ERR_UNKNOWN';
    this.details = options?.details;
  }
}
