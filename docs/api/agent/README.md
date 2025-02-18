# Lumix Agent API Documentation

## Overview
The `@lumix/agent` package provides an intelligent agent system built on LangChain for DeFi operations. It enables natural language interaction and automated DeFi strategy execution.

## Installation
```bash
pnpm add @lumix/agent
```

## Core Components

### Agent System
The agent system provides intelligent DeFi operation capabilities:

```typescript
interface AgentConfig {
  model: string;
  temperature?: number;
  maxTokens?: number;
  tools?: Tool[];
  memory?: Memory;
}

interface Agent {
  id: string;
  name: string;
  description?: string;
  capabilities: string[];
  config: AgentConfig;
}

class DeFiAgent implements Agent {
  constructor(config: AgentConfig) {
    // Initialize agent with configuration
  }

  async execute(command: string): Promise<AgentResponse> {
    // Execute command and return response
  }

  async chat(message: string): Promise<ChatResponse> {
    // Process chat message and return response
  }
}
```

### Usage Example
```typescript
import { DeFiAgent, type AgentConfig } from '@lumix/agent';

const config: AgentConfig = {
  model: 'gpt-4',
  temperature: 0.7,
  maxTokens: 1000,
  tools: [
    new BalanceChecker(),
    new SwapExecutor(),
    new PriceChecker()
  ]
};

const agent = new DeFiAgent(config);

// Execute DeFi operation
const response = await agent.execute('Check ETH balance');

// Chat interaction
const chatResponse = await agent.chat('What is the current gas price?');
```

## Tools System
The agent package includes various DeFi operation tools:

```typescript
interface Tool {
  name: string;
  description: string;
  parameters: Schema;
  execute(params: any): Promise<ToolResponse>;
}

class BalanceChecker implements Tool {
  name = 'balance_checker';
  description = 'Check token balances for an address';
  
  async execute(params: {
    address: string;
    token?: string;
  }): Promise<ToolResponse> {
    // Check balance implementation
  }
}

class SwapExecutor implements Tool {
  name = 'swap_executor';
  description = 'Execute token swaps';
  
  async execute(params: {
    fromToken: string;
    toToken: string;
    amount: string;
    slippage?: number;
  }): Promise<ToolResponse> {
    // Swap execution implementation
  }
}
```

### Tool Usage Example
```typescript
import { BalanceChecker, SwapExecutor } from '@lumix/agent';

const balanceChecker = new BalanceChecker();
const balance = await balanceChecker.execute({
  address: '0x...',
  token: 'ETH'
});

const swapExecutor = new SwapExecutor();
const swap = await swapExecutor.execute({
  fromToken: 'ETH',
  toToken: 'USDC',
  amount: '1.0',
  slippage: 0.5
});
```

## Memory System
The agent includes a memory system for context retention:

```typescript
interface Memory {
  add(item: MemoryItem): void;
  get(key: string): MemoryItem | null;
  clear(): void;
}

interface MemoryItem {
  key: string;
  value: any;
  timestamp: Date;
  ttl?: number;
}

class ConversationMemory implements Memory {
  constructor(options: {
    maxItems?: number;
    defaultTTL?: number;
  }) {
    // Initialize memory
  }
  
  // Implementation methods
}
```

### Memory Usage Example
```typescript
import { ConversationMemory } from '@lumix/agent';

const memory = new ConversationMemory({
  maxItems: 100,
  defaultTTL: 3600 // 1 hour
});

memory.add({
  key: 'last_balance_check',
  value: {
    address: '0x...',
    balance: '1.5 ETH'
  },
  timestamp: new Date()
});

const lastCheck = memory.get('last_balance_check');
```

## Response Types
The agent package defines standard response types:

```typescript
interface AgentResponse {
  success: boolean;
  data?: any;
  error?: Error;
  metadata: {
    timestamp: Date;
    duration: number;
    toolsUsed: string[];
  };
}

interface ChatResponse {
  message: string;
  context?: any;
  confidence: number;
  metadata: {
    timestamp: Date;
    model: string;
    tokens: number;
  };
}
```

## Integration with Other Packages
The agent package integrates with other Lumix packages:

```typescript
import { DeFiAgent } from '@lumix/agent';
import { Account, AccountType } from '@lumix/core';
import { HeliusClient } from '@lumix/helius';

async function createAgentWithHelius(): Promise<DeFiAgent> {
  const helius = new HeliusClient({
    apiKey: process.env.HELIUS_API_KEY
  });

  const agent = new DeFiAgent({
    model: 'gpt-4',
    tools: [
      new BalanceChecker(helius),
      new SwapExecutor(helius)
    ]
  });

  return agent;
}
```

## Error Handling
The agent package uses the core error system:

```typescript
import { LumixError, ErrorCode } from '@lumix/core';

class AgentError extends LumixError {
  constructor(message: string, details?: any) {
    super(ErrorCode.AGENT_ERROR, message, details);
  }
}

try {
  await agent.execute('invalid command');
} catch (error) {
  if (error instanceof AgentError) {
    // Handle agent-specific error
  }
}
```

## Best Practices
1. Always initialize agents with proper configuration
2. Use appropriate tools for specific DeFi operations
3. Implement proper error handling
4. Utilize memory system for context retention
5. Monitor and optimize token usage

## Contributing
See the [Contributing Guide](../../CONTRIBUTING.md) for details on how to contribute to the agent package.

## License
MIT License - see the [LICENSE](../../LICENSE) file for details.
