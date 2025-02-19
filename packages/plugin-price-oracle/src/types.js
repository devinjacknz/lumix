"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PriceSourceType = exports.ChainType = void 0;
var ChainType;
(function (ChainType) {
    ChainType["ETH"] = "ethereum";
    ChainType["SOLANA"] = "solana";
    ChainType["BASE"] = "base";
})(ChainType || (exports.ChainType = ChainType = {}));
var PriceSourceType;
(function (PriceSourceType) {
    PriceSourceType["PYTH"] = "pyth";
    PriceSourceType["CHAINLINK"] = "chainlink";
    PriceSourceType["UNISWAP"] = "uniswap";
    PriceSourceType["RAYDIUM"] = "raydium";
    PriceSourceType["BINANCE"] = "binance";
    PriceSourceType["DEXSCREENER"] = "dexscreener";
    PriceSourceType["COINGECKO"] = "coingecko";
    PriceSourceType["HELIUS"] = "helius";
    PriceSourceType["AGGREGATED"] = "aggregated";
})(PriceSourceType || (exports.PriceSourceType = PriceSourceType = {}));
//# sourceMappingURL=types.js.map