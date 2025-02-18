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
