import type { Config } from '@jest/types';
import baseConfig from './jest.config';

const config: Config.InitialOptions = {
  ...baseConfig,
  testMatch: [
    '**/__integration__/**/*.+(ts|tsx|js)',
    '**/?(*.)+(ispec|integration).+(ts|tsx|js)'
  ],
  testTimeout: 60000,
  maxWorkers: 1,
  globalSetup: '<rootDir>/src/__integration__/setup.ts',
  globalTeardown: '<rootDir>/src/__integration__/teardown.ts',
  setupFilesAfterEnv: [
    '<rootDir>/src/setupTests.ts',
    '<rootDir>/src/__integration__/setupIntegration.ts'
  ],
  testEnvironment: '<rootDir>/src/__integration__/environment.ts',
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70
    }
  }
};

export default config; 