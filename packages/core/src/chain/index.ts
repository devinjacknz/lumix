export { ChainAdapter, ChainAddress, AddressDerivationOptions } from './types';
export * from './solana-adapter';
export * from './ethereum-adapter';
export * from './adapter-factory';

// 导出链适配器工厂单例
import { ChainAdapterFactory } from './adapter-factory';
export const chainAdapterFactory = ChainAdapterFactory.getInstance(); 