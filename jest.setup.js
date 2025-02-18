require('@testing-library/jest-dom');
require('jest-canvas-mock');

// Increase timeout for all tests
jest.setTimeout(30000);

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

// Mock crypto.randomUUID for consistent testing
if (!global.crypto) {
  global.crypto = {
    randomUUID: () => '12345678-1234-1234-1234-123456789012'
  };
}

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

// Suppress console errors during tests
console.error = jest.fn();

// Mock window.matchMedia
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
    dispatchEvent: jest.fn()
  }))
});
