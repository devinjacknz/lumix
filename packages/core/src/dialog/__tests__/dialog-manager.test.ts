import { DialogManager } from '../dialog-manager';
import {
  DialogPlugin,
  DialogStorage,
  DialogHistoryManager,
  DialogErrorHandler,
  DialogIntent,
  DialogState,
  DialogErrorCode,
  DialogMiddleware,
  DialogContext
} from '../types';

// Mock crypto.randomUUID
const mockUUID = '12345678-1234-1234-1234-123456789012';
global.crypto = {
  ...global.crypto,
  randomUUID: () => mockUUID
};

describe('DialogManager', () => {
  let dialogManager: DialogManager;
  let mockStorage: jest.Mocked<DialogStorage>;
  let mockHistoryManager: jest.Mocked<DialogHistoryManager>;
  let mockErrorHandler: jest.Mocked<DialogErrorHandler>;
  let mockPlugin: DialogPlugin;

  beforeEach(() => {
    mockStorage = {
      saveState: jest.fn().mockResolvedValue(undefined),
      loadState: jest.fn().mockResolvedValue(null),
      saveHistory: jest.fn().mockResolvedValue(undefined),
      loadHistory: jest.fn().mockResolvedValue(null),
      deleteSession: jest.fn().mockResolvedValue(undefined)
    };

    mockHistoryManager = {
      saveHistory: jest.fn().mockResolvedValue(undefined),
      getHistory: jest.fn().mockResolvedValue(null),
      searchHistory: jest.fn().mockResolvedValue([]),
      deleteHistory: jest.fn().mockResolvedValue(undefined)
    };

    mockErrorHandler = {
      handleError: jest.fn().mockResolvedValue({
        text: 'Error handled',
        error: {
          code: DialogErrorCode.UNKNOWN_ERROR,
          message: 'Test error'
        }
      }),
      logError: jest.fn().mockResolvedValue(undefined)
    };

    mockPlugin = {
      name: 'test-plugin',
      version: '1.0.0',
      initialize: jest.fn().mockResolvedValue(undefined),
      processIntent: jest.fn().mockResolvedValue({
        text: 'Test response',
        confidence: 0.8
      }),
      cleanup: jest.fn().mockResolvedValue(undefined)
    };

    dialogManager = new DialogManager(
      mockStorage,
      mockHistoryManager,
      mockErrorHandler,
      {
        language: 'en',
        maxTurns: 100,
        timeoutMs: 30000,
        autoCorrect: true,
        confidenceThreshold: 0.5,
        maxDistance: 3,
        maxSuggestions: 5,
        minSimilarity: 0.7,
        metadata: {}
      }
    );

    dialogManager.registerPlugin(mockPlugin);
  });

  test('processes intent successfully', async () => {
    const intent: DialogIntent = {
      type: 'test-intent',
      confidence: 0.9,
      parameters: {}
    };

    const state = await dialogManager.createState();
    const response = await dialogManager.processIntent(intent, state);

    expect(response.text).toBe('Test response');
    expect(mockStorage.saveState).toHaveBeenCalled();
  });

  test('handles intent processing failure', async () => {
    const intent: DialogIntent = {
      type: 'test-intent',
      confidence: 0.9,
      parameters: {}
    };

    (mockPlugin.processIntent as jest.Mock).mockRejectedValueOnce(new Error('Test error'));

    const state = await dialogManager.createState();
    const response = await dialogManager.processIntent(intent, state);

    expect(response.error).toBeDefined();
    expect(response.error?.code).toBe(DialogErrorCode.UNKNOWN_ERROR);
    expect(mockErrorHandler.handleError).toHaveBeenCalled();
    expect(mockErrorHandler.logError).toHaveBeenCalled();
  });

  test('applies middleware in correct order', async () => {
    const steps: string[] = [];

    const middleware1: DialogMiddleware = {
      before: async (state) => {
        steps.push('before1');
      },
      after: async (state, response) => {
        steps.push('after1');
      },
      onError: async (error, state) => {
        steps.push('error1');
      }
    };

    const middleware2: DialogMiddleware = {
      before: async (state) => {
        steps.push('before2');
      },
      after: async (state, response) => {
        steps.push('after2');
      },
      onError: async (error, state) => {
        steps.push('error2');
      }
    };

    dialogManager.use(middleware1);
    dialogManager.use(middleware2);

    const intent: DialogIntent = {
      type: 'test-intent',
      confidence: 0.9,
      parameters: {}
    };

    const state = await dialogManager.createState();
    await dialogManager.processIntent(intent, state);

    expect(steps).toEqual(['before1', 'before2', 'after2', 'after1']);
  });

  test('maintains state between requests', async () => {
    const intent: DialogIntent = {
      type: 'test',
      confidence: 0.9,
      parameters: {}
    };

    const state = await dialogManager.createState();
    await dialogManager.processIntent(intent, state);
    await dialogManager.processIntent(intent, state);

    expect(mockStorage.saveState).toHaveBeenCalledTimes(3);
  });

  test('loads state successfully', async () => {
    const sessionId = 'test-session';
    const mockState: DialogState = {
      turnCount: 1,
      lastInteractionTime: Date.now(),
      lastUpdateTime: Date.now(),
      parameters: {},
      context: {
        sessionId,
        language: 'en',
        timestamp: Date.now()
      }
    };

    mockStorage.loadState.mockResolvedValueOnce(mockState);
    const loadedState = await dialogManager.loadState(sessionId);
    expect(loadedState).toEqual(mockState);
    expect(mockStorage.loadState).toHaveBeenCalledWith(sessionId);
  });

  test('saves state successfully', async () => {
    const state = await dialogManager.createState();
    await dialogManager.saveState(state);
    expect(mockStorage.saveState).toHaveBeenCalledWith(state.context.sessionId, state);
    expect(state.lastUpdateTime).toBeLessThanOrEqual(Date.now());
  });

  test('cleans up resources', async () => {
    await dialogManager.cleanup();
    expect(mockPlugin.cleanup).toHaveBeenCalled();
  });

  test('creates state with custom context', async () => {
    const customContext: Partial<DialogContext> = {
      userId: 'test-user',
      language: 'zh',
      metadata: { custom: 'data' }
    };

    const state = await dialogManager.createState(customContext);
    expect(state.context.userId).toBe(customContext.userId);
    expect(state.context.language).toBe(customContext.language);
    expect(state.context.metadata).toEqual(customContext.metadata);
    expect(state.context.sessionId).toBeDefined();
    expect(state.turnCount).toBe(0);
  });

  test('handles no plugins available', async () => {
    const newDialogManager = new DialogManager(
      mockStorage,
      mockHistoryManager,
      mockErrorHandler,
      {
        language: 'en',
        maxTurns: 100,
        timeoutMs: 30000
      }
    );

    const intent: DialogIntent = {
      type: 'test',
      confidence: 0.9,
      parameters: {}
    };

    const state = await newDialogManager.createState();
    const response = await newDialogManager.processIntent(intent, state);
    expect(response.text).toBe('Error handled');
    expect(mockErrorHandler.handleError).toHaveBeenCalled();
  });

  test('handles middleware error in before hook', async () => {
    const errorMiddleware: DialogMiddleware = {
      before: jest.fn().mockRejectedValue(new Error('Middleware error')),
      after: jest.fn(),
      onError: jest.fn()
    };

    dialogManager.use(errorMiddleware);

    const intent: DialogIntent = {
      type: 'test',
      confidence: 0.9,
      parameters: {}
    };

    const state = await dialogManager.createState();
    const response = await dialogManager.processIntent(intent, state);
    
    expect(response.text).toBe('Error handled');
    expect(errorMiddleware.before).toHaveBeenCalled();
    expect(errorMiddleware.onError).toHaveBeenCalled();
    expect(mockErrorHandler.handleError).toHaveBeenCalled();
    expect(mockErrorHandler.logError).toHaveBeenCalled();
  });

  test('creates state with default options', async () => {
    const state = await dialogManager.createState();
    expect(state.context.language).toBe('en');
    expect(state.context.sessionId).toBeDefined();
    expect(state.turnCount).toBe(0);
    expect(state.parameters).toEqual({});
    expect(state.lastInteractionTime).toBeLessThanOrEqual(Date.now());
    expect(state.lastUpdateTime).toBeLessThanOrEqual(Date.now());
  });

  test('initializes with default options', () => {
    const manager = new DialogManager(mockStorage, mockHistoryManager, mockErrorHandler);
    expect(manager['options'].language).toBe('en');
    expect(manager['options'].maxTurns).toBe(100);
    expect(manager['options'].timeoutMs).toBe(30000);
    expect(manager['options'].autoCorrect).toBe(true);
    expect(manager['options'].confidenceThreshold).toBe(0.5);
    expect(manager['options'].maxDistance).toBe(3);
    expect(manager['options'].maxSuggestions).toBe(5);
    expect(manager['options'].minSimilarity).toBe(0.7);
    expect(manager['options'].metadata).toEqual({});
  });
});
