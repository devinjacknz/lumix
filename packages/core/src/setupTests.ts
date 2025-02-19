import '@testing-library/jest-dom';
import 'jest-canvas-mock';

// Increase timeout for all tests
jest.setTimeout(60000);

// Mock crypto for consistent testing
if (!global.crypto) {
  global.crypto = {
    randomUUID: () => '12345678-1234-1234-1234-123456789012',
    getRandomValues: (arr: Uint8Array) => {
      for (let i = 0; i < arr.length; i++) {
        arr[i] = Math.floor(Math.random() * 256);
      }
      return arr;
    }
  };
}

// Mock Web3 Worker
class Worker {
  url: string;
  onmessage: ((event: MessageEvent) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  onmessageerror: ((event: MessageEvent) => void) | null;
  
  constructor(stringUrl: string) {
    this.url = stringUrl;
    this.onmessage = null;
    this.onerror = null;
    this.onmessageerror = null;
  }
  
  postMessage(data: any) {
    setTimeout(() => {
      if (this.onmessage) {
        this.onmessage(new MessageEvent('message', {
          data: {
            processed: Array.isArray(data.dataPoints) ? data.dataPoints : [],
            aggregated: {}
          }
        }));
      }
    }, 10);
  }
  
  terminate() {}
  
  addEventListener(event: string, callback: any) {
    switch (event) {
      case 'message':
        this.onmessage = callback;
        break;
      case 'error':
        this.onerror = callback;
        break;
      case 'messageerror':
        this.onmessageerror = callback;
        break;
    }
  }
  
  removeEventListener(event: string, callback: any) {
    switch (event) {
      case 'message':
        if (this.onmessage === callback) this.onmessage = null;
        break;
      case 'error':
        if (this.onerror === callback) this.onerror = null;
        break;
      case 'messageerror':
        if (this.onmessageerror === callback) this.onmessageerror = null;
        break;
    }
  }
}

// Add Worker to global scope
global.Worker = Worker as any;

// Mock WebSocket
global.WebSocket = class WebSocket {
  url: string;
  readyState: number;
  onopen: (() => void) | null;
  
  constructor(url: string) {
    this.url = url;
    this.readyState = 1;
    this.onopen = null;
    setTimeout(() => {
      if (this.onopen) this.onopen();
    }, 0);
  }
  
  send() {}
  close() {}
} as any;

// Mock fetch
global.fetch = jest.fn(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({}),
    text: () => Promise.resolve(''),
    blob: () => Promise.resolve(new Blob()),
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(0))
  })
);

// Suppress console errors during tests
global.console = {
  ...console,
  error: jest.fn(),
  warn: jest.fn()
};

// Mock logger
const mockLogger = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
  trace: jest.fn()
};

const mockLoggerService = {
  getInstance: jest.fn().mockReturnValue({
    createLogger: jest.fn().mockReturnValue(mockLogger)
  })
};

jest.mock('./logger', () => ({
  logger: mockLoggerService.getInstance()
}));

// Mock database
const mockDb = {
  query: jest.fn().mockResolvedValue([]),
  execute: jest.fn().mockResolvedValue({ rowCount: 1 }),
  connect: jest.fn().mockResolvedValue(true),
  disconnect: jest.fn().mockResolvedValue(true)
};

jest.mock('./database', () => mockDb);

// Mock config manager
const mockConfigManager = {
  getConfig: jest.fn().mockImplementation((key) => {
    if (key === 'performance') {
      return {
        thresholds: {
          cpu: 80,
          memory: 85,
          latency: 1000,
          errorRate: 0.01
        },
        intervals: {
          collection: 5000,
          aggregation: 60000,
          optimization: 300000
        }
      };
    }
    return {};
  })
};

jest.mock('./config', () => ({
  configManager: mockConfigManager
}));

// Set test environment variables
process.env = {
  ...process.env,
  NODE_ENV: 'test',
  HELIUS_API_KEY: 'test-helius-key',
  OPENAI_API_KEY: 'test-openai-key',
  SOLANA_RPC_URL: 'https://api.testnet.solana.com',
  ETH_RPC_URL: 'https://eth-mainnet.alchemyapi.io/v2/test',
  NEBULA_API_KEY: 'test-nebula-key',
  SLACK_BOT_TOKEN: 'test-slack-token',
  TELEGRAM_BOT_TOKEN: 'test-telegram-token'
};

// Mock ResizeObserver
global.ResizeObserver = jest.fn().mockImplementation(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
}));

// Create global window object if it doesn't exist
global.window = global.window || {};

// Mock matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

// Mock IntersectionObserver
global.IntersectionObserver = jest.fn().mockImplementation(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
}));

// Mock AlertManager
const mockAlertManager = {
  createAlert: jest.fn().mockImplementation((alert) => ({
    ...alert,
    id: '12345678-1234-1234-1234-123456789012',
    timestamp: Date.now()
  })),
  updateAlertStatus: jest.fn().mockReturnValue(null),
  getAlert: jest.fn().mockReturnValue(null),
  getAllAlerts: jest.fn().mockReturnValue([]),
  getAlertsByStatus: jest.fn().mockReturnValue([]),
  getAlertsBySeverity: jest.fn().mockReturnValue([]),
  deleteAlert: jest.fn().mockReturnValue(true),
  clearAlerts: jest.fn()
};

const mockAlertManagerClass = {
  getInstance: jest.fn().mockReturnValue(mockAlertManager)
};

jest.mock('./monitoring/alerts', () => ({
  AlertManager: mockAlertManagerClass,
  AlertSeverity: {
    INFO: 'info',
    WARNING: 'warning',
    ERROR: 'error',
    CRITICAL: 'critical'
  },
  AlertStatus: {
    ACTIVE: 'active',
    RESOLVED: 'resolved',
    ACKNOWLEDGED: 'acknowledged'
  }
}));

// Mock metrics service
const mockMetricsService = {
  recordMetric: jest.fn(),
  getMetrics: jest.fn().mockReturnValue([]),
  clearMetrics: jest.fn(),
  startCollection: jest.fn(),
  stopCollection: jest.fn()
};

jest.mock('./monitoring/metrics', () => ({
  metricsService: mockMetricsService
}));

// Mock optimization history
const mockOptimizationHistory = [];

jest.mock('./monitoring/optimizer', () => ({
  getOptimizationHistory: jest.fn().mockReturnValue(mockOptimizationHistory),
  getLastOptimization: jest.fn().mockReturnValue(Date.now()),
  optimize: jest.fn().mockResolvedValue(true)
}));

// Mock alert types
jest.mock('./monitoring/types', () => ({
  AlertType: {
    OPTIMIZATION: 'optimization',
    PERFORMANCE: 'performance',
    SYSTEM: 'system'
  }
})); 