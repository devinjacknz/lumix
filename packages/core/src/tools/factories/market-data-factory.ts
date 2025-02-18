import { ToolRegistry } from '../tool-registry';
import { MarketDataTool } from '../market-data-tool';
import { APIToolConfig } from '../config';
import { logger } from '../../monitoring';

export async function registerMarketDataTool(): Promise<void> {
  const registry = ToolRegistry.getInstance();

  // 注册工具工厂
  await registry.registerToolFactory('market_data', async (config: APIToolConfig) => {
    try {
      // 验证配置
      if (!config.baseUrl) {
        throw new Error('Market data tool requires baseUrl');
      }

      // 创建工具实例
      return new MarketDataTool(config);
    } catch (error) {
      if (error instanceof Error) {
        logger.error('Market Data Factory', `Failed to create tool: ${error.message}`);
      }
      throw error;
    }
  });

  logger.info('Market Data Factory', 'Registered market data tool factory');
} 