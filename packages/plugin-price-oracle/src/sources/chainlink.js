"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChainlinkSource = void 0;
const ethers_1 = require("ethers");
const types_1 = require("../types");
// Chainlink 价格预言机 ABI
const CHAINLINK_ABI = [
    'function latestRoundData() external view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)',
    'function decimals() external view returns (uint8)'
];
class ChainlinkSource {
    constructor() {
        this.name = 'chainlink';
        this.providers = new Map();
        this.priceFeeds = new Map();
        this.initializePriceFeeds();
    }
    initializePriceFeeds() {
        // ETH Mainnet 价格源
        this.addPriceFeed(types_1.ChainType.ETH, 'ETH', 'USD', '0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419');
        this.addPriceFeed(types_1.ChainType.ETH, 'BTC', 'USD', '0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88c');
        // Base 价格源
        this.addPriceFeed(types_1.ChainType.BASE, 'ETH', 'USD', '0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70');
    }
    addPriceFeed(chain, baseToken, quoteToken, address) {
        const key = this.getPairKey({ chain, baseToken, quoteToken });
        this.priceFeeds.set(key, address);
    }
    getPairKey(pair) {
        return `${pair.chain}:${pair.baseToken}/${pair.quoteToken}`;
    }
    async getPriceData(pair) {
        if (!this.isSupported(pair)) {
            throw new Error(`Pair ${pair.baseToken}/${pair.quoteToken} on ${pair.chain} not supported by Chainlink`);
        }
        const provider = await this.getProvider(pair.chain);
        const feedAddress = this.priceFeeds.get(this.getPairKey(pair));
        try {
            const priceFeed = new ethers_1.ethers.Contract(feedAddress, CHAINLINK_ABI, provider);
            const [roundData, decimals] = await Promise.all([
                priceFeed.latestRoundData(),
                priceFeed.decimals()
            ]);
            const price = parseFloat(roundData.answer.toString()) / Math.pow(10, decimals);
            return {
                pair,
                price,
                timestamp: roundData.updatedAt.toNumber() * 1000,
                source: types_1.PriceSourceType.CHAINLINK,
                confidence: 0.95,
                metadata: {
                    roundId: roundData.roundId.toString(),
                    answeredInRound: roundData.answeredInRound.toString()
                }
            };
        }
        catch (error) {
            if (error instanceof Error) {
                throw new Error(`Failed to fetch price from Chainlink: ${error.message}`);
            }
            throw new Error('Failed to fetch price from Chainlink: Unknown error');
        }
    }
    isSupported(pair) {
        return this.priceFeeds.has(this.getPairKey(pair));
    }
    getConfidence() {
        return 0.95; // Chainlink 数据源可信度较高
    }
    async getProvider(chain) {
        if (!this.providers.has(chain)) {
            const rpcUrl = this.getRpcUrl(chain);
            const provider = new ethers_1.ethers.providers.JsonRpcProvider(rpcUrl);
            this.providers.set(chain, provider);
        }
        return this.providers.get(chain);
    }
    getRpcUrl(chain) {
        switch (chain) {
            case types_1.ChainType.ETH:
                return process.env.ETH_RPC_URL || 'https://eth-mainnet.g.alchemy.com/v2/your-api-key';
            case types_1.ChainType.BASE:
                return process.env.BASE_RPC_URL || 'https://mainnet.base.org';
            default:
                throw new Error(`Unsupported chain: ${chain}`);
        }
    }
}
exports.ChainlinkSource = ChainlinkSource;
//# sourceMappingURL=chainlink.js.map