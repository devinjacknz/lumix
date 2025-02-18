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

export class DialogManager {
  private plugins: Map<string, DialogPlugin>;
  private middleware: DialogMiddleware[];
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
    this.plugins = new Map();
    this.middleware = [];
    this.storage = storage;
    this.historyManager = historyManager;
    this.errorHandler = errorHandler;
    this.options = {
      language: options.language || 'en',
      maxTurns: options.maxTurns || 50,
      timeoutMs: options.timeoutMs || 30000,
      autoCorrect: options.autoCorrect ?? true,
      confidenceThreshold: options.confidenceThreshold || 0.7,
      maxDistance: options.maxDistance || 3,
      maxSuggestions: options.maxSuggestions || 5,
      minSimilarity: options.minSimilarity || 0.5,
      metadata: options.metadata || {}
    };
  }

  async registerPlugin(plugin: DialogPlugin): Promise<void> {
    if (this.plugins.has(plugin.name)) {
      throw new Error(`Plugin ${plugin.name} is already registered`);
    }
    await plugin.initialize?.(this.options.metadata);
    this.plugins.set(plugin.name, plugin);
  }

  async unregisterPlugin(pluginName: string): Promise<void> {
    const plugin = this.plugins.get(pluginName);
    if (plugin) {
      await plugin.cleanup?.();
      this.plugins.delete(pluginName);
    }
  }

  use(middleware: DialogMiddleware): void {
    this.middleware.push(middleware);
  }

  async processIntent(intent: DialogIntent, state: DialogState): Promise<DialogResponse> {
    try {
      for (const middleware of this.middleware) {
        await middleware.before?.(state);
      }

      let response: DialogResponse | null = null;

      for (const plugin of this.plugins.values()) {
        if (plugin.handlers?.[intent.type]) {
          response = await plugin.handlers[intent.type](intent, state);
          break;
        }
        if (plugin.processIntent) {
          response = await plugin.processIntent(intent, state);
          if (response) break;
        }
      }

      if (!response) {
        throw new Error(DialogErrorCode.INTENT_NOT_FOUND);
      }

      for (const middleware of this.middleware) {
        await middleware.after?.(state, response);
      }

      return response;

    } catch (error) {
      const errorResponse = await this.handleError(error as Error, state);
      return errorResponse;
    }
  }

  private async handleError(error: Error, state: DialogState): Promise<DialogResponse> {
    try {
      for (const middleware of this.middleware) {
        await middleware.onError?.(error, state);
      }

      for (const plugin of this.plugins.values()) {
        if (plugin.handleError) {
          const response = await plugin.handleError(error, state);
          if (response) return response;
        }
      }

      return await this.errorHandler.handleError(error, state);
    } catch (err) {
      const fallbackError = err as Error;
      return {
        text: "An unexpected error occurred",
        error: {
          code: DialogErrorCode.UNKNOWN_ERROR,
          message: fallbackError.message || "Unknown error occurred"
        }
      };
    }
  }

  async createState(context: Partial<DialogContext> = {}): Promise<DialogState> {
    const state: DialogState = {
      turnCount: 0,
      lastInteractionTime: Date.now(),
      lastUpdateTime: Date.now(),
      parameters: {},
      context: {
        sessionId: context.sessionId || crypto.randomUUID(),
        userId: context.userId,
        language: context.language || this.options.language,
        timestamp: Date.now(),
        metadata: context.metadata || {}
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
    for (const plugin of this.plugins.values()) {
      await plugin.cleanup?.();
    }
    this.plugins.clear();
    this.middleware = [];
  }
}
