export * from './types';
export * from './price-oracle';
export * from './sources/chainlink';
export * from './sources/dexscreener';
export * from './sources/pyth';
export * from './sources/helius';

// 导出插件实例创建函数
import { PluginManager } from '@lumix/core';
import { PriceOraclePlugin } from './price-oracle';
import { PriceOracleConfig } from './types';

export function createPriceOraclePlugin(
  config?: PriceOracleConfig
): PriceOraclePlugin {
  return new PriceOraclePlugin(config);
}

export async function initializePriceOraclePlugin(
  manager: PluginManager,
  config?: PriceOracleConfig
): Promise<PriceOraclePlugin> {
  const plugin = createPriceOraclePlugin(config);
  await plugin.initialize(manager);
  return plugin;
} 