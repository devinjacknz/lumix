"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DexScreenerSource = void 0;
const axios_1 = __importDefault(require("axios"));
const types_1 = require("../types");
class DexScreenerSource {
    constructor() {
        this.name = 'dexscreener';
        this.baseUrl = 'https://api.dexscreener.com/latest';
        this.supportedChains = new Set([
            types_1.ChainType.ETH,
            types_1.ChainType.SOLANA,
            types_1.ChainType.BASE
        ]);
    }
    async getPriceData(pair) {
        if (!this.isSupported(pair)) {
            throw new Error(`Pair ${pair.baseToken}/${pair.quoteToken} on ${pair.chain} not supported by DexScreener`);
        }
        try {
            const response = await axios_1.default.get(`${this.baseUrl}/dex/pairs/${this.formatPairAddress(pair)}`);
            const { pair: pairData } = response.data;
            if (!pairData) {
                throw new Error(`No data found for pair ${pair.baseToken}/${pair.quoteToken}`);
            }
            return {
                pair,
                price: parseFloat(pairData.priceUsd),
                timestamp: Date.now(),
                source: types_1.PriceSourceType.DEXSCREENER,
                confidence: 0.9,
                volume24h: parseFloat(pairData.volume.h24),
                liquidityUSD: parseFloat(pairData.liquidity.usd),
                metadata: {
                    updateInterval: 30000 // 30s update interval
                }
            };
        }
        catch (error) {
            throw new Error(`Failed to fetch price from DexScreener: ${error.message}`);
        }
    }
    isSupported(pair) {
        return this.supportedChains.has(pair.chain);
    }
    getConfidence() {
        return 0.9;
    }
    formatPairAddress(pair) {
        // DexScreener specific pair address formatting
        switch (pair.chain) {
            case types_1.ChainType.ETH:
                return `ethereum/${pair.baseToken}`;
            case types_1.ChainType.SOLANA:
                return `solana/${pair.baseToken}`;
            case types_1.ChainType.BASE:
                return `base/${pair.baseToken}`;
            default:
                throw new Error(`Unsupported chain: ${pair.chain}`);
        }
    }
}
exports.DexScreenerSource = DexScreenerSource;
//# sourceMappingURL=dexscreener.js.map