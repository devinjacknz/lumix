import { PriceData, PriceSource, TokenPair } from '../types';
export declare class DexScreenerSource implements PriceSource {
    name: string;
    private baseUrl;
    private supportedChains;
    constructor();
    getPriceData(pair: TokenPair): Promise<PriceData>;
    isSupported(pair: TokenPair): boolean;
    getConfidence(): number;
    private formatPairAddress;
}
