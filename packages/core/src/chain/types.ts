import { ChainAdapter, ChainAddress, AddressDerivationOptions } from '@lumix/types';

export { ChainAdapter, ChainAddress, AddressDerivationOptions };

export interface NetworkConfig {
  chainId: string | number;
  rpcUrl: string;
  explorerUrl: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
}

export interface ChainConfig {
  network: NetworkConfig;
  options?: AddressDerivationOptions;
} 