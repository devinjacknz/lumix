import { PluginMetadata } from '@lumix/core';

export const metadata: PluginMetadata = {
  id: 'price-oracle',
  name: 'Price Oracle',
  version: '1.0.0',
  description: 'Multi-chain price oracle plugin with support for multiple data sources',
  author: 'Lumix Team',
  homepage: 'https://github.com/lumix/plugin-price-oracle',
  repository: 'https://github.com/lumix/plugin-price-oracle.git',
  dependencies: {
    '@lumix/core': 'workspace:*',
    '@lumix/helius': 'workspace:*'
  },
  chainSupport: ['ethereum', 'solana', 'base'],
  permissions: [
    'network.http',
    'chain.read',
    'cache.write'
  ],
  config: {
    defaultSource: 'chainlink',
    minimumConfidence: 0.8,
    cacheDuration: 60000,
    chainConfigs: {
      ethereum: {
        preferredSource: 'chainlink',
        minConfidence: 0.9,
        maxPriceDeviation: 0.1
      },
      solana: {
        preferredSource: 'pyth',
        minConfidence: 0.9,
        maxPriceDeviation: 0.1
      },
      base: {
        preferredSource: 'chainlink',
        minConfidence: 0.9,
        maxPriceDeviation: 0.1
      }
    }
  }
}; 