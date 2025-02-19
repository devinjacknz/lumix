"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PriceOraclePlugin = void 0;
const helius_1 = require("@lumix/helius");
const types_1 = require("./types");
const dexscreener_1 = require("./sources/dexscreener");
const pyth_1 = require("./sources/pyth");
const chainlink_1 = require("./sources/chainlink");
const helius_2 = require("./sources/helius");
const metadata_1 = require("./metadata");
class PriceOraclePlugin {
    constructor(config) {
        this.metadata = metadata_1.metadata;
        this.isEnabled = false;
        this.isLoaded = false;
        this.sources = new Map();
        this.cache = new Map();
        this.chainConfigs = new Map();
        // 默认配置
        this.minimumConfidence = config?.minimumConfidence || 0.8;
        this.cacheDuration = config?.cacheDuration || 60000; // 1分钟
        // 初始化默认数据源
        const defaultSources = [
            new dexscreener_1.DexScreenerSource(),
            new pyth_1.PythSource(),
            new chainlink_1.ChainlinkSource()
        ];
        defaultSources.forEach(source => this.addSource(source));
        // 设置默认数据源优先级
        this.defaultSource = types_1.PriceSourceType.CHAINLINK;
        // 初始化链配置
        if (config?.chainConfigs) {
            Object.entries(config.chainConfigs).forEach(([chain, conf]) => {
                this.chainConfigs.set(chain, {
                    preferredSource: conf.preferredSource || this.defaultSource,
                    minConfidence: conf.minConfidence,
                    maxPriceDeviation: conf.maxPriceDeviation
                });
            });
        }
        else {
            // 设置默认链配置
            this.chainConfigs.set(types_1.ChainType.ETH, {
                preferredSource: types_1.PriceSourceType.CHAINLINK,
                minConfidence: 0.9,
                maxPriceDeviation: 0.1
            });
            this.chainConfigs.set(types_1.ChainType.SOLANA, {
                preferredSource: types_1.PriceSourceType.PYTH,
                minConfidence: 0.9,
                maxPriceDeviation: 0.1
            });
            this.chainConfigs.set(types_1.ChainType.BASE, {
                preferredSource: types_1.PriceSourceType.CHAINLINK,
                minConfidence: 0.9,
                maxPriceDeviation: 0.1
            });
        }
    }
    // 插件生命周期方法
    async onLoad() {
        this.isLoaded = true;
    }
    async onUnload() {
        this.clearCache();
        this.sources.clear();
        this.isLoaded = false;
    }
    async onEnable() {
        this.isEnabled = true;
    }
    async onDisable() {
        this.isEnabled = false;
    }
    async onConfigChange(newConfig) {
        // 更新配置
        if (newConfig.minimumConfidence) {
            this.minimumConfidence = newConfig.minimumConfidence;
        }
        if (newConfig.cacheDuration) {
            this.cacheDuration = newConfig.cacheDuration;
        }
        if (newConfig.chainConfigs) {
            Object.entries(newConfig.chainConfigs).forEach(([chain, conf]) => {
                this.chainConfigs.set(chain, {
                    preferredSource: conf.preferredSource || this.defaultSource,
                    minConfidence: conf.minConfidence,
                    maxPriceDeviation: conf.maxPriceDeviation
                });
            });
        }
    }
    // 插件初始化
    async initialize(manager) {
        // 获取插件上下文
        this.context = manager.getPluginContext(this.metadata.id);
        this.api = this.context.api;
        this.hooks = this.context.hooks;
        this.utils = this.context.utils;
        // 初始化 Helius 客户端
        const heliusConfig = manager.getConfig('helius');
        if (heliusConfig?.apiKey) {
            this.heliusClient = new helius_1.HeliusClient({
                apiKey: heliusConfig.apiKey
            });
            // 添加 Helius 数据源
            this.addSource(new helius_2.HeliusSource(this.heliusClient));
            // 更新 Solana 链的配置
            const solanaConfig = this.chainConfigs.get(types_1.ChainType.SOLANA);
            if (solanaConfig) {
                this.chainConfigs.set(types_1.ChainType.SOLANA, {
                    ...solanaConfig,
                    alternativeSources: [
                        ...(solanaConfig.alternativeSources || []),
                        types_1.PriceSourceType.HELIUS
                    ]
                });
            }
        }
        // 注册事件处理器
        this.hooks.on('chain:block', this.handleNewBlock.bind(this));
        this.hooks.on('chain:transaction', this.handleNewTransaction.bind(this));
        // 注册 API 端点
        this.api.register('price-oracle', {
            getPrice: this.getPrice.bind(this),
            getPriceFromAllSources: this.getPriceFromAllSources.bind(this),
            getAggregatedPrice: this.getAggregatedPrice.bind(this),
            getAvailableSources: this.getAvailableSources.bind(this),
            clearCache: this.clearCache.bind(this)
        });
    }
    // 事件处理器
    async handleNewBlock(block) {
        // 处理新区块事件
        // 可以在这里更新缓存或执行其他操作
    }
    async handleNewTransaction(tx) {
        // 处理新交易事件
        // 可以在这里更新价格数据或执行其他操作
    }
    getName() {
        return 'price-oracle';
    }
    addSource(source) {
        this.sources.set(source.name, source);
    }
    removeSource(sourceName) {
        this.sources.delete(sourceName);
    }
    async getPrice(pair, sourceName) {
        // 检查缓存
        const cacheKey = `${pair.chain}:${pair.baseToken}/${pair.quoteToken}:${sourceName || 'default'}`;
        const cached = this.cache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < this.cacheDuration) {
            return cached.data;
        }
        // 获取数据源
        const source = sourceName
            ? this.sources.get(sourceName)
            : this.getPreferredSource(pair.chain);
        if (!source) {
            throw new Error(`Price source ${sourceName || this.defaultSource} not found`);
        }
        if (!source.isSupported(pair)) {
            throw new Error(`Pair ${pair.baseToken}/${pair.quoteToken} not supported by source ${source.name}`);
        }
        const priceData = await source.getPriceData(pair);
        // 验证数据
        this.validatePriceData(pair.chain, priceData);
        // 更新缓存
        this.cache.set(cacheKey, {
            data: priceData,
            timestamp: Date.now()
        });
        return priceData;
    }
    async getPriceFromAllSources(pair) {
        const promises = Array.from(this.sources.values())
            .filter(source => source.isSupported(pair))
            .map(source => source.getPriceData(pair).catch(error => ({
            error: error instanceof Error ? error.message : 'Unknown error',
            source: source.name
        })));
        const results = await Promise.all(promises);
        return results.filter(result => !('error' in result));
    }
    async getAggregatedPrice(pair) {
        const prices = await this.getPriceFromAllSources(pair);
        if (prices.length === 0) {
            throw new Error(`No valid prices found for ${pair.baseToken}/${pair.quoteToken}`);
        }
        // 计算加权平均价格
        const totalWeight = prices.reduce((sum, p) => sum + this.getSourceWeight(p.source), 0);
        const weightedPrice = prices.reduce((sum, p) => {
            return sum + (p.price * this.getSourceWeight(p.source));
        }, 0) / totalWeight;
        return {
            pair,
            price: weightedPrice,
            timestamp: Date.now(),
            source: types_1.PriceSourceType.AGGREGATED,
            confidence: this.calculateAggregatedConfidence(prices),
            metadata: {
                sources: prices.map(p => p.source)
            }
        };
    }
    getAvailableSources() {
        return Array.from(this.sources.keys());
    }
    clearCache() {
        this.cache.clear();
    }
    getPreferredSource(chain) {
        const chainConfig = this.chainConfigs.get(chain);
        const sourceName = chainConfig?.preferredSource || this.defaultSource;
        return this.sources.get(sourceName);
    }
    validatePriceData(chain, data) {
        const chainConfig = this.chainConfigs.get(chain);
        if (chainConfig && data.confidence < chainConfig.minConfidence) {
            throw new Error(`Price confidence ${data.confidence} below minimum threshold ${chainConfig.minConfidence}`);
        }
        if (data.confidence < this.minimumConfidence) {
            throw new Error(`Price confidence ${data.confidence} below global minimum threshold ${this.minimumConfidence}`);
        }
    }
    getSourceWeight(source) {
        // 定义数据源权重
        const weights = {
            [types_1.PriceSourceType.PYTH]: 0.4,
            [types_1.PriceSourceType.CHAINLINK]: 0.4,
            [types_1.PriceSourceType.HELIUS]: 0.3,
            [types_1.PriceSourceType.DEXSCREENER]: 0.2,
            [types_1.PriceSourceType.UNISWAP]: 0.3,
            [types_1.PriceSourceType.RAYDIUM]: 0.3,
            [types_1.PriceSourceType.BINANCE]: 0.3,
            [types_1.PriceSourceType.COINGECKO]: 0.2,
            [types_1.PriceSourceType.AGGREGATED]: 0
        };
        return weights[source] || 0.1;
    }
    calculateAggregatedConfidence(prices) {
        const weights = prices.map(p => this.getSourceWeight(p.source));
        const totalWeight = weights.reduce((a, b) => a + b, 0);
        return prices.reduce((sum, p, i) => {
            return sum + (p.confidence * weights[i]);
        }, 0) / totalWeight;
    }
}
exports.PriceOraclePlugin = PriceOraclePlugin;
//# sourceMappingURL=price-oracle.js.map