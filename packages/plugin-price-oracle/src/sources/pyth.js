"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PythSource = void 0;
const axios_1 = __importDefault(require("axios"));
const types_1 = require("../types");
class PythSource {
    constructor() {
        this.name = 'pyth';
        this.baseUrl = 'https://hermes-beta.pyth.network/api/latest_price_feeds';
        this.priceFeeds = new Map();
        this.initializePriceFeeds();
    }
    initializePriceFeeds() {
        // Pyth price feed IDs for common pairs
        this.addPriceFeed(types_1.ChainType.SOLANA, 'BTC', 'USD', 'e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43');
        this.addPriceFeed(types_1.ChainType.SOLANA, 'ETH', 'USD', 'ff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace');
        this.addPriceFeed(types_1.ChainType.SOLANA, 'SOL', 'USD', 'ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56e');
        // Add more pairs as needed
    }
    addPriceFeed(chain, baseToken, quoteToken, feedId) {
        const key = this.getPairKey({ chain, baseToken, quoteToken });
        this.priceFeeds.set(key, feedId);
    }
    getPairKey(pair) {
        return `${pair.chain}:${pair.baseToken}/${pair.quoteToken}`;
    }
    async getPriceData(pair) {
        if (!this.isSupported(pair)) {
            throw new Error(`Pair ${pair.baseToken}/${pair.quoteToken} not supported by Pyth`);
        }
        const feedId = this.priceFeeds.get(this.getPairKey(pair));
        if (!feedId) {
            throw new Error(`No price feed found for ${pair.baseToken}/${pair.quoteToken}`);
        }
        try {
            const response = await axios_1.default.get(`${this.baseUrl}/${feedId}`);
            const priceData = response.data;
            return {
                pair,
                price: parseFloat(priceData.price),
                timestamp: priceData.timestamp,
                source: types_1.PriceSourceType.PYTH,
                confidence: 0.95,
                metadata: {
                    blockNumber: priceData.slot,
                    updateInterval: 400 // 400ms update interval for Pyth
                }
            };
        }
        catch (error) {
            if (error instanceof Error) {
                throw new Error(`Failed to fetch price from Pyth: ${error.message}`);
            }
            throw new Error('Failed to fetch price from Pyth: Unknown error');
        }
    }
    isSupported(pair) {
        return this.priceFeeds.has(this.getPairKey(pair));
    }
    getConfidence() {
        return 0.95; // Pyth generally has high confidence due to its validator network
    }
}
exports.PythSource = PythSource;
//# sourceMappingURL=pyth.js.map