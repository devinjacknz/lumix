import { Plugin, PluginManager, PluginMetadata } from './plugin-manager';
import { PriceOraclePlugin } from '@lumix/plugin-price-oracle';
import { DeFiCrawlerPlugin } from '@lumix/plugin-defi-crawler';
import { TokenAnalyzerPlugin } from '@lumix/plugin-token-analyzer';
import { NebulaPlugin } from '@lumix/plugin-nebula';
import { ChainAdapterFactory } from '@lumix/plugin-chain-core';

export class PluginRegistry {
  private static instance: PluginRegistry;
  private manager: PluginManager;
  private plugins: Map<string, Plugin>;

  private constructor() {
    this.manager = new PluginManager('./plugins');
    this.plugins = new Map();
  }

  public static getInstance(): PluginRegistry {
    if (!PluginRegistry.instance) {
      PluginRegistry.instance = new PluginRegistry();
    }
    return PluginRegistry.instance;
  }

  public async initialize(config: {
    heliusApiKey?: string;
    ethRpcUrl?: string;
    solanaRpcUrl?: string;
    baseRpcUrl?: string;
    openAiApiKey?: string;
  }): Promise<void> {
    try {
      // 初始化链适配器
      const chainConfigs = {
        ethereum: {
          rpcUrl: config.ethRpcUrl || 'https://eth-mainnet.g.alchemy.com/v2/your-api-key',
          chainId: 1,
          name: 'Ethereum'
        },
        solana: {
          rpcUrl: config.solanaRpcUrl || 'https://api.mainnet-beta.solana.com',
          chainId: 'solana',
          name: 'Solana'
        },
        base: {
          rpcUrl: config.baseRpcUrl || 'https://mainnet.base.org',
          chainId: 8453,
          name: 'Base'
        }
      };

      // 初始化价格预言机插件
      const priceOracle = new PriceOraclePlugin({
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
      });

      // 初始化 DeFi 爬虫插件
      const defiCrawler = new DeFiCrawlerPlugin({
        chains: ['ethereum', 'solana', 'base'],
        protocols: [],
        interval: 60000,
        maxConcurrency: 5,
        dataProviders: {
          defiLlama: true,
          coingecko: true
        }
      });

      // 初始化 Token 分析器插件
      const tokenAnalyzer = new TokenAnalyzerPlugin({
        rpcUrl: config.solanaRpcUrl || 'https://api.mainnet-beta.solana.com'
      });

      // 初始化 Nebula 插件
      const nebula = new NebulaPlugin({
        apiKey: config.openAiApiKey || ''
      });

      // 注册所有插件
      await this.registerPlugin(priceOracle);
      await this.registerPlugin(defiCrawler);
      await this.registerPlugin(tokenAnalyzer);
      await this.registerPlugin(nebula);

      // 初始化插件管理器
      await this.manager.loadPlugins();

    } catch (error) {
      console.error('Failed to initialize plugin registry:', error);
      throw error;
    }
  }

  public async registerPlugin(plugin: Plugin): Promise<void> {
    if (this.plugins.has(plugin.metadata.id)) {
      throw new Error(`Plugin ${plugin.metadata.id} already registered`);
    }

    try {
      // 初始化插件
      await plugin.initialize(this.manager);
      
      // 存储插件实例
      this.plugins.set(plugin.metadata.id, plugin);
      
      // 启用插件
      if (plugin.onEnable) {
        await plugin.onEnable();
      }
    } catch (error) {
      console.error(`Failed to register plugin ${plugin.metadata.id}:`, error);
      throw error;
    }
  }

  public async unregisterPlugin(pluginId: string): Promise<void> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) {
      return;
    }

    try {
      // 禁用插件
      if (plugin.onDisable) {
        await plugin.onDisable();
      }

      // 卸载插件
      if (plugin.onUnload) {
        await plugin.onUnload();
      }

      // 移除插件实例
      this.plugins.delete(pluginId);
    } catch (error) {
      console.error(`Failed to unregister plugin ${pluginId}:`, error);
      throw error;
    }
  }

  public getPlugin<T extends Plugin>(pluginId: string): T | undefined {
    return this.plugins.get(pluginId) as T;
  }

  public getPlugins(): Plugin[] {
    return Array.from(this.plugins.values());
  }

  public getEnabledPlugins(): Plugin[] {
    return Array.from(this.plugins.values()).filter(p => p.isEnabled);
  }

  public async shutdown(): Promise<void> {
    // 按依赖顺序反向卸载插件
    const plugins = Array.from(this.plugins.values()).reverse();
    for (const plugin of plugins) {
      await this.unregisterPlugin(plugin.metadata.id);
    }
  }
} 