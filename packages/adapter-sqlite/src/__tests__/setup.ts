// Increase timeout for database operations
jest.setTimeout(10000);

// Mock console.warn to avoid noise in test output
console.warn = jest.fn();
