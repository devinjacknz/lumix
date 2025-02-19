"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HeliusClient = void 0;
const web3_js_1 = require("@solana/web3.js");
class HeliusClient {
    constructor(config) {
        this.config = config;
        this.ws = null;
        const endpoint = config.endpoint || "https://api.helius-rpc.com";
        this.connection = new web3_js_1.Connection(`${endpoint}/${config.apiKey}`);
        this.subscriptions = new Map();
    }
    async getBalance(address) {
        try {
            const pubkey = new web3_js_1.PublicKey(address);
            const balance = await this.connection.getBalance(pubkey);
            return balance / 10 ** 9; // Convert lamports to SOL
        }
        catch (error) {
            throw new AgentError(`Failed to get balance: ${error.message}`, "BALANCE_ERROR");
        }
    }
    async getTokenAccounts(walletAddress) {
        try {
            const response = await fetch(`https://api.helius-rpc.com/${this.config.apiKey}/token-accounts?wallet=${walletAddress}`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return await response.json();
        }
        catch (error) {
            throw new AgentError(`Failed to get token accounts: ${error.message}`, "TOKEN_ACCOUNTS_ERROR");
        }
    }
    async subscribeToAddress(address, callback) {
        if (!this.config.webhookUrl) {
            throw new AgentError("Webhook URL is required for monitoring", "CONFIG_ERROR");
        }
        try {
            const response = await fetch(`https://api.helius-rpc.com/${this.config.apiKey}/webhook`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    webhookURL: this.config.webhookUrl,
                    accountAddresses: [address],
                    type: "enhanced",
                }),
            });
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const { webhookId } = await response.json();
            this.subscriptions.set(webhookId, callback);
            return webhookId;
        }
        catch (error) {
            throw new AgentError(`Failed to subscribe: ${error.message}`, "SUBSCRIPTION_ERROR");
        }
    }
    async unsubscribe(webhookId) {
        try {
            await fetch(`https://api.helius-rpc.com/${this.config.apiKey}/webhook/${webhookId}`, { method: "DELETE" });
            this.subscriptions.delete(webhookId);
        }
        catch (error) {
            throw new AgentError(`Failed to unsubscribe: ${error.message}`, "UNSUBSCRIBE_ERROR");
        }
    }
    async getDeFiData(protocol, params = {}) {
        try {
            const queryString = new URLSearchParams(params).toString();
            const response = await fetch(`https://api.helius-rpc.com/${this.config.apiKey}/defi/${protocol}?${queryString}`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return await response.json();
        }
        catch (error) {
            throw new AgentError(`Failed to get DeFi data: ${error.message}`, "DEFI_DATA_ERROR");
        }
    }
    getConnection() {
        return this.connection;
    }
}
exports.HeliusClient = HeliusClient;
//# sourceMappingURL=client.js.map