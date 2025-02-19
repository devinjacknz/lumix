import { Connection } from "@solana/web3.js";
import { HeliusConfig } from "@lumix/core";
export declare class HeliusClient {
    private config;
    private connection;
    private ws;
    private subscriptions;
    constructor(config: HeliusConfig);
    getBalance(address: string): Promise<number>;
    getTokenAccounts(walletAddress: string): Promise<any>;
    subscribeToAddress(address: string, callback: (data: any) => void): Promise<string>;
    unsubscribe(webhookId: string): Promise<void>;
    getDeFiData(protocol: string, params?: Record<string, any>): Promise<any>;
    getConnection(): Connection;
}
