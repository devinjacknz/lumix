export type ChainType = 'ethereum' | 'solana' | 'base';

export interface ChainAdapter {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  getAddress(options?: AddressDerivationOptions): Promise<string>;
}

export interface ChainAddress {
  address: string;
  privateKey?: string;
}

export interface AddressDerivationOptions {
  index?: number;
  path?: string;
}
