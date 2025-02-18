import { ChainType } from '../config/types';

export interface ChainAddress {
  address: string;
  publicKey: string;
  chain: ChainType;
}

export interface AddressDerivationOptions {
  network?: 'mainnet' | 'testnet' | 'devnet';
  addressType?: string;  // 例如：对于比特币可以是 'legacy' | 'segwit' | 'native-segwit'
  derivationPath?: string;
}

export interface ChainAdapter {
  getChainType(): ChainType;
  deriveAddress(privateKey: string, options?: AddressDerivationOptions): Promise<ChainAddress>;
  validateAddress(address: string): boolean;
  validatePrivateKey(privateKey: string): boolean;
  formatAddress(address: string): string;
}

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