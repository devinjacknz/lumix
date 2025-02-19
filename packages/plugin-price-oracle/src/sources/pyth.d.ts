import { PriceData, PriceSource, TokenPair } from '../types';
export declare class PythSource implements PriceSource {
    name: string;
    private baseUrl;
    private priceFeeds;
    constructor();
    private initializePriceFeeds;
    private addPriceFeed;
    private getPairKey;
    getPriceData(pair: TokenPair): Promise<PriceData>;
    isSupported(pair: TokenPair): boolean;
    getConfidence(): number;
}
