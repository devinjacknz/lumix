import { ChainProtocol } from './abstract';

export interface ChainFeature {
  name: string;
  description: string;
  isEnabled: boolean;
  params?: Record<string, any>;
}

export interface ChainMetadata {
  name: string;
  chainId: number;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
  blockTime: number;
  features: ChainFeature[];
}

export class ChainRegistry {
  private chainMetadata: Map<ChainProtocol, ChainMetadata> = new Map();
  private static instance: ChainRegistry;

  private constructor() {
    this.initializeDefaultChains();
  }

  static getInstance(): ChainRegistry {
    if (!ChainRegistry.instance) {
      ChainRegistry.instance = new ChainRegistry();
    }
    return ChainRegistry.instance;
  }

  private initializeDefaultChains() {
    // 初始化以太坊主网
    this.registerChain(ChainProtocol.EVM, {
      name: 'Ethereum Mainnet',
      chainId: 1,
      nativeCurrency: {
        name: 'Ether',
        symbol: 'ETH',
        decimals: 18,
      },
      blockTime: 12,
      features: [
        {
          name: 'EIP1559',
          description: '支持EIP-1559费用市场',
          isEnabled: true,
        },
        {
          name: 'ENS',
          description: '支持以太坊域名服务',
          isEnabled: true,
        },
      ],
    });

    // 初始化Solana主网
    this.registerChain(ChainProtocol.SOLANA, {
      name: 'Solana Mainnet',
      chainId: 1,
      nativeCurrency: {
        name: 'Solana',
        symbol: 'SOL',
        decimals: 9,
      },
      blockTime: 0.4,
      features: [
        {
          name: 'Program Composability',
          description: '支持程序可组合性',
          isEnabled: true,
        },
        {
          name: 'Proof of History',
          description: '支持历史证明',
          isEnabled: true,
        },
      ],
    });
  }

  registerChain(protocol: ChainProtocol, metadata: ChainMetadata) {
    this.chainMetadata.set(protocol, metadata);
  }

  getChainMetadata(protocol: ChainProtocol): ChainMetadata | undefined {
    return this.chainMetadata.get(protocol);
  }

  isFeatureSupported(protocol: ChainProtocol, featureName: string): boolean {
    const metadata = this.getChainMetadata(protocol);
    if (!metadata) return false;

    const feature = metadata.features.find(f => f.name === featureName);
    return feature?.isEnabled || false;
  }

  getAllSupportedChains(): ChainProtocol[] {
    return Array.from(this.chainMetadata.keys());
  }

  updateChainFeature(
    protocol: ChainProtocol,
    featureName: string,
    isEnabled: boolean,
    params?: Record<string, any>
  ): boolean {
    const metadata = this.chainMetadata.get(protocol);
    if (!metadata) return false;

    const feature = metadata.features.find(f => f.name === featureName);
    if (!feature) {
      metadata.features.push({
        name: featureName,
        description: '',
        isEnabled,
        params,
      });
    } else {
      feature.isEnabled = isEnabled;
      if (params) {
        feature.params = params;
      }
    }

    return true;
  }
} 