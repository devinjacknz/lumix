import {
  BaseError,
  KnowledgeError,
  ValidationError,
  ConfigurationError,
  StorageError,
  RetrievalError,
  ModelError,
  ResourceLimitError,
  PermissionError,
  NetworkError,
  TimeoutError,
  ConcurrencyError,
  NotFoundError,
  DuplicateError,
  RAGError
} from '../errors';

describe('Error Types', () => {
  describe('BaseError', () => {
    it('creates base error with correct properties', () => {
      const error = new BaseError('Base error message');
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(BaseError);
      expect(error.name).toBe('BaseError');
      expect(error.message).toBe('Base error message');
    });

    it('supports error stack trace', () => {
      const error = new BaseError('Test error');
      expect(error.stack).toBeDefined();
    });

    it('maintains prototype chain', () => {
      const error = new BaseError('Test error');
      expect(Object.getPrototypeOf(error)).toBe(BaseError.prototype);
      expect(Object.getPrototypeOf(Object.getPrototypeOf(error))).toBe(Error.prototype);
    });
  });

  describe('KnowledgeError', () => {
    it('creates knowledge error with correct properties', () => {
      const error = new KnowledgeError('Knowledge error message');
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(BaseError);
      expect(error).toBeInstanceOf(KnowledgeError);
      expect(error.name).toBe('KnowledgeError');
      expect(error.message).toBe('Knowledge error message');
    });

    it('maintains correct inheritance chain', () => {
      const error = new KnowledgeError('Test error');
      expect(error instanceof KnowledgeError).toBe(true);
      expect(error instanceof BaseError).toBe(true);
      expect(error instanceof Error).toBe(true);
      expect(error instanceof ValidationError).toBe(false);
    });
  });

  describe('Specific Knowledge Errors', () => {
    const errorClasses = [
      { Class: ValidationError, name: 'ValidationError' },
      { Class: ConfigurationError, name: 'ConfigurationError' },
      { Class: StorageError, name: 'StorageError' },
      { Class: RetrievalError, name: 'RetrievalError' },
      { Class: ModelError, name: 'ModelError' },
      { Class: ResourceLimitError, name: 'ResourceLimitError' },
      { Class: PermissionError, name: 'PermissionError' },
      { Class: NetworkError, name: 'NetworkError' },
      { Class: TimeoutError, name: 'TimeoutError' },
      { Class: ConcurrencyError, name: 'ConcurrencyError' },
      { Class: NotFoundError, name: 'NotFoundError' },
      { Class: DuplicateError, name: 'DuplicateError' },
      { Class: RAGError, name: 'RAGError' }
    ];

    errorClasses.forEach(({ Class, name }) => {
      describe(name, () => {
        it(`creates ${name} with correct properties`, () => {
          const message = `${name} message`;
          const error = new Class(message);
          expect(error).toBeInstanceOf(Error);
          expect(error).toBeInstanceOf(BaseError);
          expect(error).toBeInstanceOf(KnowledgeError);
          expect(error).toBeInstanceOf(Class);
          expect(error.name).toBe(name);
          expect(error.message).toBe(message);
        });

        it(`${name} preserves stack trace`, () => {
          const error = new Class('Test error');
          expect(error.stack).toBeDefined();
          expect(error.stack).toContain('Test error');
        });

        it(`${name} can be caught as parent type`, () => {
          const error = new Class('Test error');
          expect(error instanceof Error).toBe(true);
          expect(error instanceof BaseError).toBe(true);
          expect(error instanceof KnowledgeError).toBe(true);
        });

        it(`${name} maintains correct prototype chain`, () => {
          const error = new Class('Test error');
          expect(Object.getPrototypeOf(error)).toBe(Class.prototype);
          expect(Object.getPrototypeOf(Object.getPrototypeOf(error))).toBe(KnowledgeError.prototype);
        });
      });
    });
  });

  describe('Error Usage Patterns', () => {
    it('supports try-catch with specific error types', () => {
      expect(() => {
        throw new ValidationError('Invalid input');
      }).toThrow(ValidationError);
    });

    it('supports catching as parent error types', () => {
      expect(() => {
        throw new StorageError('Storage failed');
      }).toThrow(KnowledgeError);
    });

    it('preserves error properties when caught', () => {
      try {
        throw new NetworkError('Connection failed');
      } catch (error) {
        expect(error instanceof NetworkError).toBe(true);
        expect(error.message).toBe('Connection failed');
        expect(error.name).toBe('NetworkError');
      }
    });

    it('supports error chaining', () => {
      const originalError = new Error('Original error');
      const knowledgeError = new KnowledgeError('Knowledge error');
      knowledgeError.cause = originalError;

      expect(knowledgeError.cause).toBe(originalError);
    });

    it('supports nested error chaining', () => {
      const baseError = new Error('Base error');
      const storageError = new StorageError('Storage error');
      const validationError = new ValidationError('Validation error');
      
      storageError.cause = baseError;
      validationError.cause = storageError;

      expect(validationError.cause).toBe(storageError);
      expect(storageError.cause).toBe(baseError);
    });

    it('supports error conversion', () => {
      const originalError = new Error('Original error');
      const knowledgeError = new KnowledgeError(originalError.message);
      
      expect(knowledgeError.message).toBe(originalError.message);
      expect(knowledgeError instanceof KnowledgeError).toBe(true);
    });
  });

  describe('Error Message Handling', () => {
    it('handles empty messages', () => {
      const error = new BaseError('');
      expect(error.message).toBe('');
    });

    it('handles messages with special characters', () => {
      const message = 'Error with special chars: !@#$%^&*()_+';
      const error = new BaseError(message);
      expect(error.message).toBe(message);
    });

    it('handles multi-line messages', () => {
      const message = `Line 1
Line 2
Line 3`;
      const error = new BaseError(message);
      expect(error.message).toBe(message);
    });

    it('handles unicode characters', () => {
      const message = '错误信息 - エラーメッセージ - 오류 메시지';
      const error = new BaseError(message);
      expect(error.message).toBe(message);
    });

    it('handles very long messages', () => {
      const message = 'a'.repeat(10000);
      const error = new BaseError(message);
      expect(error.message).toBe(message);
    });

    it('handles messages with JSON content', () => {
      const jsonContent = JSON.stringify({ error: 'test', code: 500 });
      const error = new BaseError(jsonContent);
      expect(error.message).toBe(jsonContent);
      expect(() => JSON.parse(error.message)).not.toThrow();
    });
  });

  describe('Error Inheritance Behavior', () => {
    it('validates error class hierarchy', () => {
      const validationError = new ValidationError('Test');
      expect(validationError instanceof ValidationError).toBe(true);
      expect(validationError instanceof KnowledgeError).toBe(true);
      expect(validationError instanceof BaseError).toBe(true);
      expect(validationError instanceof Error).toBe(true);
      expect(validationError instanceof StorageError).toBe(false);
    });

    it('preserves instanceof behavior after serialization', () => {
      const error = new ValidationError('Test');
      const serialized = JSON.stringify(error);
      const deserialized = JSON.parse(serialized);
      
      // After deserialization, it's a plain object
      expect(deserialized.name).toBe('ValidationError');
      expect(deserialized.message).toBe('Test');
    });

    it('supports custom properties', () => {
      class CustomError extends BaseError {
        constructor(message: string, public code: number) {
          super(message);
          this.name = 'CustomError';
        }
      }

      const error = new CustomError('Test', 500);
      expect(error.code).toBe(500);
      expect(error instanceof BaseError).toBe(true);
    });
  });
}); 