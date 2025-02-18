export interface IntentMatch {
  type: string;
  confidence: number;
  parameters: Record<string, string | number>;
}

export interface DialogIntent {
  type: string;
  confidence: number;
  parameters: Record<string, string | number>;
  alternativeMatches?: IntentMatch[];
}

export interface DialogContext {
  sessionId: string;
  userId?: string;
  language?: 'en' | 'zh';
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export interface DialogState {
  currentIntent?: DialogIntent;
  previousIntent?: DialogIntent;
  turnCount: number;
  lastInteractionTime: number;
  lastUpdateTime: number;
  parameters: Record<string, unknown>;
  context: DialogContext;
}

export interface DialogResponse {
  text: string;
  intent?: DialogIntent;
  suggestions?: string[];
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
  metadata?: Record<string, unknown>;
}

export interface DialogOptions {
  language?: 'en' | 'zh';
  maxTurns?: number;
  timeoutMs?: number;
  autoCorrect?: boolean;
  confidenceThreshold?: number;
  maxDistance?: number;
  maxSuggestions?: number;
  minSimilarity?: number;
  metadata?: Record<string, unknown>;
}

export interface DialogHistory {
  sessionId: string;
  turns: Array<{
    input: string;
    response: DialogResponse;
    timestamp: number;
    state: DialogState;
  }>;
}

export interface DialogHistoryManager {
  saveHistory: (history: DialogHistory) => Promise<void>;
  getHistory: (sessionId: string) => Promise<DialogHistory | null>;
  searchHistory: (options: DialogSearchOptions) => Promise<DialogSearchResult[]>;
  deleteHistory: (sessionId: string) => Promise<void>;
}

export interface DialogSearchOptions {
  sessionId?: string;
  fromDate?: Date;
  toDate?: Date;
  intentType?: string;
  minConfidence?: number;
  limit?: number;
  offset?: number;
}

export interface DialogSearchResult {
  sessionId: string;
  input: string;
  response: DialogResponse;
  timestamp: number;
  state: DialogState;
  score?: number;
}

export interface DialogPlugin {
  name: string;
  version: string;
  initialize?: (options?: Record<string, unknown>) => Promise<void>;
  processIntent?: (intent: DialogIntent, state: DialogState) => Promise<DialogResponse>;
  handleError?: (error: Error, state: DialogState) => Promise<DialogResponse>;
  cleanup?: () => Promise<void>;
  handlers?: {
    [key: string]: (intent: DialogIntent, state: DialogState) => Promise<DialogResponse>;
  };
}

export interface DialogMiddleware {
  before?: (state: DialogState) => Promise<void>;
  after?: (state: DialogState, response: DialogResponse) => Promise<void>;
  onError?: (error: Error, state: DialogState) => Promise<void>;
}

export interface DialogStorage {
  saveState: (sessionId: string, state: DialogState) => Promise<void>;
  loadState: (sessionId: string) => Promise<DialogState | null>;
  saveHistory: (sessionId: string, history: DialogHistory) => Promise<void>;
  loadHistory: (sessionId: string) => Promise<DialogHistory | null>;
  deleteSession: (sessionId: string) => Promise<void>;
}

export interface DialogErrorHandler {
  handleError: (error: Error, state: DialogState) => Promise<DialogResponse>;
  logError: (error: Error, context: Record<string, unknown>) => Promise<void>;
}

export enum DialogErrorCode {
  INTENT_NOT_FOUND = 'INTENT_NOT_FOUND',
  INVALID_PARAMETERS = 'INVALID_PARAMETERS',
  SESSION_TIMEOUT = 'SESSION_TIMEOUT',
  MAX_TURNS_EXCEEDED = 'MAX_TURNS_EXCEEDED',
  PLUGIN_ERROR = 'PLUGIN_ERROR',
  STORAGE_ERROR = 'STORAGE_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR'
}

export interface DialogMetrics {
  sessionId: string;
  turnCount: number;
  intentSuccess: number;
  intentFailure: number;
  averageConfidence: number;
  errorCount: number;
  startTime: number;
  endTime?: number;
  metadata?: Record<string, unknown>;
}

export interface DialogAnalytics {
  trackMetrics: (metrics: DialogMetrics) => Promise<void>;
  getSessionMetrics: (sessionId: string) => Promise<DialogMetrics | null>;
  getAggregateMetrics: (filter?: Record<string, unknown>) => Promise<{
    totalSessions: number;
    avgTurnsPerSession: number;
    successRate: number;
    avgConfidence: number;
    errorRate: number;
    avgSessionDuration: number;
  }>;
}
