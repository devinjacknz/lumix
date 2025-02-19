/** @type {import('jest').Config} */
module.exports = {
  displayName: 'core',
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx'],
  collectCoverage: true,
  collectCoverageFrom: [
    'src/**/*.ts',
    'src/**/*.tsx',
    '!src/**/*.d.ts',
    '!src/types/**',
    '!src/setupTests.ts',
    '!src/**/index.ts'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  moduleNameMapper: {
    '^@lumix/core$': '<rootDir>/src',
    '^@lumix/core/(.*)$': '<rootDir>/src/$1'
  },
  setupFilesAfterEnv: ['<rootDir>/src/setupTests.ts'],
  transform: {
    '^.+\\.(ts|tsx|js|jsx)$': ['ts-jest', {
      tsconfig: '../../tsconfig.jest.json',
      useESM: true,
      isolatedModules: true
    }]
  },
  transformIgnorePatterns: [
    'node_modules/(?!(@solana/web3.js|uuid|jayson|bs58|superstruct|@noble|@aws-sdk|@solana/buffer-layout)/)'
  ],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  testTimeout: 60000,
  maxWorkers: 4,
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,
  testPathIgnorePatterns: ['/node_modules/', '/dist/']
};
