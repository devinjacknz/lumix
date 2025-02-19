import { PriceData, PriceSource, TokenPair } from '../types';
export declare class ChainlinkSource implements PriceSource {
    name: string;
    private providers;
    private priceFeeds;
    constructor();
    private initializePriceFeeds;
    private addPriceFeed;
    private getPairKey;
    getPriceData(pair: TokenPair): Promise<PriceData>;
    isSupported(pair: TokenPair): boolean;
    getConfidence(): number;
    private getProvider;
    private getRpcUrl;
}
