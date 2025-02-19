import { HeliusClient } from '@lumix/helius';
import { PriceData, PriceSource, TokenPair } from '../types';
export declare class HeliusSource implements PriceSource {
    name: string;
    private client;
    private supportedTokens;
    constructor(heliusClient: HeliusClient);
    getPriceData(pair: TokenPair): Promise<PriceData>;
    isSupported(pair: TokenPair): boolean;
    getConfidence(): number;
}
