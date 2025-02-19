"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createPriceOraclePlugin = createPriceOraclePlugin;
exports.initializePriceOraclePlugin = initializePriceOraclePlugin;
__exportStar(require("./types"), exports);
__exportStar(require("./price-oracle"), exports);
__exportStar(require("./sources/chainlink"), exports);
__exportStar(require("./sources/dexscreener"), exports);
__exportStar(require("./sources/pyth"), exports);
__exportStar(require("./sources/helius"), exports);
const price_oracle_1 = require("./price-oracle");
function createPriceOraclePlugin(config) {
    return new price_oracle_1.PriceOraclePlugin(config);
}
async function initializePriceOraclePlugin(manager, config) {
    const plugin = createPriceOraclePlugin(config);
    await plugin.initialize(manager);
    return plugin;
}
//# sourceMappingURL=index.js.map