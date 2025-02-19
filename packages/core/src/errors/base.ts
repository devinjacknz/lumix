export class LumixError extends Error {
  public readonly code: string;
  public readonly details?: Record<string, any>;

  constructor(code: string, message: string, details?: Record<string, any>) {
    super(message);
    this.code = code;
    this.details = details;
    this.name = 'LumixError';
  }
}

export class ValidationError extends LumixError {
  constructor(message: string, details?: Record<string, any>) {
    super('VALIDATION_ERROR', message, details);
    this.name = 'ValidationError';
  }
}

export class NetworkError extends LumixError {
  constructor(message: string, details?: Record<string, any>) {
    super('NETWORK_ERROR', message, details);
    this.name = 'NetworkError';
  }
}

export class DatabaseError extends LumixError {
  constructor(message: string, details?: Record<string, any>) {
    super('DATABASE_ERROR', message, details);
    this.name = 'DatabaseError';
  }
}

export class AuthenticationError extends LumixError {
  constructor(message: string, details?: Record<string, any>) {
    super('AUTH_ERROR', message, details);
    this.name = 'AuthenticationError';
  }
}

export class TransactionError extends LumixError {
  constructor(message: string, details?: Record<string, any>) {
    super('TRANSACTION_ERROR', message, details);
    this.name = 'TransactionError';
  }
}
