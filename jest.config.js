/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/packages'],
  testMatch: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx'],
  collectCoverage: true,
  collectCoverageFrom: [
    'packages/*/src/**/*.ts',
    'packages/*/src/**/*.tsx',
    '!packages/*/src/**/*.d.ts',
    '!**/node_modules/**'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov'],
  moduleNameMapper: {
    '^@lumix/(.*)$': '<rootDir>/packages/$1/src',
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
    '^d3$': '<rootDir>/node_modules/d3/dist/d3.min.js',
    '^d3-(.*)$': '<rootDir>/node_modules/d3-$1/dist/d3-$1.min.js'
  },
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  transform: {
    '^.+\\.(ts|tsx)$': ['ts-jest', {
      tsconfig: 'tsconfig.jest.json',
      useESM: true,
      isolatedModules: true
    }],
    '^.+\\.(js|jsx|mjs)$': ['babel-jest', {
      presets: [
        ['@babel/preset-env', {
          targets: {
            node: 'current'
          },
          modules: 'commonjs'
        }]
      ],
      plugins: [
        '@babel/plugin-transform-modules-commonjs',
        '@babel/plugin-syntax-dynamic-import',
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
  projects: [
    {
      displayName: 'node',
      testEnvironment: 'node',
      testMatch: ['**/__tests__/**/*.test.ts'],
      transform: {
        '^.+\\.(ts|tsx)$': ['ts-jest', {
          tsconfig: 'tsconfig.jest.json',
          useESM: true,
          isolatedModules: true
        }],
        '^.+\\.(js|jsx|mjs)$': ['babel-jest', {
          presets: [
            ['@babel/preset-env', {
              targets: {
                node: 'current'
              },
              modules: 'commonjs'
            }]
          ],
          plugins: [
            '@babel/plugin-transform-modules-commonjs',
            '@babel/plugin-syntax-dynamic-import',
            '@babel/plugin-transform-runtime'
          ]
        }]
      },
      transformIgnorePatterns: [
        'node_modules/(?!(d3|d3-array|d3-scale|d3-shape|d3-time|d3-time-format|@lumix|@ethereumjs|@slack|telegraf|natural|cheerio|node-fetch|@solana|ethers|web3|@web3-js)/)'
      ]
    },
    {
      displayName: 'jsdom',
      testEnvironment: 'jsdom',
      testMatch: ['**/__tests__/**/*.test.tsx'],
      transform: {
        '^.+\\.(ts|tsx)$': ['ts-jest', {
          tsconfig: 'tsconfig.jest.json',
          useESM: true,
          isolatedModules: true
        }],
        '^.+\\.(js|jsx|mjs)$': ['babel-jest', {
          presets: [
            ['@babel/preset-env', {
              targets: {
                node: 'current'
              },
              modules: 'commonjs'
            }]
          ],
          plugins: [
            '@babel/plugin-transform-modules-commonjs',
            '@babel/plugin-syntax-dynamic-import',
            '@babel/plugin-transform-runtime'
          ]
        }]
      },
      transformIgnorePatterns: [
        'node_modules/(?!(d3|d3-array|d3-scale|d3-shape|d3-time|d3-time-format|@lumix|@ethereumjs|@slack|telegraf|natural|cheerio|node-fetch|@solana|ethers|web3|@web3-js)/)'
      ]
    }
  ]
};
