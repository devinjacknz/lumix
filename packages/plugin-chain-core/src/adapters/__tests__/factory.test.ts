import { ChainAdapterFactory } from '../factory';
import { EVMChainAdapter } from '../evm';
import { SolanaChainAdapter } from '../solana';
import { ChainConfig } from '../../types';

describe('ChainAdapterFactory', () => {
  const evmConfig: ChainConfig = {
    rpcUrl: 'https://mainnet.infura.io/v3/YOUR-PROJECT-ID',
    chainId: 1,
    name: 'Ethereum',
    nativeCurrency: {
      name: 'Ether',
      symbol: 'ETH',
      decimals: 18
    }
  };

  const solanaConfig: ChainConfig = {
    rpcUrl: 'https://api.mainnet-beta.solana.com',
    chainId: 'solana',
    name: 'Solana',
    nativeCurrency: {
      name: 'Solana',
      symbol: 'SOL',
      decimals: 9
    }
  };

  describe('create', () => {
    it('should create EVM adapter for numeric chainId', () => {
      const adapter = ChainAdapterFactory.create(evmConfig);
      expect(adapter).toBeInstanceOf(EVMChainAdapter);
    });

    it('should create Solana adapter for solana chainId', () => {
      const adapter = ChainAdapterFactory.create(solanaConfig);
      expect(adapter).toBeInstanceOf(SolanaChainAdapter);
    });
  });

  describe('createAndConnect', () => {
    it('should create and connect EVM adapter', async () => {
      const adapter = await ChainAdapterFactory.createAndConnect(evmConfig);
      expect(adapter).toBeInstanceOf(EVMChainAdapter);
    });

    it('should create and connect Solana adapter', async () => {
      const adapter = await ChainAdapterFactory.createAndConnect(solanaConfig);
      expect(adapter).toBeInstanceOf(SolanaChainAdapter);
    });

    it('should throw error for invalid config', async () => {
      const invalidConfig = {
        ...evmConfig,
        rpcUrl: 'invalid-url'
      };

      await expect(ChainAdapterFactory.createAndConnect(invalidConfig))
        .rejects
        .toThrow('Failed to create and connect chain adapter');
    });
  });
}); 