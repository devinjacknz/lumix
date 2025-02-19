// Mock winston first
jest.mock('winston', () => {
  const mockInfo = jest.fn();
  const mockError = jest.fn();
  const mockWarn = jest.fn();
  const mockDebug = jest.fn();

  return {
    createLogger: jest.fn(() => ({
      info: mockInfo,
      error: mockError,
      warn: mockWarn,
      debug: mockDebug,
    })),
    format: {
      combine: jest.fn(),
      timestamp: jest.fn(),
      json: jest.fn(),
    },
    transports: {
      Console: jest.fn(),
      File: jest.fn(),
    },
  };
});

import { describe, expect, test, beforeEach, jest } from '@jest/globals';
import { logger } from '../logger';
import winston from 'winston';

describe('Logger', () => {
  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();
  });

  describe('Singleton Pattern', () => {
    test('returns the same instance', () => {
      const instance1 = logger;
      const instance2 = logger;
      expect(instance1).toBe(instance2);
    });
  });

  describe('Logging Methods', () => {
    test('info method logs messages correctly', () => {
      const message = 'Test info message';
      const meta = { key: 'value' };
      
      logger.info(message, meta);
      const mockLogger = (winston.createLogger as jest.Mock)();
      expect(mockLogger.info).toHaveBeenCalledWith(message, meta);
    });

    test('error method logs messages correctly', () => {
      const message = 'Test error message';
      const meta = { key: 'value' };
      
      logger.error(message, meta);
      const mockLogger = (winston.createLogger as jest.Mock)();
      expect(mockLogger.error).toHaveBeenCalledWith(message, meta);
    });

    test('warn method logs messages correctly', () => {
      const message = 'Test warn message';
      const meta = { key: 'value' };
      
      logger.warn(message, meta);
      const mockLogger = (winston.createLogger as jest.Mock)();
      expect(mockLogger.warn).toHaveBeenCalledWith(message, meta);
    });

    test('debug method logs messages correctly', () => {
      const message = 'Test debug message';
      const meta = { key: 'value' };
      
      logger.debug(message, meta);
      const mockLogger = (winston.createLogger as jest.Mock)();
      expect(mockLogger.debug).toHaveBeenCalledWith(message, meta);
    });
  });

  describe('Logger Configuration', () => {
    test('creates logger with correct configuration', () => {
      expect(winston.createLogger).toHaveBeenCalled();
      expect(winston.format.combine).toHaveBeenCalled();
      expect(winston.format.timestamp).toHaveBeenCalled();
      expect(winston.format.json).toHaveBeenCalled();
      expect(winston.transports.Console).toHaveBeenCalled();
      expect(winston.transports.File).toHaveBeenCalledTimes(2);
    });
  });

  describe('Meta Data Handling', () => {
    test('handles undefined meta data', () => {
      const message = 'Test message without meta';
      
      logger.info(message);
      const mockLogger = (winston.createLogger as jest.Mock)();
      expect(mockLogger.info).toHaveBeenCalledWith(message, undefined);
    });

    test('handles null meta data', () => {
      const message = 'Test message with null meta';
      
      logger.info(message, null);
      const mockLogger = (winston.createLogger as jest.Mock)();
      expect(mockLogger.info).toHaveBeenCalledWith(message, null);
    });

    test('handles complex meta data objects', () => {
      const message = 'Test message with complex meta';
      const meta = {
        nested: {
          array: [1, 2, 3],
          object: { key: 'value' }
        },
        date: new Date(),
      };
      
      logger.info(message, meta);
      const mockLogger = (winston.createLogger as jest.Mock)();
      expect(mockLogger.info).toHaveBeenCalledWith(message, meta);
    });
  });
}); 