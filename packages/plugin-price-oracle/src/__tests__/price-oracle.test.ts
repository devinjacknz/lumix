import { PluginManager } from '@lumix/core';
import { PriceOraclePlugin } from '../price-oracle';
import { ChainType, PriceSourceType, TokenPair } from '../types';
import { DexScreenerSource } from '../sources/dexscreener';
import { PythSource } from '../sources/pyth';
import { ChainlinkSource } from '../sources/chainlink';
import { HeliusSource } from '../sources/helius';

// Mock 插件管理器
jest.mock('@lumix/core', () => ({
  PluginManager: jest.fn().mockImplementation(() => ({
    getPluginContext: jest.fn().mockReturnValue({
      api: {
        register: jest.fn()
      },
      hooks: {
        on: jest.fn()
      },
      utils: {}
    }),
    getConfig: jest.fn().mockReturnValue({
      apiKey: 'test-api-key'
    })
  }))
}));

// Mock 数据源
jest.mock('../sources/dexscreener');
jest.mock('../sources/pyth');
jest.mock('../sources/chainlink');
jest.mock('../sources/helius');

describe('PriceOraclePlugin', () => {
  let plugin: PriceOraclePlugin;
  let manager: jest.Mocked<PluginManager>;
  
  const mockPriceData = {
    pair: {
      chain: ChainType.ETH,
      baseToken: 'ETH',
      quoteToken: 'USD'
    },
    price: 2000,
    timestamp: Date.now(),
    source: PriceSourceType.CHAINLINK,
    confidence: 0.95
  };

  beforeEach(() => {
    manager = new PluginManager('') as jest.Mocked<PluginManager>;
    plugin = new PriceOraclePlugin();
    
    // Mock 数据源方法
    (DexScreenerSource as jest.Mock).mockImplementation(() => ({
      name: PriceSourceType.DEXSCREENER,
      getPriceData: jest.fn().mockResolvedValue(mockPriceData),
      isSupported: jest.fn().mockReturnValue(true),
      getConfidence: jest.fn().mockReturnValue(0.8)
    }));

    (PythSource as jest.Mock).mockImplementation(() => ({
      name: PriceSourceType.PYTH,
      getPriceData: jest.fn().mockResolvedValue(mockPriceData),
      isSupported: jest.fn().mockReturnValue(true),
      getConfidence: jest.fn().mockReturnValue(0.95)
    }));

    (ChainlinkSource as jest.Mock).mockImplementation(() => ({
      name: PriceSourceType.CHAINLINK,
      getPriceData: jest.fn().mockResolvedValue(mockPriceData),
      isSupported: jest.fn().mockReturnValue(true),
      getConfidence: jest.fn().mockReturnValue(0.95)
    }));

    (HeliusSource as jest.Mock).mockImplementation(() => ({
      name: PriceSourceType.HELIUS,
      getPriceData: jest.fn().mockResolvedValue(mockPriceData),
      isSupported: jest.fn().mockReturnValue(true),
      getConfidence: jest.fn().mockReturnValue(0.85)
    }));
  });

  describe('Plugin Lifecycle', () => {
    it('should initialize correctly', async () => {
      await plugin.initialize(manager);
      expect(plugin.isLoaded).toBeFalsy();
      expect(plugin.isEnabled).toBeFalsy();
    });

    it('should handle load lifecycle', async () => {
      await plugin.onLoad();
      expect(plugin.isLoaded).toBeTruthy();
    });

    it('should handle enable lifecycle', async () => {
      await plugin.onEnable();
      expect(plugin.isEnabled).toBeTruthy();
    });

    it('should handle disable lifecycle', async () => {
      await plugin.onEnable();
      await plugin.onDisable();
      expect(plugin.isEnabled).toBeFalsy();
    });

    it('should handle unload lifecycle', async () => {
      await plugin.onLoad();
      await plugin.onUnload();
      expect(plugin.isLoaded).toBeFalsy();
    });
  });

  describe('Price Retrieval', () => {
    const testPair: TokenPair = {
      chain: ChainType.ETH,
      baseToken: 'ETH',
      quoteToken: 'USD'
    };

    beforeEach(async () => {
      await plugin.initialize(manager);
    });

    it('should get price from default source', async () => {
      const price = await plugin.getPrice(testPair);
      expect(price).toEqual(mockPriceData);
    });

    it('should get price from specific source', async () => {
      const price = await plugin.getPrice(testPair, PriceSourceType.PYTH);
      expect(price).toEqual(mockPriceData);
    });

    it('should use cache for repeated requests', async () => {
      await plugin.getPrice(testPair);
      await plugin.getPrice(testPair);
      
      const chainlinkSource = plugin['sources'].get(PriceSourceType.CHAINLINK);
      expect(chainlinkSource.getPriceData).toHaveBeenCalledTimes(1);
    });

    it('should throw error for unsupported pair', async () => {
      const unsupportedPair = {
        chain: ChainType.ETH,
        baseToken: 'UNKNOWN',
        quoteToken: 'USD'
      };

      const chainlinkSource = plugin['sources'].get(PriceSourceType.CHAINLINK);
      (chainlinkSource.isSupported as jest.Mock).mockReturnValue(false);

      await expect(plugin.getPrice(unsupportedPair)).rejects.toThrow();
    });
  });

  describe('Multi-source Price Retrieval', () => {
    const testPair: TokenPair = {
      chain: ChainType.ETH,
      baseToken: 'ETH',
      quoteToken: 'USD'
    };

    beforeEach(async () => {
      await plugin.initialize(manager);
    });

    it('should get prices from all sources', async () => {
      const prices = await plugin.getPriceFromAllSources(testPair);
      expect(prices.length).toBeGreaterThan(0);
      expect(prices[0]).toEqual(mockPriceData);
    });

    it('should handle source errors gracefully', async () => {
      const chainlinkSource = plugin['sources'].get(PriceSourceType.CHAINLINK);
      (chainlinkSource.getPriceData as jest.Mock).mockRejectedValue(new Error('API Error'));

      const prices = await plugin.getPriceFromAllSources(testPair);
      expect(prices.length).toBe(3); // Other sources should still work
    });

    it('should calculate aggregated price correctly', async () => {
      const aggregatedPrice = await plugin.getAggregatedPrice(testPair);
      expect(aggregatedPrice.source).toBe(PriceSourceType.AGGREGATED);
      expect(aggregatedPrice.confidence).toBeGreaterThan(0);
    });
  });

  describe('Configuration', () => {
    it('should handle config changes', async () => {
      const newConfig = {
        minimumConfidence: 0.9,
        cacheDuration: 120000,
        chainConfigs: {
          [ChainType.ETH]: {
            preferredSource: PriceSourceType.CHAINLINK,
            minConfidence: 0.95,
            maxPriceDeviation: 0.05
          }
        }
      };

      await plugin.onConfigChange(newConfig);
      expect(plugin['minimumConfidence']).toBe(0.9);
      expect(plugin['cacheDuration']).toBe(120000);
    });

    it('should validate price data against config', async () => {
      const testPair: TokenPair = {
        chain: ChainType.ETH,
        baseToken: 'ETH',
        quoteToken: 'USD'
      };

      const chainlinkSource = plugin['sources'].get(PriceSourceType.CHAINLINK);
      (chainlinkSource.getPriceData as jest.Mock).mockResolvedValue({
        ...mockPriceData,
        confidence: 0.5 // Below minimum confidence
      });

      await expect(plugin.getPrice(testPair)).rejects.toThrow(/confidence.*below.*threshold/);
    });
  });

  describe('Error Handling', () => {
    it('should handle missing source errors', async () => {
      const testPair: TokenPair = {
        chain: ChainType.ETH,
        baseToken: 'ETH',
        quoteToken: 'USD'
      };

      plugin['sources'].clear();
      await expect(plugin.getPrice(testPair)).rejects.toThrow(/source.*not found/);
    });

    it('should handle network errors', async () => {
      const testPair: TokenPair = {
        chain: ChainType.ETH,
        baseToken: 'ETH',
        quoteToken: 'USD'
      };

      const chainlinkSource = plugin['sources'].get(PriceSourceType.CHAINLINK);
      (chainlinkSource.getPriceData as jest.Mock).mockRejectedValue(new Error('Network Error'));

      await expect(plugin.getPrice(testPair)).rejects.toThrow('Network Error');
    });

    it('should handle validation errors', async () => {
      const testPair: TokenPair = {
        chain: ChainType.ETH,
        baseToken: 'ETH',
        quoteToken: 'USD'
      };

      plugin['minimumConfidence'] = 0.99;
      await expect(plugin.getPrice(testPair)).rejects.toThrow(/confidence.*threshold/);
    });
  });
}); 
}); 