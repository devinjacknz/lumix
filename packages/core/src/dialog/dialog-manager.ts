import {
  DialogState,
  DialogIntent,
  DialogResponse,
  DialogContext,
  DialogOptions,
  DialogPlugin,
  DialogMiddleware,
  DialogStorage,
  DialogHistoryManager,
  DialogErrorHandler,
  DialogErrorCode
} from './types';
import { v4 as uuidv4 } from 'uuid';

export class DialogManager {
  private plugins: DialogPlugin[] = [];
  private middleware: DialogMiddleware[] = [];
  private storage: DialogStorage;
  private historyManager: DialogHistoryManager;
  private errorHandler: DialogErrorHandler;
  private options: Required<DialogOptions>;

  constructor(
    storage: DialogStorage,
    historyManager: DialogHistoryManager,
    errorHandler: DialogErrorHandler,
    options: DialogOptions = {}
  ) {
    this.storage = storage;
    this.historyManager = historyManager;
    this.errorHandler = errorHandler;
    this.options = {
      language: options.language || 'en',
      maxTurns: options.maxTurns || 100,
      timeoutMs: options.timeoutMs || 30000,
      autoCorrect: options.autoCorrect ?? true,
      confidenceThreshold: options.confidenceThreshold || 0.5,
      maxDistance: options.maxDistance || 3,
      maxSuggestions: options.maxSuggestions || 5,
      minSimilarity: options.minSimilarity || 0.7,
      metadata: options.metadata || {}
    };
  }

  registerPlugin(plugin: DialogPlugin): void {
    this.plugins.push(plugin);
  }

  use(middleware: DialogMiddleware): void {
    this.middleware.push(middleware);
  }

  async processIntent(intent: DialogIntent, state: DialogState): Promise<DialogResponse> {
    try {
      for (const middleware of this.middleware) {
        await middleware.before?.(state);
      }

      const plugin = this.plugins.find(p => p.processIntent);
      if (!plugin) {
        throw new Error('No plugin found to process intent');
      }

      const response = await plugin.processIntent(intent, state);

      state.currentIntent = intent;
      state.previousIntent = state.currentIntent;
      state.turnCount++;
      state.lastInteractionTime = Date.now();
      state.lastUpdateTime = Date.now();

      await this.storage.saveState(state.context.sessionId, state);

      for (const middleware of this.middleware.reverse()) {
        await middleware.after?.(state, response);
      }

      return response;
    } catch (error) {
      for (const middleware of this.middleware) {
        await middleware.onError?.(error as Error, state);
      }

      await this.errorHandler.logError(error as Error, {
        sessionId: state.context.sessionId,
        intent,
        state
      });

      return this.errorHandler.handleError(error as Error, state);
    }
  }

  async createState(context: Partial<DialogContext> = {}): Promise<DialogState> {
    const state: DialogState = {
      turnCount: 0,
      lastInteractionTime: Date.now(),
      lastUpdateTime: Date.now(),
      parameters: {},
      context: {
        sessionId: context.sessionId || uuidv4(),
        userId: context.userId,
        language: context.language || this.options.language,
        timestamp: Date.now(),
        metadata: context.metadata
      }
    };
    await this.storage.saveState(state.context.sessionId, state);
    return state;
  }

  async loadState(sessionId: string): Promise<DialogState | null> {
    return await this.storage.loadState(sessionId);
  }

  async saveState(state: DialogState): Promise<void> {
    state.lastUpdateTime = Date.now();
    await this.storage.saveState(state.context.sessionId, state);
  }

  async cleanup(): Promise<void> {
    for (const plugin of this.plugins) {
      await plugin.cleanup?.();
    }
    this.plugins = [];
    this.middleware = [];
  }
}
