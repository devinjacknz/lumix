import { DialogManager } from '../dialog-manager';
import {
  DialogState,
  DialogIntent,
  DialogResponse,
  DialogPlugin,
  DialogMiddleware,
  DialogStorage,
  DialogHistoryManager,
  DialogErrorHandler,
  DialogErrorCode
} from '../types';

describe('DialogManager', () => {
  let dialogManager: DialogManager;
  let mockStorage: jest.Mocked<DialogStorage>;
  let mockHistoryManager: jest.Mocked<DialogHistoryManager>;
  let mockErrorHandler: jest.Mocked<DialogErrorHandler>;

  beforeEach(() => {
    mockStorage = {
      saveState: jest.fn().mockResolvedValue(undefined),
      loadState: jest.fn().mockResolvedValue(null),
      saveHistory: jest.fn().mockResolvedValue(undefined),
      loadHistory: jest.fn().mockResolvedValue(null),
      deleteSession: jest.fn().mockResolvedValue(undefined)
    } as jest.Mocked<DialogStorage>;

    mockHistoryManager = {
      saveHistory: jest.fn().mockResolvedValue(undefined),
      getHistory: jest.fn().mockResolvedValue(null),
      searchHistory: jest.fn().mockResolvedValue([]),
      deleteHistory: jest.fn().mockResolvedValue(undefined),
      clearHistory: jest.fn().mockResolvedValue(undefined)
    } as jest.Mocked<DialogHistoryManager>;

    mockErrorHandler = {
      handleError: jest.fn().mockResolvedValue({
        text: "Error handled",
        error: {
          code: DialogErrorCode.UNKNOWN_ERROR,
          message: "Test error"
        }
      }),
      logError: jest.fn().mockResolvedValue(undefined)
    } as jest.Mocked<DialogErrorHandler>;

    dialogManager = new DialogManager(
      mockStorage,
      mockHistoryManager,
      mockErrorHandler
    );
  });

  describe('Plugin Management', () => {
    it('should register a plugin successfully', async () => {
      const mockPlugin: DialogPlugin = {
        name: 'test-plugin',
        version: '1.0.0',
        initialize: jest.fn(),
        handlers: {},
      };

      await dialogManager.registerPlugin(mockPlugin);
      expect(mockPlugin.initialize).toHaveBeenCalled();
    });

    it('should throw error when registering duplicate plugin', async () => {
      const mockPlugin: DialogPlugin = {
        name: 'test-plugin',
        version: '1.0.0',
        handlers: {},
      };

      await dialogManager.registerPlugin(mockPlugin);
      await expect(dialogManager.registerPlugin(mockPlugin)).rejects.toThrow();
    });

    it('should unregister plugin successfully', async () => {
      const mockPlugin: DialogPlugin = {
        name: 'test-plugin',
        version: '1.0.0',
        cleanup: jest.fn(),
        handlers: {},
      };

      await dialogManager.registerPlugin(mockPlugin);
      await dialogManager.unregisterPlugin('test-plugin');
      expect(mockPlugin.cleanup).toHaveBeenCalled();
    });
  });

  describe('Middleware', () => {
    it('should execute middleware in correct order', async () => {
      const executionOrder: string[] = [];
      const mockMiddleware: DialogMiddleware = {
        before: jest.fn().mockImplementation(async () => {
          executionOrder.push('before');
        }),
        after: jest.fn().mockImplementation(async () => {
          executionOrder.push('after');
        }),
      };

      const mockPlugin: DialogPlugin = {
        name: 'test-plugin',
        version: '1.0.0',
        handlers: {
          test: jest.fn().mockImplementation(async () => {
            executionOrder.push('handler');
            return { text: 'test' };
          }),
        },
      };

      dialogManager.use(mockMiddleware);
      await dialogManager.registerPlugin(mockPlugin);

      const mockState: DialogState = {
        turnCount: 0,
        lastInteractionTime: Date.now(),
        lastUpdateTime: Date.now(),
        parameters: {},
        context: {
          sessionId: '123',
          userId: 'user123',
          language: 'en',
          timestamp: Date.now(),
          metadata: {},
        },
      };

      const mockIntent: DialogIntent = {
        type: 'test',
        confidence: 1,
        parameters: {},
      };

      await dialogManager.processIntent(mockIntent, mockState);

      expect(executionOrder).toEqual(['before', 'handler', 'after']);
      expect(mockMiddleware.before).toHaveBeenCalledWith(mockState);
      expect(mockMiddleware.after).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should handle plugin errors correctly', async () => {
      const mockPlugin: DialogPlugin = {
        name: 'test-plugin',
        version: '1.0.0',
        handlers: {
          test: jest.fn().mockRejectedValue(new Error('Test error')),
        },
      };

      const mockErrorResponse: DialogResponse = {
        text: 'Error handled',
        error: {
          code: DialogErrorCode.UNKNOWN_ERROR,
          message: 'Test error',
        },
      };

      mockErrorHandler.handleError.mockResolvedValue(mockErrorResponse);

      await dialogManager.registerPlugin(mockPlugin);

      const mockState: DialogState = {
        turnCount: 0,
        lastInteractionTime: Date.now(),
        lastUpdateTime: Date.now(),
        parameters: {},
        context: {
          sessionId: '123',
          userId: 'user123',
          language: 'en',
          timestamp: Date.now(),
          metadata: {},
        },
      };

      const mockIntent: DialogIntent = {
        type: 'test',
        confidence: 1,
        parameters: {},
      };

      const response = await dialogManager.processIntent(mockIntent, mockState);
      expect(response).toEqual(mockErrorResponse);
      expect(mockErrorHandler.handleError).toHaveBeenCalled();
    });
  });

  describe('State Management', () => {
    it('should create state with correct defaults', async () => {
      const state = await dialogManager.createState({
        userId: 'test-user',
      });

      expect(state.turnCount).toBe(0);
      expect(state.context.userId).toBe('test-user');
      expect(state.context.language).toBe('en');
      expect(mockStorage.saveState).toHaveBeenCalledWith(
        state.context.sessionId,
        state
      );
    });

    it('should load state correctly', async () => {
      const mockState: DialogState = {
        turnCount: 5,
        lastInteractionTime: Date.now(),
        lastUpdateTime: Date.now(),
        parameters: {},
        context: {
          sessionId: 'test-session',
          userId: 'test-user',
          language: 'en',
          timestamp: Date.now(),
          metadata: {},
        },
      };

      mockStorage.loadState.mockResolvedValue(mockState);

      const loadedState = await dialogManager.loadState('test-session');
      expect(loadedState).toEqual(mockState);
      expect(mockStorage.loadState).toHaveBeenCalledWith('test-session');
    });

    it('should save state with updated timestamp', async () => {
      const mockState: DialogState = {
        turnCount: 5,
        lastInteractionTime: Date.now(),
        lastUpdateTime: Date.now() - 1000, // Old timestamp
        parameters: {},
        context: {
          sessionId: 'test-session',
          userId: 'test-user',
          language: 'en',
          timestamp: Date.now(),
          metadata: {},
        },
      };

      await dialogManager.saveState(mockState);
      expect(mockState.lastUpdateTime).toBeGreaterThan(mockState.lastInteractionTime);
      expect(mockStorage.saveState).toHaveBeenCalledWith(
        'test-session',
        mockState
      );
    });
  });

  describe('Cleanup', () => {
    it('should cleanup all plugins and clear middleware', async () => {
      const mockPlugin1: DialogPlugin = {
        name: 'plugin1',
        version: '1.0.0',
        cleanup: jest.fn(),
        handlers: {},
      };

      const mockPlugin2: DialogPlugin = {
        name: 'plugin2',
        version: '1.0.0',
        cleanup: jest.fn(),
        handlers: {},
      };

      const mockMiddleware: DialogMiddleware = {
        before: jest.fn(),
        after: jest.fn(),
      };

      await dialogManager.registerPlugin(mockPlugin1);
      await dialogManager.registerPlugin(mockPlugin2);
      dialogManager.use(mockMiddleware);

      await dialogManager.cleanup();

      expect(mockPlugin1.cleanup).toHaveBeenCalled();
      expect(mockPlugin2.cleanup).toHaveBeenCalled();

      // Verify plugins and middleware are cleared by trying to process an intent
      const mockState: DialogState = {
        turnCount: 0,
        lastInteractionTime: Date.now(),
        lastUpdateTime: Date.now(),
        parameters: {},
        context: {
          sessionId: '123',
          userId: 'user123',
          language: 'en',
          timestamp: Date.now(),
          metadata: {},
        },
      };

      const mockIntent: DialogIntent = {
        type: 'test',
        confidence: 1,
        parameters: {},
      };

      const response = await dialogManager.processIntent(mockIntent, mockState);
      expect(response.error?.code).toBe(DialogErrorCode.INTENT_NOT_FOUND);
    });
  });
});
