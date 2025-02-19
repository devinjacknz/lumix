export declare enum ChainType {
    ETH = "ethereum",
    SOLANA = "solana",
    BASE = "base"
}
export declare enum PriceSourceType {
    PYTH = "pyth",
    CHAINLINK = "chainlink",
    UNISWAP = "uniswap",
    RAYDIUM = "raydium",
    BINANCE = "binance",
    DEXSCREENER = "dexscreener",
    COINGECKO = "coingecko",
    HELIUS = "helius",
    AGGREGATED = "aggregated"
}
export interface TokenPair {
    chain: ChainType;
    baseToken: string;
    quoteToken: string;
}
export interface PriceData {
    pair: TokenPair;
    price: number;
    timestamp: number;
    source: PriceSourceType;
    confidence: number;
    volume24h?: number;
    liquidityUSD?: number;
    metadata?: {
        blockNumber?: number;
        txHash?: string;
        updateInterval?: number;
        source?: string;
        roundId?: string;
        answeredInRound?: string;
    };
}
export interface PriceSource {
    name: string;
    getPriceData(pair: TokenPair): Promise<PriceData>;
    isSupported(pair: TokenPair): boolean;
    getConfidence(): number;
}
export interface PriceSourceConfig {
    type: PriceSourceType;
    chains: ChainType[];
    priority: number;
    weight: number;
    rateLimit?: {
        maxRequests: number;
        interval: number;
    };
    endpoint?: string;
    apiKey?: string;
}
export interface ChainConfig {
    preferredSource: PriceSourceType;
    alternativeSources?: PriceSourceType[];
    minConfidence: number;
    maxPriceDeviation: number;
    updateInterval?: number;
    retryAttempts?: number;
}
export interface PriceOracleConfig {
    sources?: PriceSource[];
    defaultSource?: string;
    minimumConfidence?: number;
    cacheDuration?: number;
    chainConfigs?: Record<ChainType, ChainConfig>;
    aggregationConfig?: {
        method: 'weighted' | 'median' | 'mean';
        minSources: number;
        maxDeviation: number;
    };
}
