/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx'],
  collectCoverage: true,
  collectCoverageFrom: [
    'src/**/*.ts',
    'src/**/*.tsx',
    '!src/**/*.d.ts',
    '!**/node_modules/**'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  coverageThreshold: {
    global: {
      branches: 100,
      functions: 100,
      lines: 100,
      statements: 100
    }
  },
  moduleNameMapper: {
    '^@lumix/core/(.*)$': '<rootDir>/../packages/core/src/$1',
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy'
  },
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  transform: {
    '^.+\\.(ts|tsx)$': ['ts-jest', {
      tsconfig: 'tsconfig.json'
    }],
    '^.+\\.(js|jsx|mjs)$': ['babel-jest', {
      presets: [
        ['@babel/preset-env', {
          targets: {
            node: 'current'
          }
        }]
      ],
      plugins: [
        '@babel/plugin-syntax-dynamic-import',
        '@babel/plugin-transform-modules-commonjs',
        '@babel/plugin-transform-runtime'
      ]
    }]
  },
  transformIgnorePatterns: [
    'node_modules/(?!(d3|d3-array|d3-scale|d3-shape|d3-time|d3-time-format|@lumix|@ethereumjs|@slack|telegraf|natural|cheerio|node-fetch|@solana|ethers|web3|@web3-js)/)'
  ],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node', 'mjs'],
  testEnvironmentOptions: {
    url: 'http://localhost'
  },
  moduleDirectories: ['node_modules', 'src']
};