import { describe, expect, test, jest, beforeEach } from '@jest/globals';
import { DialogManager } from '@lumix/core/dialog/dialog-manager';
import {
  DialogPlugin,
  DialogIntent,
  DialogMiddleware,
  DialogStorage,
  DialogHistoryManager,
  DialogErrorHandler,
  DialogState,
  DialogResponse,
  DialogContext
} from '@lumix/core/dialog/types';

describe('DialogManager', () => {
  let dialogManager: DialogManager;
  let mockPlugin: jest.Mocked<DialogPlugin>;
  let mockStorage: jest.Mocked<DialogStorage>;
  let mockHistoryManager: jest.Mocked<DialogHistoryManager>;
  let mockErrorHandler: jest.Mocked<DialogErrorHandler>;
  let initialState: DialogState;

  beforeEach(() => {
    const context: DialogContext = {
      sessionId: 'test-session',
      timestamp: Date.now(),
      language: 'en'
    };

    initialState = {
      turnCount: 0,
      lastInteractionTime: Date.now(),
      lastUpdateTime: Date.now(),
      parameters: {},
      context
    };

    mockPlugin = {
      name: 'test-plugin',
      version: '1.0.0',
      initialize: jest.fn().mockResolvedValue(undefined),
      processIntent: jest.fn().mockResolvedValue({
        text: 'Test response',
        confidence: 0.8,
        metadata: {}
      } as DialogResponse),
      cleanup: jest.fn().mockResolvedValue(undefined)
    } as jest.Mocked<DialogPlugin>;

    mockStorage = {
      saveState: jest.fn().mockResolvedValue(undefined),
      loadState: jest.fn().mockResolvedValue(initialState),
      saveHistory: jest.fn().mockResolvedValue(undefined),
      loadHistory: jest.fn().mockResolvedValue({
        sessionId: 'test-session',
        turns: []
      }),
      deleteSession: jest.fn().mockResolvedValue(undefined)
    } as jest.Mocked<DialogStorage>;

    mockHistoryManager = {
      saveHistory: jest.fn().mockResolvedValue(undefined),
      getHistory: jest.fn().mockResolvedValue({
        sessionId: 'test-session',
        turns: []
      }),
      searchHistory: jest.fn().mockResolvedValue([]),
      deleteHistory: jest.fn().mockResolvedValue(undefined)
    } as jest.Mocked<DialogHistoryManager>;

    mockErrorHandler = {
      handleError: jest.fn().mockResolvedValue({
        text: 'Error handled',
        confidence: 0,
        metadata: {}
      } as DialogResponse),
      logError: jest.fn().mockResolvedValue(undefined)
    } as jest.Mocked<DialogErrorHandler>;

    dialogManager = new DialogManager(
      mockPlugin,
      mockStorage,
      mockHistoryManager,
      mockErrorHandler
    );
  });

  test('registers plugin successfully', async () => {
    await dialogManager.registerPlugin(mockPlugin);
    expect(mockPlugin.initialize).toHaveBeenCalled();
  });

  test('processes intent successfully', async () => {
    const intent: DialogIntent = {
      type: 'test',
      confidence: 0.9,
      parameters: {}
    };

    const response = await dialogManager.processIntent(intent, initialState);
    expect(response.text).toBe('Test response');
    expect(mockPlugin.processIntent).toHaveBeenCalledWith(intent, initialState);
  });

  test('handles plugin error', async () => {
    const intent: DialogIntent = {
      type: 'test',
      confidence: 0.9,
      parameters: {}
    };

    mockPlugin.processIntent?.mockRejectedValueOnce(new Error('Plugin error'));
    const response = await dialogManager.processIntent(intent, initialState);
    expect(response.text).toBe('Error handled');
    expect(mockErrorHandler.handleError).toHaveBeenCalled();
    expect(mockErrorHandler.logError).toHaveBeenCalled();
  });

  test('applies middleware correctly', async () => {
    const middleware: DialogMiddleware = {
      before: jest.fn().mockImplementation(async (state: DialogState) => {
        return Promise.resolve();
      }),
      after: jest.fn().mockImplementation(async (state: DialogState, response: DialogResponse) => {
        return Promise.resolve();
      }),
      onError: jest.fn().mockImplementation(async (error: Error, state: DialogState) => {
        return Promise.resolve();
      })
    };

    dialogManager.use(middleware);

    const intent: DialogIntent = {
      type: 'test',
      confidence: 0.9,
      parameters: {}
    };

    const response = await dialogManager.processIntent(intent, initialState);
    expect(response.text).toBe('Test response');
    expect(middleware.before).toHaveBeenCalledWith(initialState);
  });

  test('handles middleware error', async () => {
    const middleware: DialogMiddleware = {
      before: jest.fn().mockRejectedValue(new Error('Middleware error')),
      after: jest.fn().mockImplementation(async (state: DialogState, response: DialogResponse) => {
        return Promise.resolve();
      }),
      onError: jest.fn().mockImplementation(async (error: Error, state: DialogState) => {
        return Promise.resolve();
      })
    };

    dialogManager.use(middleware);

    const intent: DialogIntent = {
      type: 'test',
      confidence: 0.9,
      parameters: {}
    };

    const response = await dialogManager.processIntent(intent, initialState);
    expect(response.text).toBe('Error handled');
    expect(mockErrorHandler.handleError).toHaveBeenCalled();
    expect(mockErrorHandler.logError).toHaveBeenCalled();
  });
}); 