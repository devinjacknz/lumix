require('@testing-library/jest-dom');
require('jest-canvas-mock');

// Increase timeout for all tests
jest.setTimeout(60000);

// Global test setup
beforeAll(() => {
  // Add any global setup here
});

// Global test teardown
afterAll(() => {
  // Add any global cleanup here
});

// Mock environment variables
process.env.HELIUS_API_KEY = 'test-helius-key';
process.env.OPENAI_API_KEY = 'test-openai-key';
process.env.SOLANA_RPC_URL = 'https://api.testnet.solana.com';
process.env.ETH_RPC_URL = 'https://eth-mainnet.alchemyapi.io/v2/test';
process.env.NEBULA_API_KEY = 'test-nebula-key';
process.env.SLACK_BOT_TOKEN = 'test-slack-token';
process.env.TELEGRAM_BOT_TOKEN = 'test-telegram-token';

// Mock crypto.randomUUID for consistent testing
if (!global.crypto) {
  global.crypto = {
    randomUUID: () => '12345678-1234-1234-1234-123456789012',
    getRandomValues: (arr) => {
      for (let i = 0; i < arr.length; i++) {
        arr[i] = Math.floor(Math.random() * 256);
      }
      return arr;
    }
  };
}

// Mock Web3 Worker
class Worker {
  constructor(stringUrl) {
    this.url = stringUrl;
    this.onmessage = null;
    this.onerror = null;
    this.onmessageerror = null;
    this.postMessage = jest.fn((data) => {
      // Simulate worker processing
      setTimeout(() => {
        if (this.onmessage) {
          this.onmessage({ data: { 
            processed: Array.isArray(data.dataPoints) ? data.dataPoints : [],
            aggregated: {}
          }});
        }
      }, 10);
    });
    this.terminate = jest.fn();
  }
  
  addEventListener(event, callback) {
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
  
  removeEventListener(event, callback) {
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

  dispatchEvent(event) {
    switch (event.type) {
      case 'message':
        if (this.onmessage) this.onmessage(event);
        break;
      case 'error':
        if (this.onerror) this.onerror(event);
        break;
      case 'messageerror':
        if (this.onmessageerror) this.onmessageerror(event);
        break;
    }
    return true;
  }
}

// Add Worker to global scope
global.Worker = Worker;

// Mock window.matchMedia for React components
if (typeof window !== 'undefined') {
  window.matchMedia = window.matchMedia || function() {
    return {
      matches: false,
      addListener: function() {},
      removeListener: function() {}
    };
  };
}

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

// Mock WebSocket
global.WebSocket = class WebSocket {
  constructor(url) {
    this.url = url;
    this.readyState = 1;
    setTimeout(() => {
      if (this.onopen) this.onopen();
    }, 0);
  }
  send() {}
  close() {}
};

// Suppress console errors during tests
global.console = {
  ...console,
  error: jest.fn(),
  warn: jest.fn()
};

// Mock D3 modules
jest.mock('d3', () => {
  const d3 = jest.requireActual('d3');
  return {
    ...d3,
    select: jest.fn(() => ({
      append: jest.fn().mockReturnThis(),
      attr: jest.fn().mockReturnThis(),
      style: jest.fn().mockReturnThis(),
      text: jest.fn().mockReturnThis()
    }))
  };
});

// Set up global test environment
global.ResizeObserver = jest.fn().mockImplementation(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn()
}));

// Mock logger
const mockLogger = {
  getInstance: jest.fn().mockReturnValue({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    trace: jest.fn(),
    child: jest.fn().mockReturnThis(),
    setLevel: jest.fn(),
    getLevel: jest.fn().mockReturnValue('info'),
    isLevelEnabled: jest.fn().mockReturnValue(true),
    addTransport: jest.fn(),
    removeTransport: jest.fn(),
    clearTransports: jest.fn(),
    format: jest.fn().mockReturnThis(),
    timestamp: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    prettyPrint: jest.fn().mockReturnThis(),
    colorize: jest.fn().mockReturnThis(),
    label: jest.fn().mockReturnThis()
  }),
  createLogger: jest.fn().mockReturnValue({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    trace: jest.fn()
  })
};

// Mock all logger imports
jest.mock('@lumix/core/logger', () => mockLogger);
jest.mock('winston', () => ({
  createLogger: jest.fn().mockReturnValue(mockLogger.getInstance()),
  format: {
    timestamp: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    prettyPrint: jest.fn().mockReturnThis(),
    colorize: jest.fn().mockReturnThis(),
    label: jest.fn().mockReturnThis(),
    combine: jest.fn().mockReturnThis()
  },
  transports: {
    Console: jest.fn(),
    File: jest.fn()
  }
}));

// Mock database
const mockDb = {
  query: jest.fn().mockResolvedValue([]),
  execute: jest.fn().mockResolvedValue({ rowCount: 1 }),
  connect: jest.fn().mockResolvedValue(true),
  disconnect: jest.fn().mockResolvedValue(true)
};

// Mock common modules
jest.mock('@lumix/core/logger', () => mockLogger);
jest.mock('@lumix/core/database', () => mockDb);
jest.mock('@solana/web3.js');
jest.mock('web3');
jest.mock('@slack/web-api');
jest.mock('telegraf');
jest.mock('node-fetch');

// Mock process.env
process.env = {
  ...process.env,
  NODE_ENV: 'test'
};
