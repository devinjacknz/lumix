# Lumix Helius API Documentation

## Overview
The `@lumix/helius` package provides integration with Helius blockchain data services for Solana. It enables real-time blockchain data access, transaction monitoring, and DeFi operations.

## Installation
```bash
pnpm add @lumix/helius
```

## Core Components

### Helius Client
The main client for interacting with Helius services:

```typescript
interface HeliusConfig {
  apiKey: string;
  network?: 'mainnet' | 'devnet';
  timeout?: number;
  maxRetries?: number;
}

class HeliusClient {
  constructor(config: HeliusConfig) {
    // Initialize Helius client
  }

  async getBalance(address: string): Promise<BalanceResponse> {
    // Get account balance
  }

  async getTransaction(signature: string): Promise<TransactionResponse> {
    // Get transaction details
  }

  async getTokenAccounts(owner: string): Promise<TokenAccountResponse[]> {
    // Get token accounts
  }
}
```

### Usage Example
```typescript
import { HeliusClient } from '@lumix/helius';

const helius = new HeliusClient({
  apiKey: process.env.HELIUS_API_KEY,
  network: 'mainnet'
});

// Get account balance
const balance = await helius.getBalance('address...');

// Get transaction details
const tx = await helius.getTransaction('signature...');

// Get token accounts
const tokens = await helius.getTokenAccounts('owner...');
```

## WebSocket API
Real-time blockchain data streaming:

```typescript
interface WebSocketConfig {
  apiKey: string;
  filters?: WebSocketFilter[];
  reconnectInterval?: number;
}

class HeliusWebSocket {
  constructor(config: WebSocketConfig) {
    // Initialize WebSocket connection
  }

  subscribe(addresses: string[]): void {
    // Subscribe to address updates
  }

  onTransaction(callback: (tx: Transaction) => void): void {
    // Handle incoming transactions
  }

  onAccountUpdate(callback: (update: AccountUpdate) => void): void {
    // Handle account updates
  }
}
```

### WebSocket Example
```typescript
import { HeliusWebSocket } from '@lumix/helius';

const ws = new HeliusWebSocket({
  apiKey: process.env.HELIUS_API_KEY,
  filters: ['tokenTransfer', 'tokenSwap']
});

// Subscribe to addresses
ws.subscribe(['address1...', 'address2...']);

// Handle transactions
ws.onTransaction((tx) => {
  console.log('New transaction:', tx.signature);
});

// Handle account updates
ws.onAccountUpdate((update) => {
  console.log('Account updated:', update.address);
});
```

## Enhanced APIs
Additional DeFi-specific APIs:

### Token API
```typescript
interface TokenInfo {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  supply: string;
}

class TokenAPI {
  constructor(client: HeliusClient) {
    // Initialize token API
  }

  async getTokenInfo(mint: string): Promise<TokenInfo> {
    // Get token information
  }

  async getTokenPrice(mint: string): Promise<TokenPrice> {
    // Get token price
  }

  async getTokenHolders(mint: string): Promise<TokenHolders> {
    // Get token holders
  }
}
```

### DeFi API
```typescript
interface PoolInfo {
  address: string;
  tokenA: TokenInfo;
  tokenB: TokenInfo;
  liquidity: string;
  volume24h: string;
}

class DeFiAPI {
  constructor(client: HeliusClient) {
    // Initialize DeFi API
  }

  async getPoolInfo(address: string): Promise<PoolInfo> {
    // Get pool information
  }

  async getSwapQuote(params: SwapParams): Promise<SwapQuote> {
    // Get swap quote
  }
}
```

### Enhanced API Example
```typescript
import { HeliusClient, TokenAPI, DeFiAPI } from '@lumix/helius';

const helius = new HeliusClient({
  apiKey: process.env.HELIUS_API_KEY
});

const tokenAPI = new TokenAPI(helius);
const defiAPI = new DeFiAPI(helius);

// Get token information
const tokenInfo = await tokenAPI.getTokenInfo('mint...');

// Get pool information
const poolInfo = await defiAPI.getPoolInfo('pool...');

// Get swap quote
const quote = await defiAPI.getSwapQuote({
  fromToken: 'SOL',
  toToken: 'USDC',
  amount: '1.0'
});
```

## Response Types
Standard response types for Helius APIs:

```typescript
interface BalanceResponse {
  lamports: number;
  solBalance: number;
  tokens: TokenBalance[];
}

interface TokenBalance {
  mint: string;
  amount: string;
  decimals: number;
}

interface TransactionResponse {
  signature: string;
  slot: number;
  error: boolean;
  confirmations: number;
  confirmationStatus: string;
  instructions: Instruction[];
}

interface AccountUpdate {
  address: string;
  slot: number;
  data: Buffer;
  owner: string;
  lamports: number;
}
```

## Integration with Other Packages
The Helius package integrates with other Lumix packages:

```typescript
import { HeliusClient } from '@lumix/helius';
import { DeFiAgent } from '@lumix/agent';
import { AccountType } from '@lumix/core';

async function createHeliusAgent(): Promise<DeFiAgent> {
  const helius = new HeliusClient({
    apiKey: process.env.HELIUS_API_KEY
  });

  const agent = new DeFiAgent({
    tools: [
      new BalanceChecker(helius),
      new TransactionMonitor(helius)
    ]
  });

  return agent;
}
```

## Error Handling
The Helius package uses the core error system:

```typescript
import { LumixError, ErrorCode } from '@lumix/core';

class HeliusError extends LumixError {
  constructor(message: string, details?: any) {
    super(ErrorCode.HELIUS_ERROR, message, details);
  }
}

try {
  await helius.getTransaction('invalid...');
} catch (error) {
  if (error instanceof HeliusError) {
    // Handle Helius-specific error
  }
}
```

## Rate Limiting
The client includes built-in rate limiting:

```typescript
interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
  retryAfter?: number;
}

const helius = new HeliusClient({
  apiKey: process.env.HELIUS_API_KEY,
  rateLimit: {
    maxRequests: 100,
    windowMs: 60000, // 1 minute
    retryAfter: 1000
  }
});
```

## Best Practices
1. Always use environment variables for API keys
2. Implement proper error handling
3. Use WebSocket for real-time data needs
4. Monitor rate limits
5. Cache responses when appropriate

## Contributing
See the [Contributing Guide](../../CONTRIBUTING.md) for details on how to contribute to the Helius package.

## License
MIT License - see the [LICENSE](../../LICENSE) file for details.
