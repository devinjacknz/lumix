/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  transform: {
    '^.+\\.tsx?$': ['@swc/jest'],
  },
  moduleNameMapper: {
    '^@lumix/(.*)$': '<rootDir>/../$1/src',
  },
  coveragePathIgnorePatterns: [
    '/node_modules/',
    '/__tests__/',
  ],
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/setup.ts'],
};
