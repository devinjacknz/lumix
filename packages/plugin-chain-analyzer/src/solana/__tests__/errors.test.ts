import { 
  AnalyzerError, 
  ErrorCode, 
  NetworkError, 
  ProgramError,
  handleError 
} from '../../errors';

describe('Error Handling', () => {
  describe('AnalyzerError', () => {
    it('should create error with code and details', () => {
      const error = new AnalyzerError(
        'Test error',
        ErrorCode.UNKNOWN_ERROR,
        { test: true }
      );

      expect(error.message).toBe('Test error');
      expect(error.code).toBe(ErrorCode.UNKNOWN_ERROR);
      expect(error.details).toEqual({ test: true });
    });

    it('should preserve original error stack', () => {
      const originalError = new Error('Original error');
      const error = new AnalyzerError(
        'Wrapper error',
        ErrorCode.UNKNOWN_ERROR,
        undefined,
        originalError
      );

      expect(error.stack).toContain('Original error');
    });

    it('should serialize to JSON', () => {
      const error = new AnalyzerError(
        'Test error',
        ErrorCode.UNKNOWN_ERROR,
        { test: true }
      );

      const json = error.toJSON();
      expect(json).toHaveProperty('name', 'AnalyzerError');
      expect(json).toHaveProperty('message', 'Test error');
      expect(json).toHaveProperty('code', ErrorCode.UNKNOWN_ERROR);
      expect(json).toHaveProperty('details', { test: true });
    });
  });

  describe('NetworkError', () => {
    it('should create network error', () => {
      const error = new NetworkError(
        'Connection failed',
        { url: 'test-url' }
      );

      expect(error.message).toBe('Connection failed');
      expect(error.code).toBe(ErrorCode.NETWORK_ERROR);
      expect(error.details).toEqual({ url: 'test-url' });
    });
  });

  describe('ProgramError', () => {
    it('should create program error', () => {
      const error = new ProgramError(
        'Invalid program',
        { address: 'test-address' }
      );

      expect(error.message).toBe('Invalid program');
      expect(error.code).toBe(ErrorCode.INVALID_PROGRAM);
      expect(error.details).toEqual({ address: 'test-address' });
    });
  });

  describe('handleError', () => {
    it('should pass through AnalyzerError', () => {
      const error = new AnalyzerError('Test error', ErrorCode.UNKNOWN_ERROR);
      
      expect(() => handleError(error)).toThrow(error);
    });

    it('should wrap Error with appropriate code', () => {
      const notFoundError = new Error('Program not found');
      expect(() => handleError(notFoundError))
        .toThrow(AnalyzerError);
      
      try {
        handleError(notFoundError);
      } catch (e) {
        expect(e instanceof AnalyzerError).toBe(true);
        if (e instanceof AnalyzerError) {
          expect(e.code).toBe(ErrorCode.PROGRAM_NOT_FOUND);
        }
      }
    });

    it('should handle non-Error objects', () => {
      const nonError = { message: 'Not an error' };
      
      try {
        handleError(nonError);
      } catch (e) {
        expect(e instanceof AnalyzerError).toBe(true);
        if (e instanceof AnalyzerError) {
          expect(e.code).toBe(ErrorCode.UNKNOWN_ERROR);
          expect(e.details?.originalError).toBe(nonError);
        }
      }
    });

    it('should handle network errors', () => {
      const networkError = new Error('network connection failed');
      
      try {
        handleError(networkError);
      } catch (e) {
        expect(e instanceof NetworkError).toBe(true);
        if (e instanceof NetworkError) {
          expect(e.code).toBe(ErrorCode.NETWORK_ERROR);
        }
      }
    });
  });
}); 