import { Chain, DeFiCrawlerConfig, DeFiProtocol, DeFiDataSource } from './types';

export const DEFAULT_RISK_CONFIG = {
  auditStatus: 'pending' as const,
  insurance: false,
  centralizationRisks: [] as string[],
  securityScore: 0,
};

export const DEFAULT_CONFIG: DeFiCrawlerConfig = {
  maxConcurrency: 5,
  rateLimit: 2,
  timeout: 30000,
  retries: 3,
  sources: [],
  chunkSize: 1000,
  chunkOverlap: 200,
  metadataFields: ['website', 'twitter', 'github', 'docs'],
  cacheExpiry: 24 * 60 * 60 * 1000, // 24 hours
};

export const ETH_SOURCES: DeFiDataSource[] = [
  {
    id: 'defillama-eth',
    name: 'DeFi Llama ETH',
    chain: 'ETH',
    type: 'api',
    url: 'https://api.llama.fi/protocols',
    params: {
      chain: 'Ethereum',
    },
  },
  {
    id: 'etherscan-verified',
    name: 'Etherscan Verified Contracts',
    chain: 'ETH',
    type: 'api',
    url: 'https://api.etherscan.io/api',
    params: {
      module: 'contract',
      action: 'listverifiedcontracts',
      page: 1,
      offset: 100,
    },
    auth: {
      type: 'apiKey',
      key: '',
    },
  },
];

export const SOL_SOURCES: DeFiDataSource[] = [
  {
    id: 'defillama-sol',
    name: 'DeFi Llama Solana',
    chain: 'SOL',
    type: 'api',
    url: 'https://api.llama.fi/protocols',
    params: {
      chain: 'Solana',
    },
  },
  {
    id: 'solscan-tokens',
    name: 'Solscan Token List',
    chain: 'SOL',
    type: 'api',
    url: 'https://api.solscan.io/token/list',
    pagination: {
      type: 'offset',
      param: 'offset',
      limit: 50,
    },
  },
];

export function createEmptyProtocol(chain: Chain): DeFiProtocol {
  return {
    id: '',
    chain,
    name: '',
    contractAddress: '',
    tvl: 0,
    apy: 0,
    risks: { ...DEFAULT_RISK_CONFIG },
    liquidityPools: [],
    metadata: {},
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export function mergeConfigs(config: Partial<DeFiCrawlerConfig>): DeFiCrawlerConfig {
  return {
    ...DEFAULT_CONFIG,
    ...config,
    sources: [
      ...ETH_SOURCES,
      ...SOL_SOURCES,
      ...(config.sources || []),
    ].map(source => ({
      ...source,
      auth: source.auth ? {
        ...source.auth,
        key: config.etherscanApiKey || '',
      } : undefined,
    })),
  };
}
